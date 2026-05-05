import { type Prisma } from "../generated/prisma/client.js";
import { prisma } from "../prisma.js";

export async function createNoteRecord(data: {
  userId: string;
  title: string;
  contentType: "TEXT" | "LIST";
  content: Prisma.InputJsonValue;
}) {
  return prisma.note.create({ data });
}

export async function listUserNotes(params: {
  userId: string;
  page: number;
  pageSize: number;
  sortBy: "createdAt" | "updatedAt" | "title";
  sortOrder: "asc" | "desc";
}) {
  const { userId, page, pageSize, sortBy, sortOrder } = params;
  const where = { userId, deletedAt: null } as const;

  const [notes, total] = await prisma.$transaction([
    prisma.note.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.note.count({ where }),
  ]);

  return { notes, total };
}

export async function findNoteById(noteId: string) {
  return prisma.note.findUnique({ where: { id: noteId } });
}

export async function updateNoteById(noteId: string, data: Prisma.NoteUpdateInput) {
  return prisma.note.update({
    where: { id: noteId },
    data,
  });
}

export async function softDeleteNoteById(noteId: string): Promise<void> {
  await prisma.note.update({
    where: { id: noteId },
    data: { deletedAt: new Date() },
  });
}
