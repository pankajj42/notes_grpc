import * as grpc from "@grpc/grpc-js";
import { type EmptyRequest, type PublicKeyResponse, ErrorCodes } from "@notes/shared-types";
import { getPublicKeyPem } from "../keys.js";
import { toGrpcError, getErrorMessage } from "../utils/errors.js";

type UnaryCallback<T> = grpc.sendUnaryData<T>;

export function handleGetPublicKey(
  _call: grpc.ServerUnaryCall<EmptyRequest, PublicKeyResponse>,
  callback: UnaryCallback<PublicKeyResponse>,
): void {
  try {
    callback(null, { publicKey: getPublicKeyPem() });
  } catch (error: unknown) {
    callback(toGrpcError(ErrorCodes.INTERNAL, getErrorMessage(error)));
  }
}
