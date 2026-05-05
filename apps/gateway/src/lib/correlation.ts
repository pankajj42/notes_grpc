import { randomUUID } from "node:crypto";
import * as grpc from "@grpc/grpc-js";
import {
  CorrelationFieldMaxLength,
  CorrelationHeaderNames,
  type CorrelationFields,
} from "@notes/shared-types";
import { type Request } from "express";

interface AuthIdentity {
  userId?: string;
  sessionId?: string;
}

export function createCorrelationMetadata(req: Request, identity?: AuthIdentity, requestId?: string): grpc.Metadata {
  const metadata = new grpc.Metadata();

  const correlation: CorrelationFields = {};
  const userId = normalize(identity?.userId, CorrelationFieldMaxLength.userId);
  if (userId !== undefined) {
    correlation.userId = userId;
  }

  const sessionId = normalize(identity?.sessionId, CorrelationFieldMaxLength.sessionId);
  if (sessionId !== undefined) {
    correlation.sessionId = sessionId;
  }

  const clientIp = getClientIpFromRequest(req);
  if (clientIp !== undefined) {
    correlation.clientIp = clientIp;
  }

  const userAgent = normalize(req.get("user-agent"), CorrelationFieldMaxLength.userAgent);
  if (userAgent !== undefined) {
    correlation.userAgent = userAgent;
  }

  correlation.requestId = requestId ?? getRequestIdFromRequest(req);

  setIfDefined(metadata, CorrelationHeaderNames.userId, correlation.userId);
  setIfDefined(metadata, CorrelationHeaderNames.sessionId, correlation.sessionId);
  setIfDefined(metadata, CorrelationHeaderNames.clientIp, correlation.clientIp);
  setIfDefined(metadata, CorrelationHeaderNames.userAgent, correlation.userAgent);
  setIfDefined(metadata, CorrelationHeaderNames.requestId, correlation.requestId);

  return metadata;
}

export function getRequestIdFromRequest(req: Request): string {
  const incoming = normalize(req.get(CorrelationHeaderNames.requestId), CorrelationFieldMaxLength.requestId);
  return incoming ?? randomUUID();
}

export function getClientIpFromRequest(req: Request): string | undefined {
  const forwardedFor = normalize(req.get("x-forwarded-for"), CorrelationFieldMaxLength.clientIp);
  if (forwardedFor !== undefined) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first !== "") {
      return first?.slice(0, CorrelationFieldMaxLength.clientIp);
    }
  }
  return normalize(req.ip, CorrelationFieldMaxLength.clientIp);
}

function normalize(value: string | string[] | undefined, maxLength: number): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  if (trimmed === "") {
    return undefined;
  }
  return trimmed.slice(0, maxLength);
}

function setIfDefined(metadata: grpc.Metadata, key: string, value: string | undefined): void {
  if (value !== undefined) {
    metadata.set(key, value);
  }
}