export function readJwtSessionId(accessToken: string): string | undefined {
  try {
    const parts = accessToken.split(".");
    const payloadPart = parts[1];
    if (payloadPart == null) {
      return undefined;
    }

    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "="));
    const payload = JSON.parse(decoded) as { sid?: unknown };
    return typeof payload.sid === "string" ? payload.sid : undefined;
  } catch {
    return undefined;
  }
}
