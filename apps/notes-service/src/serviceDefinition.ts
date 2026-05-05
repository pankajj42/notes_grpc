import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import fs from "node:fs";
import path from "node:path";

interface NotesProtoRoot {
  notes: {
    v1: {
      NotesService: {
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

export function getNotesServiceDefinition(): grpc.ServiceDefinition<grpc.UntypedServiceImplementation> {
  const protoPath = resolveNotesProtoPath();
  const packageDefinition = protoLoader.loadSync(protoPath, PROTO_LOADER_OPTIONS);
  const loaded = grpc.loadPackageDefinition(packageDefinition) as unknown as NotesProtoRoot;
  return loaded.notes.v1.NotesService.service;
}

function resolveNotesProtoPath(): string {
  const candidates = [
    path.resolve(process.cwd(), "packages/proto/src/notes/v1/notes.proto"),
    path.resolve(process.cwd(), "../../packages/proto/src/notes/v1/notes.proto"),
    path.resolve(process.cwd(), "../../../packages/proto/src/notes/v1/notes.proto"),
    path.resolve(__dirname, "../../../packages/proto/src/notes/v1/notes.proto"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error("Unable to locate notes.proto. Checked: " + candidates.join(", "));
}
