import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import { prisma } from "../prisma.js";
import { generateRefreshToken } from "../tokens.js";
import { getRefreshTokenExpiryDate } from "../utils/date.js";

const BCRYPT_COST = 12;
const MAX_FAILED_REFRESH_ATTEMPTS = 5;

export async function createSession(
  userId: string,
  deviceName: string,
  userAgent?: string,
  ipAddress?: string,
): Promise<{ sessionId: string; refreshToken: string }> {
  const sessionId = randomUUID();
  const refreshToken = generateRefreshToken(sessionId);
  const refreshTokenHash = await bcrypt.hash(refreshToken, BCRYPT_COST);

  await prisma.session.create({
    data: {
      id: sessionId,
      userId,
      refreshTokenHash,
      deviceName,
      userAgent: userAgent ?? null,
      ipAddress: ipAddress ?? null,
      expiresAt: getRefreshTokenExpiryDate(),
    },
  });

  return { sessionId, refreshToken };
}

export async function findSessionWithUser(sessionId: string) {
  return prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });
}

export async function findSession(sessionId: string) {
  return prisma.session.findUnique({ where: { id: sessionId } });
}

export async function findUserSessions(userId: string) {
  return prisma.session.findMany({
    where: {
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { lastUsedAt: "desc" },
  });
}

export async function updateSessionRefreshToken(
  sessionId: string,
  newRefreshToken: string,
): Promise<void> {
  const newRefreshTokenHash = await bcrypt.hash(newRefreshToken, BCRYPT_COST);

  const session = await findSession(sessionId);
  if (session == null) throw new Error("Session not found");

  await prisma.session.update({
    where: { id: sessionId },
    data: {
      previousTokenHash: session.refreshTokenHash,
      refreshTokenHash: newRefreshTokenHash,
      failedRefreshAttempts: 0,
      lastUsedAt: new Date(),
    },
  });
}

export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.session.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function incrementFailedRefreshAttempts(sessionId: string): Promise<boolean> {
  const session = await findSession(sessionId);
  if (session == null) throw new Error("Session not found");

  const newAttempts = session.failedRefreshAttempts + 1;
  const shouldLock = newAttempts >= MAX_FAILED_REFRESH_ATTEMPTS;

  await prisma.session.update({
    where: { id: sessionId },
    data: {
      failedRefreshAttempts: newAttempts,
      lockedAt: shouldLock ? new Date() : null,
    },
  });

  return shouldLock;
}

export async function verifyRefreshToken(
  rawToken: string,
  sessionRefreshTokenHash: string,
  sessionPreviousTokenHash: string | null,
): Promise<"valid" | "reuse" | "invalid"> {
  const matches = await bcrypt.compare(rawToken, sessionRefreshTokenHash);
  if (matches) {
    return "valid";
  }

  if (sessionPreviousTokenHash != null && (await bcrypt.compare(rawToken, sessionPreviousTokenHash))) {
    return "reuse";
  }

  return "invalid";
}
