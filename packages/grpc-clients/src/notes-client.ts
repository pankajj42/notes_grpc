import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import fs from "node:fs";
import path from "node:path";
import { createChannelCredentials, PROTO_LOADER_OPTIONS } from "./credentials.js";

export interface NotesServiceClient {
	CreateNote: grpc.ClientUnaryCall & {
		(
			request: unknown,
			callback: (error: grpc.ServiceError | null, response: unknown) => void,
		): grpc.ClientUnaryCall;
		(
			request: unknown,
			metadata: grpc.Metadata,
			callback: (error: grpc.ServiceError | null, response: unknown) => void,
		): grpc.ClientUnaryCall;
	};
	GetNotes: grpc.ClientUnaryCall & {
		(
			request: unknown,
			callback: (error: grpc.ServiceError | null, response: unknown) => void,
		): grpc.ClientUnaryCall;
		(
			request: unknown,
			metadata: grpc.Metadata,
			callback: (error: grpc.ServiceError | null, response: unknown) => void,
		): grpc.ClientUnaryCall;
	};
	GetNote: grpc.ClientUnaryCall & {
		(
			request: unknown,
			callback: (error: grpc.ServiceError | null, response: unknown) => void,
		): grpc.ClientUnaryCall;
		(
			request: unknown,
			metadata: grpc.Metadata,
			callback: (error: grpc.ServiceError | null, response: unknown) => void,
		): grpc.ClientUnaryCall;
	};
	UpdateNote: grpc.ClientUnaryCall & {
		(
			request: unknown,
			callback: (error: grpc.ServiceError | null, response: unknown) => void,
		): grpc.ClientUnaryCall;
		(
			request: unknown,
			metadata: grpc.Metadata,
			callback: (error: grpc.ServiceError | null, response: unknown) => void,
		): grpc.ClientUnaryCall;
	};
	DeleteNote: grpc.ClientUnaryCall & {
		(
			request: unknown,
			callback: (error: grpc.ServiceError | null, response: unknown) => void,
		): grpc.ClientUnaryCall;
		(
			request: unknown,
			metadata: grpc.Metadata,
			callback: (error: grpc.ServiceError | null, response: unknown) => void,
		): grpc.ClientUnaryCall;
	};
	close: () => void;
}

interface NotesProtoRoot {
	notes: {
		v1: {
			NotesService: new (address: string, credentials: grpc.ChannelCredentials) => NotesServiceClient;
		};
	};
}

export function createNotesServiceClient(address: string): NotesServiceClient {
	const protoPath = resolveNotesProtoPath();
	const packageDefinition = protoLoader.loadSync(protoPath, PROTO_LOADER_OPTIONS);
	const loaded = grpc.loadPackageDefinition(packageDefinition) as unknown as NotesProtoRoot;

	return new loaded.notes.v1.NotesService(address, createChannelCredentials());
}

function resolveNotesProtoPath(): string {
	const candidates = [
		path.resolve(process.cwd(), "packages/proto/src/notes/v1/notes.proto"),
		path.resolve(process.cwd(), "../../packages/proto/src/notes/v1/notes.proto"),
		path.resolve(process.cwd(), "../../../packages/proto/src/notes/v1/notes.proto"),
		path.resolve(__dirname, "../../../proto/src/notes/v1/notes.proto"),
	];

	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}

	throw new Error("Unable to locate notes.proto. Checked: " + candidates.join(", "));
}
