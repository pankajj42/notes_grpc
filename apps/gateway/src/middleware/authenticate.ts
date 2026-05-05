import { createAuthServiceClient } from "@notes/grpc-clients";
import { ErrorCodes, type AccessTokenPayload, type PublicKeyResponse } from "@notes/shared-types";
import type { NextFunction, Request, Response } from "express";
import type * as grpc from "@grpc/grpc-js";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { config } from "../config.js";
import { AppError } from "./errorHandler.js";

// Extends the jsonwebtoken base type with our specific claims.
type DecodedAccessToken = JwtPayload & AccessTokenPayload;

let cachedPublicKeyPem: string | undefined;

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = getBearerToken(req.headers.authorization);
    if (token === undefined) {
      throw new AppError(ErrorCodes.UNAUTHENTICATED);
    }

    const payload = await verifyWithCachedKey(token);
    req.user = {
      userId: payload.sub,
      sessionId: payload.sid,
    };

    next();
  } catch {
    next(new AppError(ErrorCodes.UNAUTHENTICATED));
  }
}

async function verifyWithCachedKey(token: string): Promise<DecodedAccessToken> {
  const initialKey = cachedPublicKeyPem ?? (await fetchAndCachePublicKey());

  try {
    return verifyToken(token, initialKey);
  } catch {
    // Retry once with a freshly fetched key to support key rotation.
    const refreshedKey = await fetchAndCachePublicKey();
    return verifyToken(token, refreshedKey);
  }
}

function verifyToken(token: string, publicKeyPem: string): DecodedAccessToken {
  const decoded = jwt.verify(token, publicKeyPem, {
    algorithms: ["RS256"],
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
  });

  if (typeof decoded === "string") {
    throw new Error("JWT payload must be an object");
  }

  const subject = decoded.sub;
  if (typeof subject !== "string" || subject.length === 0) {
    throw new Error("JWT subject claim is required");
  }

  const sessionId = decoded.sid;
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    throw new Error("JWT sid claim is required");
  }

  return {
    ...decoded,
    sub: subject,
    sid: sessionId,
  };
}

async function fetchAndCachePublicKey(): Promise<string> {
  const publicKey = await fetchPublicKey();
  cachedPublicKeyPem = publicKey;
  return publicKey;
}

async function fetchPublicKey(): Promise<string> {
  const client = createAuthServiceClient(config.authServiceUrl);

  try {
    const response = await new Promise<PublicKeyResponse>((resolve, reject) => {
      client.GetPublicKey({}, (error: grpc.ServiceError | null, payload: unknown) => {
        if (error != null) {
          reject(error);
          return;
        }

        if (
          typeof payload !== "object" ||
          payload === null ||
          !("publicKey" in payload) ||
          typeof payload.publicKey !== "string"
        ) {
          reject(new Error("Invalid GetPublicKey response payload"));
          return;
        }

        resolve(payload as PublicKeyResponse);
      });
    });

    if (response.publicKey.trim().length === 0) {
      throw new Error("GetPublicKey returned an empty key");
    }

    return response.publicKey;
  } finally {
    client.close();
  }
}

function getBearerToken(authorizationHeader: string | undefined): string | undefined {
  if (authorizationHeader === undefined) {
    return undefined;
  }

  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme !== "Bearer" || token === undefined || token.trim() === "") {
    return undefined;
  }

  return token.trim();
}