import bcrypt from "bcrypt";
import { prisma } from "../prisma.js";

const BCRYPT_COST = 12;

export async function createUser(email: string, password: string): Promise<{ id: string; email: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      passwordHash,
    },
  });

  return { id: user.id, email: user.email };
}

export async function findUserByEmail(email: string): Promise<{ id: string; email: string; passwordHash: string } | null> {
  const normalizedEmail = email.trim().toLowerCase();
  return prisma.user.findUnique({ where: { email: normalizedEmail } });
}

export async function userExists(email: string): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  return user != null;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}
