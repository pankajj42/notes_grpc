import { CorrelationHeaderNames } from "@notes/shared-types";
import type { NextFunction, Request, Response } from "express";
import logger from "../logger.js";
import { getClientIpFromRequest, getRequestIdFromRequest } from "../lib/correlation.js";

export function attachRequestContext(req: Request, res: Response, next: NextFunction): void {
  const requestId = getRequestIdFromRequest(req);
  res.locals.requestId = requestId;
  res.setHeader(CorrelationHeaderNames.requestId, requestId);
  next();
}

export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startNs = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startNs) / 1_000_000;
    const statusCode = res.statusCode;
    const requestId = res.locals.requestId;
    const level = statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";

    logger[level](
      {
        event: "http",
        type: "request_complete",
        requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        userId: req.user?.userId,
        sessionId: req.user?.sessionId,
        clientIp: getClientIpFromRequest(req),
        userAgent: req.get("user-agent") ?? undefined,
      },
      "HTTP request completed",
    );
  });

  next();
}