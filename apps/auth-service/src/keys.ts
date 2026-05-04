import { generateKeyPairSync } from "node:crypto";
import { config } from "./config";

interface SigningKeyPair {
  privateKeyPem: string;
  publicKeyPem: string;
}

let cachedKeyPair: SigningKeyPair | undefined;

export function getSigningKeyPair(): SigningKeyPair {
  if (cachedKeyPair !== undefined) {
    return cachedKeyPair;
  }

  const privateFromEnv = normalizePem(config.rsaPrivateKey);
  const publicFromEnv = normalizePem(config.rsaPublicKey);

  if (privateFromEnv !== "" && publicFromEnv !== "") {
    cachedKeyPair = {
      privateKeyPem: privateFromEnv,
      publicKeyPem: publicFromEnv,
    };
    return cachedKeyPair;
  }

  if (privateFromEnv !== "" || publicFromEnv !== "") {
    throw new Error("Both RSA_PRIVATE_KEY and RSA_PUBLIC_KEY must be provided together");
  }

  if (config.nodeEnv !== "development" && config.nodeEnv !== "test") {
    throw new Error("RSA key pair must be provided via env in production");
  }

  const generated = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
  });

  cachedKeyPair = {
    privateKeyPem: generated.privateKey,
    publicKeyPem: generated.publicKey,
  };

  console.warn("[auth-service] RSA keys not set in env; generated ephemeral dev key pair");
  return cachedKeyPair;
}

export function getPublicKeyPem(): string {
  return getSigningKeyPair().publicKeyPem;
}

function normalizePem(value: string): string {
  return value.trim().replaceAll("\\n", "\n");
}
