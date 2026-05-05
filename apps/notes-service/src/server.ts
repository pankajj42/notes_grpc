import * as grpc from "@grpc/grpc-js";
import { config } from "./config";
import logger from "./logger";
import { createNotesHandlers } from "./service";
import { getNotesServiceDefinition } from "./serviceDefinition";

export function createGrpcServer(): grpc.Server {
  const server = new grpc.Server({
    "grpc.max_receive_message_length": 10 * 1024 * 1024,
    "grpc.max_send_message_length": 10 * 1024 * 1024,
  });

  server.addService(getNotesServiceDefinition(), createNotesHandlers());
  return server;
}

export async function startGrpcServer(server: grpc.Server): Promise<void> {
  const address = `0.0.0.0:${String(config.grpcPort)}`;

  await new Promise<void>((resolve, reject) => {
    server.bindAsync(address, grpc.ServerCredentials.createInsecure(), (error) => {
      if (error != null) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  logger.info({ event: "lifecycle", type: "grpc_started", address }, "notes-service gRPC listening");
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
