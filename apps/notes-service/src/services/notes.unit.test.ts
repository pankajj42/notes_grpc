import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../prisma.js", () => ({
  prisma: {
    $transaction: vi.fn(),
    note: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "../prisma.js";
import {
  createNoteRecord,
  findNoteById,
  listUserNotes,
  softDeleteNoteById,
  updateNoteById,
} from "./notes.js";

type MockFn = ReturnType<typeof vi.fn>;

const tx = prisma.$transaction as unknown as MockFn;
const noteCreate = prisma.note.create as unknown as MockFn;
const noteFindUnique = prisma.note.findUnique as unknown as MockFn;
const noteUpdate = prisma.note.update as unknown as MockFn;
const noteFindMany = prisma.note.findMany as unknown as MockFn;
const noteCount = prisma.note.count as unknown as MockFn;

describe("notes service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createNoteRecord delegates to prisma.note.create", async () => {
    noteCreate.mockResolvedValue({ id: "note-1" });

    await createNoteRecord({
      userId: "user-1",
      title: "Test note",
      contentType: "TEXT",
      content: { text: "hello" },
    });

    expect(noteCreate).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        title: "Test note",
        contentType: "TEXT",
        content: { text: "hello" },
      },
    });
  });

  it("listUserNotes applies pagination and sorting in transaction", async () => {
    noteFindMany.mockReturnValue("findMany-query");
    noteCount.mockReturnValue("count-query");
    tx.mockResolvedValue([[{ id: "note-1" }], 31]);

    const result = await listUserNotes({
      userId: "user-1",
      page: 2,
      pageSize: 10,
      sortBy: "updatedAt",
      sortOrder: "desc",
    });

    expect(noteFindMany).toHaveBeenCalledWith({
      where: { userId: "user-1", deletedAt: null },
      orderBy: { updatedAt: "desc" },
      skip: 10,
      take: 10,
    });
    expect(noteCount).toHaveBeenCalledWith({
      where: { userId: "user-1", deletedAt: null },
    });
    expect(tx).toHaveBeenCalledWith(["findMany-query", "count-query"]);
    expect(result).toEqual({ notes: [{ id: "note-1" }], total: 31 });
  });

  it("findNoteById loads note by primary key", async () => {
    noteFindUnique.mockResolvedValue({ id: "note-1" });

    await findNoteById("note-1");

    expect(noteFindUnique).toHaveBeenCalledWith({ where: { id: "note-1" } });
  });

  it("updateNoteById updates selected note fields", async () => {
    noteUpdate.mockResolvedValue({ id: "note-1" });

    await updateNoteById("note-1", { title: "Updated" });

    expect(noteUpdate).toHaveBeenCalledWith({
      where: { id: "note-1" },
      data: { title: "Updated" },
    });
  });

  it("softDeleteNoteById marks deletedAt timestamp", async () => {
    noteUpdate.mockResolvedValue({ id: "note-1" });

    await softDeleteNoteById("note-1");

    expect(noteUpdate).toHaveBeenCalledWith({
      where: { id: "note-1" },
      data: { deletedAt: expect.any(Date) },
    });
  });
});
