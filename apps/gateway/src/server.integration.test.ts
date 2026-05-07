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

type FakeUser = {
  userId: string;
  email: string;
  password: string;
};

type FakeSession = {
  sessionId: string;
  userId: string;
  refreshToken: string;
  deviceName: string;
  createdAt: string;
  lastActivityAt: string;
};

type FakeNote = {
  id: string;
  userId: string;
  title: string;
  contentType: "TEXT" | "LIST";
  content: string;
  createdAt: string;
  updatedAt: string;
};

const keyPair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = keyPair.privateKey.export({ type: "pkcs1", format: "pem" }).toString();
const publicKeyPem = keyPair.publicKey.export({ type: "pkcs1", format: "pem" }).toString();

function grpcError(code: number, details: string): Error & { code: number; details: string } {
  return Object.assign(new Error(details), { code, details });
}

function toIsoNow() {
  return new Date().toISOString();
}

function createAccessToken(userId: string, sessionId: string): string {
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

function createState() {
  const users = new Map<string, FakeUser>();
  const sessionsByToken = new Map<string, FakeSession>();
  const sessionsById = new Map<string, FakeSession>();
  const notesByUser = new Map<string, FakeNote[]>();

  function makeSession(userId: string, deviceName: string): FakeSession {
    const sessionId = randomUUID();
    return {
      sessionId,
      userId,
      refreshToken: `${sessionId}.refresh`,
      deviceName,
      createdAt: toIsoNow(),
      lastActivityAt: toIsoNow(),
    };
  }

  return {
    users,
    sessionsByToken,
    sessionsById,
    notesByUser,
    makeSession,
  };
}

let state = createState();

const authClient = {
  Signup: (requestPayload: { email: string; password: string; deviceName: string }, _metadata: unknown, callback: (error: unknown, response?: unknown) => void) => {
    const email = requestPayload.email.trim().toLowerCase();
    if (state.users.has(email)) {
      callback(grpcError(6, "User already exists"));
      return;
    }

    const userId = randomUUID();
    state.users.set(email, { userId, email, password: requestPayload.password });

    const session = state.makeSession(userId, requestPayload.deviceName);
    state.sessionsByToken.set(session.refreshToken, session);
    state.sessionsById.set(session.sessionId, session);

    callback(null, {
      tokens: {
        accessToken: createAccessToken(userId, session.sessionId),
        refreshToken: session.refreshToken,
      },
      user: {
        userId,
        email,
      },
    });
  },
  Login: (requestPayload: { email: string; password: string; deviceName: string }, _metadata: unknown, callback: (error: unknown, response?: unknown) => void) => {
    const email = requestPayload.email.trim().toLowerCase();
    const user = state.users.get(email);

    if (user == null || user.password !== requestPayload.password) {
      callback(grpcError(16, "Invalid credentials"));
      return;
    }

    const session = state.makeSession(user.userId, requestPayload.deviceName);
    state.sessionsByToken.set(session.refreshToken, session);
    state.sessionsById.set(session.sessionId, session);

    callback(null, {
      tokens: {
        accessToken: createAccessToken(user.userId, session.sessionId),
        refreshToken: session.refreshToken,
      },
      user: {
        userId: user.userId,
        email: user.email,
      },
    });
  },
  GetPublicKey: (...args: unknown[]) => {
    const callback = args.at(-1) as (error: unknown, response?: unknown) => void;
    callback(null, { publicKey: publicKeyPem });
  },
  RefreshToken: (requestPayload: { refreshToken: string }, _metadata: unknown, callback: (error: unknown, response?: unknown) => void) => {
    const currentSession = state.sessionsByToken.get(requestPayload.refreshToken);

    if (currentSession == null) {
      callback(grpcError(16, "Invalid refresh token"));
      return;
    }

    state.sessionsByToken.delete(requestPayload.refreshToken);

    const rotated: FakeSession = {
      ...currentSession,
      refreshToken: `${currentSession.sessionId}.${randomUUID()}`,
      lastActivityAt: toIsoNow(),
    };

    state.sessionsByToken.set(rotated.refreshToken, rotated);
    state.sessionsById.set(rotated.sessionId, rotated);

    const user = Array.from(state.users.values()).find((entry) => entry.userId === currentSession.userId);
    if (user == null) {
      callback(grpcError(16, "User not found"));
      return;
    }

    callback(null, {
      tokens: {
        accessToken: createAccessToken(user.userId, rotated.sessionId),
        refreshToken: rotated.refreshToken,
      },
      user: {
        userId: user.userId,
        email: user.email,
      },
    });
  },
  ListSessions: (_request: unknown, metadata: { getMap: () => Record<string, string> }, callback: (error: unknown, response?: unknown) => void) => {
    const userId = metadata.getMap()["x-user-id"];
    const currentSessionId = metadata.getMap()["x-session-id"];

    const sessions = Array.from(state.sessionsById.values())
      .filter((session) => session.userId === userId)
      .map((session) => ({
        sessionId: session.sessionId,
        deviceName: session.deviceName,
        createdAt: session.createdAt,
        lastActivityAt: session.lastActivityAt,
        isCurrent: session.sessionId === currentSessionId,
      }));

    callback(null, { sessions });
  },
  LogoutSession: (requestPayload: { sessionId: string }, _metadata: unknown, callback: (error: unknown, response?: unknown) => void) => {
    const session = state.sessionsById.get(requestPayload.sessionId);
    if (session != null) {
      state.sessionsById.delete(requestPayload.sessionId);
      state.sessionsByToken.delete(session.refreshToken);
    }
    callback(null, {});
  },
  LogoutAllSessions: (_request: unknown, metadata: { getMap: () => Record<string, string> }, callback: (error: unknown, response?: unknown) => void) => {
    const userId = metadata.getMap()["x-user-id"];
    const userSessions = Array.from(state.sessionsById.values()).filter((entry) => entry.userId === userId);

    for (const session of userSessions) {
      state.sessionsById.delete(session.sessionId);
      state.sessionsByToken.delete(session.refreshToken);
    }

    callback(null, {});
  },
  close: () => undefined,
};

const notesClient = {
  CreateNote: (requestPayload: { title: string; contentType: "NOTE_CONTENT_TYPE_TEXT" | "NOTE_CONTENT_TYPE_LIST"; content: string }, metadata: { getMap: () => Record<string, string> }, callback: (error: unknown, response?: unknown) => void) => {
    const userId = metadata.getMap()["x-user-id"];
    if (userId == null || userId.trim() === "") {
      callback(grpcError(16, "Unauthorized"));
      return;
    }

    const list = state.notesByUser.get(userId) ?? [];
    const now = toIsoNow();
    const note: FakeNote = {
      id: randomUUID(),
      userId,
      title: requestPayload.title,
      contentType: requestPayload.contentType === "NOTE_CONTENT_TYPE_TEXT" ? "TEXT" : "LIST",
      content: requestPayload.content,
      createdAt: now,
      updatedAt: now,
    };

    list.push(note);
    state.notesByUser.set(userId, list);

    callback(null, { note });
  },
  GetNotes: (requestPayload: { page?: number; pageSize?: number }, metadata: { getMap: () => Record<string, string> }, callback: (error: unknown, response?: unknown) => void) => {
    const userId = metadata.getMap()["x-user-id"];
    if (userId == null || userId.trim() === "") {
      callback(grpcError(16, "Unauthorized"));
      return;
    }
    const page = requestPayload.page ?? 1;
    const pageSize = requestPayload.pageSize ?? 20;
    const list = state.notesByUser.get(userId) ?? [];

    const start = (page - 1) * pageSize;
    const paged = list.slice(start, start + pageSize);

    const totalPages = Math.ceil(list.length / pageSize);
    callback(null, {
      notes: paged,
      pagination: {
        total: list.length,
        page,
        pageSize,
        totalPages,
      },
    });
  },
  GetNote: (requestPayload: { noteId: string }, metadata: { getMap: () => Record<string, string> }, callback: (error: unknown, response?: unknown) => void) => {
    const userId = metadata.getMap()["x-user-id"];
    if (userId == null || userId.trim() === "") {
      callback(grpcError(16, "Unauthorized"));
      return;
    }
    const list = state.notesByUser.get(userId) ?? [];
    const note = list.find((entry) => entry.id === requestPayload.noteId);

    if (note == null) {
      callback(grpcError(5, "Note not found"));
      return;
    }

    callback(null, { note });
  },
  UpdateNote: (requestPayload: { noteId: string; title?: string; content?: string }, metadata: { getMap: () => Record<string, string> }, callback: (error: unknown, response?: unknown) => void) => {
    const userId = metadata.getMap()["x-user-id"];
    if (userId == null || userId.trim() === "") {
      callback(grpcError(16, "Unauthorized"));
      return;
    }
    const list = state.notesByUser.get(userId) ?? [];
    const note = list.find((entry) => entry.id === requestPayload.noteId);

    if (note == null) {
      callback(grpcError(5, "Note not found"));
      return;
    }

    if (typeof requestPayload.title === "string") {
      note.title = requestPayload.title;
    }

    if (typeof requestPayload.content === "string") {
      note.content = requestPayload.content;
    }

    note.updatedAt = toIsoNow();

    callback(null, { note });
  },
  DeleteNote: (requestPayload: { noteId: string }, metadata: { getMap: () => Record<string, string> }, callback: (error: unknown, response?: unknown) => void) => {
    const userId = metadata.getMap()["x-user-id"];
    if (userId == null || userId.trim() === "") {
      callback(grpcError(16, "Unauthorized"));
      return;
    }
    const list = state.notesByUser.get(userId) ?? [];
    const index = list.findIndex((entry) => entry.id === requestPayload.noteId);

    if (index === -1) {
      callback(grpcError(5, "Note not found"));
      return;
    }

    list.splice(index, 1);
    callback(null, {});
  },
  close: () => undefined,
};

vi.mock("@notes/grpc-clients", () => ({
  createAuthServiceClient: () => authClient,
  createNotesServiceClient: () => notesClient,
}));

async function createApp() {
  const { createHttpApp } = await import("./server.js");
  return createHttpApp();
}

describe("gateway integration", { timeout: 15_000 }, () => {
  beforeEach(() => {
    state = createState();
  });

  it("rejects invalid signup payload", async () => {
    const app = await createApp();

    const response = await request(app).post("/auth/signup").send({
      email: "not-email",
      password: "123",
      deviceName: "",
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_ARGUMENT");
    expect(response.body.error.details.fields.email).toBeDefined();
    expect(response.body.error.details.fields.password).toBeDefined();
    expect(response.body.error.details.fields.deviceName).toBeDefined();
  });

  it("supports signup, login, refresh and logout path", async () => {
    const app = await createApp();
    const agent = request.agent(app);

    const signup = await agent.post("/auth/signup").send({
      email: "demo@example.com",
      password: "Password123!",
      deviceName: "Chrome on Mac",
    });

    expect(signup.status).toBe(201);
    expect(signup.body.data.user.email).toBe("demo@example.com");
    expect(signup.headers["set-cookie"]?.[0]).toContain("refreshToken=");

    const login = await agent.post("/auth/login").send({
      email: "demo@example.com",
      password: "Password123!",
      deviceName: "Chrome on Mac",
    });

    expect(login.status).toBe(200);
    const accessToken = login.body.data.tokens.accessToken as string;

    const refresh = await agent.post("/auth/refresh");
    expect(refresh.status).toBe(200);
    expect(refresh.body.data.tokens.accessToken).toBeTypeOf("string");

    const sessions = await agent.get("/auth/sessions").set("Authorization", `Bearer ${accessToken}`);
    expect(sessions.status).toBe(200);
    expect(Array.isArray(sessions.body.data.sessions)).toBe(true);

    const logout = await agent.post("/auth/logout").set("Authorization", `Bearer ${accessToken}`);
    expect(logout.status).toBe(200);
  });

  it("returns 401 for unknown user login", async () => {
    const app = await createApp();

    const response = await request(app).post("/auth/login").send({
      email: "missing@example.com",
      password: "Password123!",
      deviceName: "Device",
    });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns 401 for invalid password", async () => {
    const app = await createApp();
    await request(app).post("/auth/signup").send({
      email: "demo@example.com",
      password: "Password123!",
      deviceName: "Device",
    });

    const response = await request(app).post("/auth/login").send({
      email: "demo@example.com",
      password: "WrongPassword123!",
      deviceName: "Device",
    });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns 401 when refresh token cookie is missing", async () => {
    const app = await createApp();

    const response = await request(app).post("/auth/refresh");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("supports notes CRUD with authenticated token", async () => {
    const app = await createApp();
    const agent = request.agent(app);

    const signup = await agent.post("/auth/signup").send({
      email: "notes@example.com",
      password: "Password123!",
      deviceName: "Device",
    });

    const token = signup.body.data.tokens.accessToken as string;

    const create = await agent
      .post("/notes")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "First",
        contentType: "TEXT",
        content: JSON.stringify({ text: "hello" }),
      });

    expect(create.status).toBe(201);
    const noteId = create.body.data.note.id as string;

    const list = await agent.get("/notes?page=1&pageSize=10").set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data.pagination.total).toBe(1);

    const getNote = await agent.get(`/notes/${noteId}`).set("Authorization", `Bearer ${token}`);
    expect(getNote.status).toBe(200);

    const update = await agent
      .put(`/notes/${noteId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Updated title" });
    expect(update.status).toBe(200);
    expect(update.body.data.note.title).toBe("Updated title");

    const del = await agent.delete(`/notes/${noteId}`).set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(200);
  });

  it("rejects notes access without bearer token", async () => {
    const app = await createApp();

    const response = await request(app).get("/notes?page=1&pageSize=10");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });
});
