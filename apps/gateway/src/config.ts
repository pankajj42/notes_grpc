export interface GatewayConfig {
  nodeEnv: "development" | "production" | "test";
  port: number;
  logLevel: "debug" | "info" | "warn" | "error";
  authServiceUrl: string;
  notesServiceUrl: string;
  jwtIssuer: string;
  jwtAudience: string;
  corsOrigin: string;
  jwtRefreshTtlDays: number;
  cookieSecure: boolean;
  cookieSameSite: "strict" | "lax" | "none";
  cookieDomain?: string;
}

function readRequiredString(name: string): string {
  const value = process.env[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readOptionalString(name: string, fallback: string): string {
  const value = process.env[name];
  if (typeof value !== "string" || value.trim() === "") {
    return fallback;
  }
  return value;
}

function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (typeof raw !== "string" || raw.trim() === "") {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer`);
  }

  return parsed;
}

function readNodeEnv(): GatewayConfig["nodeEnv"] {
  const value = readOptionalString("NODE_ENV", "development");
  if (value === "development" || value === "production" || value === "test") {
    return value;
  }
  throw new Error("NODE_ENV must be one of: development, production, test");
}

function readLogLevel(): GatewayConfig["logLevel"] {
  const value = readOptionalString("LOG_LEVEL", "info");
  if (value === "debug" || value === "info" || value === "warn" || value === "error") {
    return value;
  }
  throw new Error("LOG_LEVEL must be one of: debug, info, warn, error");
}

function readCookieSecure(): boolean {
  const value = readOptionalString("COOKIE_SECURE", "false").toLowerCase();
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new Error("COOKIE_SECURE must be true or false");
}

function readCookieSameSite(): GatewayConfig["cookieSameSite"] {
  const value = readOptionalString("COOKIE_SAME_SITE", "lax").toLowerCase();
  if (value === "strict" || value === "lax" || value === "none") {
    return value;
  }
  throw new Error("COOKIE_SAME_SITE must be one of: strict, lax, none");
}

export function loadConfig(): GatewayConfig {
  const cookieDomain = process.env.COOKIE_DOMAIN;

  return {
    nodeEnv: readNodeEnv(),
    port: readPositiveInt("PORT", 3000),
    logLevel: readLogLevel(),
    authServiceUrl: readRequiredString("AUTH_SERVICE_URL"),
    notesServiceUrl: readRequiredString("NOTES_SERVICE_URL"),
    jwtIssuer: readRequiredString("JWT_ISSUER"),
    jwtAudience: readRequiredString("JWT_AUDIENCE"),
    corsOrigin: readRequiredString("CORS_ORIGIN"),
    jwtRefreshTtlDays: readPositiveInt("JWT_REFRESH_TTL_DAYS", 30),
    cookieSecure: readCookieSecure(),
    cookieSameSite: readCookieSameSite(),
    ...(typeof cookieDomain === "string" && cookieDomain.trim() !== ""
      ? { cookieDomain }
      : {}),
  };
}

export const config = loadConfig();
