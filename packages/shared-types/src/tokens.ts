const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

const BASE64URL_REGEX = /^[A-Za-z0-9_-]+$/;

export interface ParsedRefreshToken {
  sessionId: string;
  signature: string;
}

export function parseRefreshToken(rawToken: string): ParsedRefreshToken | undefined {
  if (typeof rawToken !== "string") {
    return undefined;
  }

  const token = rawToken.trim();
  const dotIndex = token.indexOf(".");

  // Require exactly one delimiter and non-empty parts.
  if (dotIndex <= 0 || dotIndex !== token.lastIndexOf(".") || dotIndex === token.length - 1) {
    return undefined;
  }

  const sessionId = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);

  if (!UUID_REGEX.test(sessionId) || !BASE64URL_REGEX.test(signature)) {
    return undefined;
  }

  return { sessionId, signature };
}
