import { describe, expect, it } from "vitest";
import { CorrelationHeaderNames } from "@notes/shared-types";
import { createCorrelationMetadata, getClientIpFromRequest, getRequestIdFromRequest } from "./correlation.js";

function makeRequest(input: {
  headers?: Record<string, string | undefined>;
  ip?: string;
}) {
  const headers = input.headers ?? {};

  return {
    ip: input.ip,
    get: (name: string) => headers[name.toLowerCase()] ?? headers[name],
  } as unknown as Parameters<typeof getRequestIdFromRequest>[0];
}

describe("correlation helpers", () => {
  it("uses incoming request id when provided", () => {
    const req = makeRequest({ headers: { [CorrelationHeaderNames.requestId]: "req-123" } });

    const requestId = getRequestIdFromRequest(req);

    expect(requestId).toBe("req-123");
  });

  it("extracts first client ip from x-forwarded-for", () => {
    const req = makeRequest({ headers: { "x-forwarded-for": "10.0.0.1, 10.0.0.2" }, ip: "127.0.0.1" });

    const clientIp = getClientIpFromRequest(req);

    expect(clientIp).toBe("10.0.0.1");
  });

  it("creates metadata with identity and request values", () => {
    const req = makeRequest({
      headers: {
        "user-agent": "Mozilla/5.0",
        "x-forwarded-for": "10.10.10.10",
      },
      ip: "127.0.0.1",
    });

    const metadata = createCorrelationMetadata(
      req,
      { userId: "user-1", sessionId: "session-1" },
      "req-fixed",
    );

    expect(metadata.get(CorrelationHeaderNames.userId)).toEqual(["user-1"]);
    expect(metadata.get(CorrelationHeaderNames.sessionId)).toEqual(["session-1"]);
    expect(metadata.get(CorrelationHeaderNames.clientIp)).toEqual(["10.10.10.10"]);
    expect(metadata.get(CorrelationHeaderNames.userAgent)).toEqual(["Mozilla/5.0"]);
    expect(metadata.get(CorrelationHeaderNames.requestId)).toEqual(["req-fixed"]);
  });
});
