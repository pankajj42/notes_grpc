import "dotenv/config";
import { createGrpcServer, shutdownGrpcServer, startGrpcServer } from "./server";
import { prisma } from "./prisma";

async function main(): Promise<void> {
	const server = createGrpcServer();
	await startGrpcServer(server);

	const shutdown = async (): Promise<void> => {
		console.log("[auth-service] shutting down...");
		try {
			await shutdownGrpcServer(server);
			await prisma.$disconnect();
			process.exitCode = 0;
		} catch (error: unknown) {
			console.error("[auth-service] shutdown failed", error);
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
	console.error("[auth-service] startup failed", error);
	process.exitCode = 1;
});
