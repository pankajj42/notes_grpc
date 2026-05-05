export const CorrelationHeaderNames = {
  userId: "x-user-id",
  sessionId: "x-session-id",
  clientIp: "x-client-ip",
  userAgent: "x-user-agent",
  requestId: "x-request-id",
} as const;

export const CorrelationFieldMaxLength = {
  userId: 36,
  sessionId: 36,
  clientIp: 64,
  userAgent: 512,
  requestId: 128,
} as const;

export interface CorrelationFields {
  userId?: string;
  sessionId?: string;
  clientIp?: string;
  userAgent?: string;
  requestId?: string;
}