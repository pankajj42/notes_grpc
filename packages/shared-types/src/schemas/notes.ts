import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const NoteContentTypeSchema = z.enum(["TEXT", "LIST"]);
export type NoteContentType = z.infer<typeof NoteContentTypeSchema>;

export const TextNoteContentSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, "Text content is required")
      .max(50_000, "Text content must be at most 50 000 characters"),
  })
  .strict();

export const ListItemSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, "List item text is required")
      .max(500, "List item text must be at most 500 characters"),
    checked: z.boolean(),
  })
  .strict();

export const ListNoteContentSchema = z
  .object({
    items: z
      .array(ListItemSchema)
      .min(1, "List note must contain at least one item")
      .max(1_000, "List note can contain at most 1000 items"),
  })
  .strict();

// ---------------------------------------------------------------------------
// Field primitives
// ---------------------------------------------------------------------------

const noteTitleSchema = z
  .string()
  .trim()
  .min(1, "Title is required")
  .max(255, "Title must be at most 255 characters");

const noteContentSchema = z
  .string()
  .min(1, "Content is required")
  .max(50_000, "Content must be at most 50 000 characters");

// Discriminated union for validating content by type
// This ensures that when contentType is specified, the content JSON matches that shape
const createTextNoteContent = z.object({
  contentType: z.literal("TEXT"),
  content: noteContentSchema,
}).superRefine((value, ctx) => {
  const parsed = parseContentJson(value.content);
  if (!parsed.success) {
    ctx.addIssue({
      code: "custom",
      message: parsed.message,
      path: ["content"],
    });
    return;
  }

  const result = TextNoteContentSchema.safeParse(parsed.value);
  if (!result.success) {
    ctx.addIssue({
      code: "custom",
      message: "For TEXT notes, content must be JSON like { text: string }",
      path: ["content"],
    });
  }
});

const createListNoteContent = z.object({
  contentType: z.literal("LIST"),
  content: noteContentSchema,
}).superRefine((value, ctx) => {
  const parsed = parseContentJson(value.content);
  if (!parsed.success) {
    ctx.addIssue({
      code: "custom",
      message: parsed.message,
      path: ["content"],
    });
    return;
  }

  const result = ListNoteContentSchema.safeParse(parsed.value);
  if (!result.success) {
    ctx.addIssue({
      code: "custom",
      message: "For LIST notes, content must be JSON like { items: [{ text, checked }] }",
      path: ["content"],
    });
  }
});

/**
 * Discriminated union schema for creating notes:
 * Validates that the content JSON shape matches the declared contentType.
 * 
 * Examples:
 * - contentType: "TEXT" requires content: '{"text": "..."}'
 * - contentType: "LIST" requires content: '{"items": [{"text": "...", "checked": boolean}]}'
 */
export const CreateNoteContentDiscriminatedSchema = z.discriminatedUnion("contentType", [
  createTextNoteContent,
  createListNoteContent,
]);

// For validation of existing content in responses (doesn't include contentType in the object)
const noteContentJsonSchema = noteContentSchema.superRefine((rawContent, ctx) => {
  const parsed = parseContentJson(rawContent);
  if (!parsed.success) {
    ctx.addIssue({
      code: "custom",
      message: parsed.message,
    });
    return;
  }

  const textResult = TextNoteContentSchema.safeParse(parsed.value);
  if (textResult.success) {
    return;
  }

  const listResult = ListNoteContentSchema.safeParse(parsed.value);
  if (listResult.success) {
    return;
  }

  ctx.addIssue({
    code: "custom",
    message:
      "Content JSON must match either TEXT shape ({ text: string }) or LIST shape ({ items: [{ text, checked }] })",
  });
});

const noteIdSchema = z
  .uuid("Note ID must be a valid UUID");

const pageSchema = z.coerce
  .number()
  .int()
  .min(1, "Page must be at least 1")
  .default(1);

const pageSizeSchema = z.coerce
  .number()
  .int()
  .min(1, "Page size must be at least 1")
  .max(100, "Page size must be at most 100")
  .default(20);

const sortBySchema = z
  .enum(["createdAt", "updatedAt", "title"])
  .default("createdAt");

const sortOrderSchema = z
  .enum(["asc", "desc"])
  .default("desc");

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const CreateNoteRequestSchema = z.object({
  title: noteTitleSchema,
  contentType: NoteContentTypeSchema,
  content: noteContentSchema,
}).superRefine((value, ctx) => {
  // Use discriminated union validation for content
  const contentValidation = CreateNoteContentDiscriminatedSchema.safeParse({
    contentType: value.contentType,
    content: value.content,
  });

  if (!contentValidation.success) {
    for (const error of contentValidation.error.issues) {
      ctx.addIssue({
        code: "custom" as const,
        message: error.message,
        path: error.path,
      });
    }
  }
});

export const GetNotesRequestSchema = z.object({
  page: pageSchema,
  pageSize: pageSizeSchema,
  sortBy: sortBySchema,
  sortOrder: sortOrderSchema,
});

export const GetNoteRequestSchema = z.object({
  noteId: noteIdSchema,
});

export const UpdateNoteRequestSchema = z.object({
  noteId: noteIdSchema,
  title: noteTitleSchema.optional(),
  content: noteContentJsonSchema.optional(),
}).refine(
  (v) => v.title !== undefined || v.content !== undefined,
  { message: "At least one field must be provided for update" },
);

export const DeleteNoteRequestSchema = z.object({
  noteId: noteIdSchema,
});

// ---------------------------------------------------------------------------
// Inferred types (shared with frontend)
// ---------------------------------------------------------------------------

export type CreateNoteRequest = z.infer<typeof CreateNoteRequestSchema>;
export type GetNotesRequest = z.infer<typeof GetNotesRequestSchema>;
export type GetNoteRequest = z.infer<typeof GetNoteRequestSchema>;
export type UpdateNoteRequest = z.infer<typeof UpdateNoteRequestSchema>;
export type DeleteNoteRequest = z.infer<typeof DeleteNoteRequestSchema>;

// ---------------------------------------------------------------------------
// Response schemas (mirroring proto contracts)
// ---------------------------------------------------------------------------

export const NoteSchema = z
  .object({
    id: z.uuid("Note ID must be a valid UUID"),
    userId: z.uuid("User ID must be a valid UUID"),
    title: noteTitleSchema,
    contentType: NoteContentTypeSchema,
    content: noteContentSchema,
    createdAt: z.iso.datetime({ message: "createdAt must be an ISO datetime" }),
    updatedAt: z.iso.datetime({ message: "updatedAt must be an ISO datetime" }),
  })
  .superRefine((value, ctx) => {
    // Use discriminated union validation for content
    const contentValidation = CreateNoteContentDiscriminatedSchema.safeParse({
      contentType: value.contentType,
      content: value.content,
    });

    if (!contentValidation.success) {
      for (const error of contentValidation.error.issues) {
        ctx.addIssue({
          code: "custom" as const,
          message: error.message,
          path: error.path,
        });
      }
    }
  });

export const PaginationMetadataSchema = z.object({
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(100),
  totalPages: z.number().int().min(0),
});

export const CreateNoteResponseSchema = z.object({
  note: NoteSchema,
});

export const GetNoteResponseSchema = z.object({
  note: NoteSchema,
});

export const UpdateNoteResponseSchema = z.object({
  note: NoteSchema,
});

export const DeleteNoteResponseSchema = z.object({});

export const GetNotesResponseSchema = z.object({
  notes: z.array(NoteSchema),
  pagination: PaginationMetadataSchema,
});

export type TextNoteContent = z.infer<typeof TextNoteContentSchema>;
export type ListItem = z.infer<typeof ListItemSchema>;
export type ListNoteContent = z.infer<typeof ListNoteContentSchema>;

export type Note = z.infer<typeof NoteSchema>;
export type PaginationMetadata = z.infer<typeof PaginationMetadataSchema>;
export type CreateNoteResponse = z.infer<typeof CreateNoteResponseSchema>;
export type GetNoteResponse = z.infer<typeof GetNoteResponseSchema>;
export type UpdateNoteResponse = z.infer<typeof UpdateNoteResponseSchema>;
export type DeleteNoteResponse = z.infer<typeof DeleteNoteResponseSchema>;
export type GetNotesResponse = z.infer<typeof GetNotesResponseSchema>;

function parseContentJson(
  rawContent: string,
): { success: true; value: unknown } | { success: false; message: string } {
  try {
    return { success: true, value: JSON.parse(rawContent) };
  } catch {
    return {
      success: false,
      message: "Content must be a valid JSON string",
    };
  }
}
