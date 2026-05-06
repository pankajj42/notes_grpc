import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import fs from "node:fs";

export const PROTO_LOADER_OPTIONS: protoLoader.Options = {
	keepCase: false,
	longs: String,
	enums: String,
	defaults: true,
	oneofs: true,
};

export function createChannelCredentials(): grpc.ChannelCredentials {
	const tlsEnabled = readTlsEnabled();

	if (!tlsEnabled) {
		return grpc.credentials.createInsecure();
	}

	const caPath = process.env.GRPC_TLS_CA_PATH;
	if (typeof caPath === "string" && caPath.trim() !== "") {
		return grpc.credentials.createSsl(fs.readFileSync(caPath));
	}

	return grpc.credentials.createSsl();
}

function readTlsEnabled(): boolean {
	const raw = process.env.GRPC_TLS_ENABLED;

	if (typeof raw !== "string" || raw.trim() === "") {
		return false;
	}

	const normalized = raw.trim().toLowerCase();
	if (normalized === "true") {
		return true;
	}

	if (normalized === "false") {
		return false;
	}

	throw new Error("GRPC_TLS_ENABLED must be true or false");
}
