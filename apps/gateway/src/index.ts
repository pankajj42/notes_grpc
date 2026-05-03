import "dotenv/config";
import type { Server } from "node:http";
import { createHttpApp, shutdownHttpServer, startHttpServer } from "./server.js";

async function main(): Promise<void> {
	const app = createHttpApp();
	const server = await startHttpServer(app);

	const shutdown = async (httpServer: Server): Promise<void> => {
		console.log("[gateway] shutting down...");
		try {
			await shutdownHttpServer(httpServer);
			process.exitCode = 0;
		} catch (error: unknown) {
			console.error("[gateway] shutdown failed", error);
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
	console.error("[gateway] startup failed", error);
	process.exitCode = 1;
});
