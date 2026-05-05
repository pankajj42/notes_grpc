import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import type { Server } from "node:http";
import { config } from "./config.js";
import logger from "./logger.js";
import { authenticate } from "./middleware/authenticate.js";
import { globalErrorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { attachRequestContext, requestLoggingMiddleware } from "./middleware/requestLogging.js";
import { createAuthRouter } from "./routes/auth.js";
import { createNotesRouter } from "./routes/notes.js";

export function createHttpApp(): Express {
  const app = express();

  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true,
    }),
  );

  app.use(attachRequestContext);
  app.use(requestLoggingMiddleware);

  app.use(express.json({ limit: "200kb" }));
  app.use(cookieParser());

  app.use("/auth", createAuthRouter());
  app.use("/notes", authenticate, createNotesRouter());

  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      service: "gateway",
      timestamp: new Date().toISOString(),
    });
  });

  // 404 for unmatched routes, then global error handler
  app.use(notFoundHandler);
  app.use(globalErrorHandler);

  return app;
}

export async function startHttpServer(app: Express): Promise<Server> {
  return await new Promise<Server>((resolve, reject) => {
    const server = app.listen(config.port, () => {
      logger.info({ event: "lifecycle", type: "http_started", port: config.port }, "gateway HTTP listening");
      resolve(server);
    });

    server.on("error", (error: Error) => {
      reject(error);
    });
  });
}

export async function shutdownHttpServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out while shutting down HTTP server"));
    }, 10_000);

    server.close((error?: Error) => {
      clearTimeout(timeout);
      if (error != null) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
