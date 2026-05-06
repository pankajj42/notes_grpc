export const queryKeys = {
  notes: (page: number, pageSize: number, sortBy: string, sortOrder: string) => ["notes", page, pageSize, sortBy, sortOrder] as const,
  noteById: (noteId: string) => ["note", noteId] as const,
  sessions: ["sessions"] as const,
  publicKey: ["public-key"] as const,
};
