import * as grpc from "@grpc/grpc-js";
import {
  CorrelationFieldMaxLength,
  CorrelationHeaderNames,
  type CorrelationFields,
} from "@notes/shared-types";

export function extractOptionalMetadata(
  call: grpc.ServerUnaryCall<unknown, unknown>,
  key: string,
  maxLength: number,
): string | undefined {
  const value = call.metadata.get(key)[0];
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  if (normalized === "") {
    return undefined;
  }

  return normalized.slice(0, maxLength);
}

export function extractUserId(call: grpc.ServerUnaryCall<unknown, unknown>): string | undefined {
  return extractOptionalMetadata(call, CorrelationHeaderNames.userId, CorrelationFieldMaxLength.userId);
}

export function extractCorrelationFields(call: grpc.ServerUnaryCall<unknown, unknown>): CorrelationFields {
  const correlation: CorrelationFields = {};

  const userId = extractOptionalMetadata(call, CorrelationHeaderNames.userId, CorrelationFieldMaxLength.userId);
  if (userId !== undefined) {
    correlation.userId = userId;
  }

  const sessionId = extractOptionalMetadata(call, CorrelationHeaderNames.sessionId, CorrelationFieldMaxLength.sessionId);
  if (sessionId !== undefined) {
    correlation.sessionId = sessionId;
  }

  const clientIp = extractOptionalMetadata(call, CorrelationHeaderNames.clientIp, CorrelationFieldMaxLength.clientIp);
  if (clientIp !== undefined) {
    correlation.clientIp = clientIp;
  }

  const userAgent = extractOptionalMetadata(call, CorrelationHeaderNames.userAgent, CorrelationFieldMaxLength.userAgent);
  if (userAgent !== undefined) {
    correlation.userAgent = userAgent;
  }

  const requestId = extractOptionalMetadata(call, CorrelationHeaderNames.requestId, CorrelationFieldMaxLength.requestId);
  if (requestId !== undefined) {
    correlation.requestId = requestId;
  }

  return correlation;
}
