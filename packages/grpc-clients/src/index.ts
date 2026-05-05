import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import fs from "node:fs";
import path from "node:path";

export interface AuthServiceClient {
	Signup: grpc.ClientUnaryCall & {
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
	Login: grpc.ClientUnaryCall & {
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
	GetPublicKey: grpc.ClientUnaryCall & ((
		request: unknown,
		callback: (error: grpc.ServiceError | null, response: unknown) => void,
	) => grpc.ClientUnaryCall);
	RefreshToken: grpc.ClientUnaryCall & {
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

interface AuthProtoRoot {
	auth: {
		v1: {
			AuthService: new (address: string, credentials: grpc.ChannelCredentials) => AuthServiceClient;
		};
	};
}

interface NotesProtoRoot {
	notes: {
		v1: {
			NotesService: new (address: string, credentials: grpc.ChannelCredentials) => NotesServiceClient;
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

export function createAuthServiceClient(address: string): AuthServiceClient {
	const protoPath = resolveAuthProtoPath();
	const packageDefinition = protoLoader.loadSync(protoPath, PROTO_LOADER_OPTIONS);
	const loaded = grpc.loadPackageDefinition(packageDefinition) as unknown as AuthProtoRoot;

	return new loaded.auth.v1.AuthService(address, grpc.credentials.createInsecure());
}

export function createNotesServiceClient(address: string): NotesServiceClient {
	const protoPath = resolveNotesProtoPath();
	const packageDefinition = protoLoader.loadSync(protoPath, PROTO_LOADER_OPTIONS);
	const loaded = grpc.loadPackageDefinition(packageDefinition) as unknown as NotesProtoRoot;

	return new loaded.notes.v1.NotesService(address, grpc.credentials.createInsecure());
}

function resolveAuthProtoPath(): string {
	const candidates = [
		path.resolve(process.cwd(), "packages/proto/src/auth/v1/auth.proto"),
		path.resolve(process.cwd(), "../../packages/proto/src/auth/v1/auth.proto"),
		path.resolve(process.cwd(), "../../../packages/proto/src/auth/v1/auth.proto"),
		path.resolve(__dirname, "../../../proto/src/auth/v1/auth.proto"),
	];

	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}

	throw new Error("Unable to locate auth.proto. Checked: " + candidates.join(", "));
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
