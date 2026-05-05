import "dotenv/config";
import type { Server } from "node:http";
import logger from "./logger.js";
import { createHttpApp, shutdownHttpServer, startHttpServer } from "./server.js";

async function main(): Promise<void> {
	const app = createHttpApp();
	const server = await startHttpServer(app);

	const shutdown = async (httpServer: Server): Promise<void> => {
		logger.info({ event: "lifecycle", type: "shutdown_start" }, "gateway shutting down");
		try {
			await shutdownHttpServer(httpServer);
			logger.info({ event: "lifecycle", type: "shutdown_complete" }, "gateway shutdown complete");
			process.exitCode = 0;
		} catch (error: unknown) {
			logger.error({ event: "lifecycle", type: "shutdown_failed", error }, "gateway shutdown failed");
			process.exitCode = 1;
		}
	};

	process.once("SIGINT", () => {
		void shutdown(server);
	});

	process.once("SIGTERM", () => {
		void shutdown(server);
	});
}

void main().catch((error: unknown) => {
	logger.error({ event: "lifecycle", type: "startup_failed", error }, "gateway startup failed");
	process.exitCode = 1;
});
