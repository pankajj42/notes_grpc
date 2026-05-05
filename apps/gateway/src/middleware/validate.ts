import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { ErrorCodes, ErrorMessages, errorResponse } from "@notes/shared-types";

type RequestLocation = "body" | "query" | "params";

/**
 * Returns an Express middleware that validates `req[location]` against
 * the provided Zod schema.
 *
 * On success the validated (and coerced) data is stored in `res.locals.validated[location]`.
 * On failure a structured 400 response is sent immediately.
 */
export function validate(
  schema: z.ZodType,
  location: RequestLocation = "body",
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[location]);

    if (!result.success) {
      const fields = buildFieldErrors(result.error);

      res.status(400).json(
        errorResponse(
          ErrorCodes.INVALID_ARGUMENT,
          ErrorMessages.INVALID_ARGUMENT,
          { fields },
        ),
      );
      return;
    }

    res.locals.validated = res.locals.validated || {};
    res.locals.validated[location] = result.data;
    next();
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};

  for (const issue of error.issues) {
    const path = issue.path.join(".") || "_root";
    // Keep first error per path
    if (!(path in fields)) {
      fields[path] = issue.message;
    }
  }

  return fields;
}
