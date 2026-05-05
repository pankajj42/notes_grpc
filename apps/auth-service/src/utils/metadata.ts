import * as grpc from "@grpc/grpc-js";

export function extractOptionalMetadata(
  call: grpc.ServerUnaryCall<unknown, unknown>,
  key: string,
  maxLength: number,
): string | undefined {
  const value = call.metadata.get(key)[0];
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  if (normalized === "") {
    return undefined;
  }

  return normalized.slice(0, maxLength);
}
