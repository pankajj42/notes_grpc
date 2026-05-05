import * as grpc from "@grpc/grpc-js";
import fs from "node:fs";
import { createAuthHandlers } from "./service";
import { getAuthServiceDefinition } from "./serviceDefinition";
import { config } from "./config";

export function createGrpcServer(): grpc.Server {
  const server = new grpc.Server({
    "grpc.max_receive_message_length": 10 * 1024 * 1024,
    "grpc.max_send_message_length": 10 * 1024 * 1024,
  });

  server.addService(getAuthServiceDefinition(), createAuthHandlers());
  return server;
}

export async function startGrpcServer(server: grpc.Server): Promise<void> {
  const address = `0.0.0.0:${String(config.grpcPort)}`;
  const credentials = createServerCredentials();

  await new Promise<void>((resolve, reject) => {
    server.bindAsync(address, credentials, (error) => {
      if (error != null) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  console.log(`[auth-service] gRPC listening on ${address}`);
}

function createServerCredentials(): grpc.ServerCredentials {
  if (!config.grpcTlsEnabled) {
    return grpc.ServerCredentials.createInsecure();
  }

  if (config.grpcTlsKeyPath == null || config.grpcTlsCertPath == null) {
    console.warn("[auth-service] GRPC TLS enabled but certificate paths are missing; falling back to insecure credentials");
    return grpc.ServerCredentials.createInsecure();
  }

  return grpc.ServerCredentials.createSsl(null, [
    {
      cert_chain: fs.readFileSync(config.grpcTlsCertPath),
      private_key: fs.readFileSync(config.grpcTlsKeyPath),
    },
  ]);
}

export async function shutdownGrpcServer(server: grpc.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.forceShutdown();
      reject(new Error("Timed out while shutting down gRPC server"));
    }, 10_000);

    server.tryShutdown(() => {
      clearTimeout(timeout);
      resolve();
    });
  });
}
