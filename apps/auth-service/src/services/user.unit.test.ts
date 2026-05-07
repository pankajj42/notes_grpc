import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("bcrypt", () => ({
  default: {
    hash: vi.fn(async (value: string) => `hashed:${value}`),
    compare: vi.fn(async (plain: string, hash: string) => hash === `hashed:${plain}`),
  },
}));

vi.mock("../prisma.js", () => ({
  prisma: {
    user: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

import bcrypt from "bcrypt";
import { prisma } from "../prisma.js";
import { createUser, findUserByEmail, hashPassword, userExists, verifyPassword } from "./user.js";

type MockFn = ReturnType<typeof vi.fn>;

const userCreate = prisma.user.create as unknown as MockFn;
const userFindUnique = prisma.user.findUnique as unknown as MockFn;
const bcryptHash = bcrypt.hash as unknown as MockFn;
const bcryptCompare = bcrypt.compare as unknown as MockFn;

describe("user service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes email and hashes password on createUser", async () => {
    userCreate.mockResolvedValue({ id: "user-1", email: "user@example.com" });

    const result = await createUser("  USER@Example.Com ", "Password123!");

    expect(bcryptHash).toHaveBeenCalledWith("Password123!", 12);
    expect(userCreate).toHaveBeenCalledWith({
      data: {
        email: "user@example.com",
        passwordHash: "hashed:Password123!",
      },
    });
    expect(result).toEqual({ id: "user-1", email: "user@example.com" });
  });

  it("normalizes email in findUserByEmail", async () => {
    userFindUnique.mockResolvedValue({ id: "user-1", email: "user@example.com", passwordHash: "hashed" });

    const result = await findUserByEmail("  USER@Example.Com ");

    expect(userFindUnique).toHaveBeenCalledWith({ where: { email: "user@example.com" } });
    expect(result).toEqual({ id: "user-1", email: "user@example.com", passwordHash: "hashed" });
  });

  it("returns true from userExists when user is present", async () => {
    userFindUnique.mockResolvedValue({ id: "user-1" });

    await expect(userExists("user@example.com")).resolves.toBe(true);
  });

  it("returns false from userExists when user is missing", async () => {
    userFindUnique.mockResolvedValue(null);

    await expect(userExists("missing@example.com")).resolves.toBe(false);
  });

  it("verifyPassword delegates to bcrypt.compare", async () => {
    await expect(verifyPassword("Password123!", "hashed:Password123!")).resolves.toBe(true);
    expect(bcryptCompare).toHaveBeenCalledWith("Password123!", "hashed:Password123!");
  });

  it("hashPassword delegates to bcrypt.hash with cost 12", async () => {
    await expect(hashPassword("Password123!")).resolves.toBe("hashed:Password123!");
    expect(bcryptHash).toHaveBeenCalledWith("Password123!", 12);
  });
});
