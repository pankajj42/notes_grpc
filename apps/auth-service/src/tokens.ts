import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "./config";
import { getSigningKeyPair } from "./keys";

type JwtExpiresIn = Exclude<jwt.SignOptions["expiresIn"], undefined>;

const jwtSignOptions: jwt.SignOptions = {
  algorithm: "RS256",
  issuer: config.jwtIssuer,
  audience: config.jwtAudience,
  expiresIn: config.jwtAccessTtl as JwtExpiresIn,
};

export function signAccessToken(userId: string, sessionId: string): string {
  const keyPair = getSigningKeyPair();

  return jwt.sign(
    { sid: sessionId },
    keyPair.privateKeyPem,
    {
      ...jwtSignOptions,
      subject: userId,
    },
  );
}

export function generateRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}
