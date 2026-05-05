import "dotenv/config";
import { createGrpcServer, shutdownGrpcServer, startGrpcServer } from "./server";
import logger from "./logger";
import { prisma } from "./prisma";

async function main(): Promise<void> {
	const server = createGrpcServer();
	await startGrpcServer(server);

	const shutdown = async (): Promise<void> => {
		logger.info({ event: "lifecycle", type: "shutdown_start" }, "notes-service shutting down");
		try {
			await shutdownGrpcServer(server);
			await prisma.$disconnect();
			logger.info({ event: "lifecycle", type: "shutdown_complete" }, "notes-service shutdown complete");
			process.exitCode = 0;
		} catch (error: unknown) {
			logger.error({ event: "lifecycle", type: "shutdown_failed", error }, "notes-service shutdown failed");
			process.exitCode = 1;
		}
	};

	process.once("SIGINT", () => {
		void shutdown();
	});

	process.once("SIGTERM", () => {
		void shutdown();
	});
}

void main().catch((error: unknown) => {
	logger.error({ event: "lifecycle", type: "startup_failed", error }, "notes-service startup failed");
	process.exitCode = 1;
});
