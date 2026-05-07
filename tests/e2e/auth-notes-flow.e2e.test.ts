import { generateKeyPairSync, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.NODE_ENV = "test";
process.env.AUTH_SERVICE_URL = "localhost:50051";
process.env.NOTES_SERVICE_URL = "localhost:50052";
process.env.JWT_ISSUER = "notes-auth-service";
process.env.JWT_AUDIENCE = "notes-api-gateway";
process.env.CORS_ORIGIN = "http://localhost:5173";
process.env.COOKIE_SECURE = "false";
process.env.COOKIE_SAME_SITE = "lax";
process.env.JWT_REFRESH_TTL_DAYS = "30";

const keyPair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = keyPair.privateKey.export({ type: "pkcs1", format: "pem" }).toString();
const publicKeyPem = keyPair.publicKey.export({ type: "pkcs1", format: "pem" }).toString();

function signToken(userId: string, sessionId: string): string {
  return jwt.sign(
    { sid: sessionId },
    privateKeyPem,
    {
      algorithm: "RS256",
      issuer: process.env.JWT_ISSUER,
      audience: process.env.JWT_AUDIENCE,
      subject: userId,
      expiresIn: "15m",
    },
  );
}

function grpcError(code: number, details: string): Error & { code: number; details: string } {
  return Object.assign(new Error(details), { code, details });
}

type User = { userId: string; email: string; password: string };
type Session = { sessionId: string; userId: string; refreshToken: string };
type Note = { id: string; userId: string; title: string; contentType: "TEXT" | "LIST"; content: string; createdAt: string; updatedAt: string };

let users = new Map<string, User>();
let sessionsByToken = new Map<string, Session>();
let notesByUser = new Map<string, Note[]>();

vi.mock("@notes/grpc-clients", () => ({
  createAuthServiceClient: () => ({
    Signup: (req: { email: string; password: string }, _md: unknown, cb: (err: unknown, resp?: unknown) => void) => {
      const email = req.email.trim().toLowerCase();
      if (users.has(email)) {
        cb(grpcError(6, "User exists"));
        return;
      }
      const userId = randomUUID();
      users.set(email, { userId, email, password: req.password });

      const sessionId = randomUUID();
      const refreshToken = `${sessionId}.refresh`;
      sessionsByToken.set(refreshToken, { sessionId, userId, refreshToken });

      cb(null, {
        tokens: { accessToken: signToken(userId, sessionId), refreshToken },
        user: { userId, email },
      });
    },
    Login: (req: { email: string; password: string }, _md: unknown, cb: (err: unknown, resp?: unknown) => void) => {
      const email = req.email.trim().toLowerCase();
      const user = users.get(email);
      if (user == null || user.password !== req.password) {
        cb(grpcError(16, "Invalid credentials"));
        return;
      }
      const sessionId = randomUUID();
      const refreshToken = `${sessionId}.refresh`;
      sessionsByToken.set(refreshToken, { sessionId, userId: user.userId, refreshToken });

      cb(null, {
        tokens: { accessToken: signToken(user.userId, sessionId), refreshToken },
        user: { userId: user.userId, email: user.email },
      });
    },
    RefreshToken: (req: { refreshToken: string }, _md: unknown, cb: (err: unknown, resp?: unknown) => void) => {
      const existing = sessionsByToken.get(req.refreshToken);
      if (existing == null) {
        cb(grpcError(16, "Invalid refresh token"));
        return;
      }
      const rotated = `${existing.sessionId}.${randomUUID()}`;
      sessionsByToken.delete(req.refreshToken);
      sessionsByToken.set(rotated, { ...existing, refreshToken: rotated });
      const user = Array.from(users.values()).find((entry) => entry.userId === existing.userId);
      if (user == null) {
        cb(grpcError(16, "User missing"));
        return;
      }
      cb(null, {
        tokens: { accessToken: signToken(user.userId, existing.sessionId), refreshToken: rotated },
        user: { userId: user.userId, email: user.email },
      });
    },
    LogoutSession: (_req: unknown, _md: unknown, cb: (err: unknown, resp?: unknown) => void) => cb(null, {}),
    LogoutAllSessions: (_req: unknown, _md: unknown, cb: (err: unknown, resp?: unknown) => void) => cb(null, {}),
    ListSessions: (_req: unknown, _md: unknown, cb: (err: unknown, resp?: unknown) => void) => cb(null, { sessions: [] }),
    GetPublicKey: (...args: unknown[]) => {
      const cb = args.at(-1) as (err: unknown, resp?: unknown) => void;
      cb(null, { publicKey: publicKeyPem });
    },
    close: () => undefined,
  }),
  createNotesServiceClient: () => ({
    CreateNote: (req: { title: string; contentType: "NOTE_CONTENT_TYPE_TEXT" | "NOTE_CONTENT_TYPE_LIST"; content: string }, md: { getMap: () => Record<string, string> }, cb: (err: unknown, resp?: unknown) => void) => {
      const userId = md.getMap()["x-user-id"];
      const now = new Date().toISOString();
      const note: Note = {
        id: randomUUID(),
        userId,
        title: req.title,
        contentType: req.contentType === "NOTE_CONTENT_TYPE_TEXT" ? "TEXT" : "LIST",
        content: req.content,
        createdAt: now,
        updatedAt: now,
      };
      const list = notesByUser.get(userId) ?? [];
      list.push(note);
      notesByUser.set(userId, list);
      cb(null, { note });
    },
    GetNotes: (req: { page?: number; pageSize?: number }, md: { getMap: () => Record<string, string> }, cb: (err: unknown, resp?: unknown) => void) => {
      const userId = md.getMap()["x-user-id"];
      const list = notesByUser.get(userId) ?? [];
      const page = req.page ?? 1;
      const pageSize = req.pageSize ?? 20;
      const start = (page - 1) * pageSize;
      const totalPages = Math.ceil(list.length / pageSize);
      cb(null, { notes: list.slice(start, start + pageSize), pagination: { total: list.length, page, pageSize, totalPages } });
    },
    GetNote: (_req: unknown, _md: unknown, cb: (err: unknown, resp?: unknown) => void) => cb(grpcError(5, "Not found")),
    UpdateNote: (_req: unknown, _md: unknown, cb: (err: unknown, resp?: unknown) => void) => cb(grpcError(5, "Not found")),
    DeleteNote: (_req: unknown, _md: unknown, cb: (err: unknown, resp?: unknown) => void) => cb(null, {}),
    close: () => undefined,
  }),
}));

async function createApp() {
  const { createHttpApp } = await import("../../apps/gateway/src/server.js");
  return createHttpApp();
}

describe("e2e auth + notes happy path", () => {
  beforeEach(() => {
    users = new Map();
    sessionsByToken = new Map();
    notesByUser = new Map();
  });

  it("covers signup, login, refresh and notes pagination", async () => {
    const app = await createApp();
    const agent = request.agent(app);

    const signup = await agent.post("/auth/signup").send({
      email: "e2e@example.com",
      password: "Password123!",
      deviceName: "E2E Device",
    });
    expect(signup.status).toBe(201);

    const login = await agent.post("/auth/login").send({
      email: "e2e@example.com",
      password: "Password123!",
      deviceName: "E2E Device",
    });
    expect(login.status).toBe(200);
    const token = login.body.data.tokens.accessToken as string;

    const refresh = await agent.post("/auth/refresh");
    expect(refresh.status).toBe(200);

    for (let index = 0; index < 25; index += 1) {
      const create = await agent
        .post("/notes")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: `Note ${index + 1}`,
          contentType: "TEXT",
          content: JSON.stringify({ text: `Content ${index + 1}` }),
        });

      expect(create.status).toBe(201);
    }

    const page1 = await agent.get("/notes?page=1&pageSize=20").set("Authorization", `Bearer ${token}`);
    expect(page1.status).toBe(200);
    expect(page1.body.data.notes).toHaveLength(20);
    expect(page1.body.data.pagination.total).toBe(25);

    const page2 = await agent.get("/notes?page=2&pageSize=20").set("Authorization", `Bearer ${token}`);
    expect(page2.status).toBe(200);
    expect(page2.body.data.notes).toHaveLength(5);
  });
});
