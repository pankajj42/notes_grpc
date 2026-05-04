import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import fs from "node:fs";
import path from "node:path";

interface AuthProtoRoot {
  auth: {
    v1: {
      AuthService: {
        service: grpc.ServiceDefinition<grpc.UntypedServiceImplementation>;
      };
    };
  };
}

const PROTO_LOADER_OPTIONS: protoLoader.Options = {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
};

export function getAuthServiceDefinition(): grpc.ServiceDefinition<grpc.UntypedServiceImplementation> {
  const protoPath = resolveAuthProtoPath();
  const packageDefinition = protoLoader.loadSync(protoPath, PROTO_LOADER_OPTIONS);
  const loaded = grpc.loadPackageDefinition(packageDefinition) as unknown as AuthProtoRoot;
  return loaded.auth.v1.AuthService.service;
}

function resolveAuthProtoPath(): string {
  const candidates = [
    path.resolve(process.cwd(), "packages/proto/src/auth/v1/auth.proto"),
    path.resolve(process.cwd(), "../../packages/proto/src/auth/v1/auth.proto"),
    path.resolve(process.cwd(), "../../../packages/proto/src/auth/v1/auth.proto"),
    path.resolve(__dirname, "../../../packages/proto/src/auth/v1/auth.proto"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error("Unable to locate auth.proto. Checked: " + candidates.join(", "));
}
