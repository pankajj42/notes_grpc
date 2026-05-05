export interface NotesServiceConfig {
  nodeEnv: "development" | "production" | "test";
  grpcPort: number;
  grpcTlsEnabled: boolean;
  grpcTlsKeyPath?: string;
  grpcTlsCertPath?: string;
  logLevel: "debug" | "info" | "warn" | "error";
  databaseUrl: string;
  directUrl: string;
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

function readNodeEnv(): NotesServiceConfig["nodeEnv"] {
  const value = readOptionalString("NODE_ENV", "development");
  if (value === "development" || value === "production" || value === "test") {
    return value;
  }
  throw new Error("NODE_ENV must be one of: development, production, test");
}

function readBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (typeof raw !== "string" || raw.trim() === "") {
    return fallback;
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  throw new Error(`${name} must be true or false`);
}

function readLogLevel(): NotesServiceConfig["logLevel"] {
  const value = readOptionalString("LOG_LEVEL", "info");
  if (value === "debug" || value === "info" || value === "warn" || value === "error") {
    return value;
  }
  throw new Error("LOG_LEVEL must be one of: debug, info, warn, error");
}

export function loadConfig(): NotesServiceConfig {
  const nodeEnv = readNodeEnv();

  const grpcTlsKeyPath = process.env.GRPC_TLS_KEY_PATH;
  const grpcTlsCertPath = process.env.GRPC_TLS_CERT_PATH;

  return {
    nodeEnv,
    grpcPort: readPositiveInt("GRPC_PORT", 50052),
    grpcTlsEnabled: readBoolean("GRPC_TLS_ENABLED", false),
    ...(typeof grpcTlsKeyPath === "string" && grpcTlsKeyPath.trim() !== "" ? { grpcTlsKeyPath } : {}),
    ...(typeof grpcTlsCertPath === "string" && grpcTlsCertPath.trim() !== "" ? { grpcTlsCertPath } : {}),
    logLevel: readLogLevel(),
    databaseUrl: readRequiredString("DATABASE_URL"),
    directUrl: readRequiredString("DIRECT_URL"),
  };
}

export const config = loadConfig();
