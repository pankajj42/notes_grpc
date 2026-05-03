export interface AuthServiceConfig {
  nodeEnv: "development" | "production" | "test";
  grpcPort: number;
  logLevel: "debug" | "info" | "warn" | "error";
  databaseUrl: string;
  directUrl: string;
  jwtIssuer: string;
  jwtAudience: string;
  jwtAccessTtl: string;
  jwtRefreshTtlDays: number;
  rsaPrivateKey: string;
  rsaPublicKey: string;
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

function readNodeEnv(): AuthServiceConfig["nodeEnv"] {
  const value = readOptionalString("NODE_ENV", "development");
  if (value === "development" || value === "production" || value === "test") {
    return value;
  }
  throw new Error("NODE_ENV must be one of: development, production, test");
}

function readLogLevel(): AuthServiceConfig["logLevel"] {
  const value = readOptionalString("LOG_LEVEL", "info");
  if (value === "debug" || value === "info" || value === "warn" || value === "error") {
    return value;
  }
  throw new Error("LOG_LEVEL must be one of: debug, info, warn, error");
}

export function loadConfig(): AuthServiceConfig {
  return {
    nodeEnv: readNodeEnv(),
    grpcPort: readPositiveInt("GRPC_PORT", 50051),
    logLevel: readLogLevel(),
    databaseUrl: readRequiredString("DATABASE_URL"),
    directUrl: readRequiredString("DIRECT_URL"),
    jwtIssuer: readRequiredString("JWT_ISSUER"),
    jwtAudience: readRequiredString("JWT_AUDIENCE"),
    jwtAccessTtl: readRequiredString("JWT_ACCESS_TTL"),
    jwtRefreshTtlDays: readPositiveInt("JWT_REFRESH_TTL_DAYS", 30),
    rsaPrivateKey: readOptionalString("RSA_PRIVATE_KEY", ""),
    rsaPublicKey: readOptionalString("RSA_PUBLIC_KEY", ""),
  };
}

export const config = loadConfig();
