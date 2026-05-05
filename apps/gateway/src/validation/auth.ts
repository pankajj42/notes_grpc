import { z } from "zod";
import { LoginRequestSchema, SignupRequestSchema } from "@notes/shared-types";

export const signupBodySchema = SignupRequestSchema;
export const loginBodySchema = LoginRequestSchema;

export const sessionIdParamsSchema = z.object({
  id: z.uuid("Session ID must be a valid UUID"),
});