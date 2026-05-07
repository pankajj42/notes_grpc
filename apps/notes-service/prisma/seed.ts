import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const DATABASE_URL = process.env.DATABASE_URL;

if (typeof DATABASE_URL !== "string" || DATABASE_URL.trim() === "") {
  throw new Error("DATABASE_URL is required for notes-service seed");
}

const adapter = new PrismaPg({ connectionString: DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const SEEDED_USER_IDS = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
] as const;

function longText(paragraphs: number): string {
  const line = "This is a seeded long note body used to verify scrolling, wrapping, and long-content rendering behavior in both API payloads and web UI views.";
  return Array.from({ length: paragraphs }, (_, index) => `${String(index + 1)}. ${line}`).join("\n\n");
}

function longListItems(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    text: `Seed list item ${String(index + 1)}`,
    checked: index % 3 === 0,
  }));
}

function applyMoveCheckedToEndSeedOrder(items: Array<{ text: string; checked: boolean }>) {
  const unchecked = items.filter((item) => !item.checked);
  const checked = items.filter((item) => item.checked);
  return [...unchecked, ...checked];
}

async function seedForUser(userId: string, noteCount: number): Promise<void> {
  await prisma.note.deleteMany({ where: { userId } });

  for (let index = 0; index < noteCount; index += 1) {
    const isList = index % 3 === 0;
    const moveCheckedToEnd = isList && index % 9 === 0;
    const listItems = longListItems(index === 0 ? 45 : 8);

    const content = isList
      ? {
        items: moveCheckedToEnd ? applyMoveCheckedToEndSeedOrder(listItems) : listItems,
        moveCheckedToEnd,
      }
      : { text: longText(index === 1 ? 18 : 3) };

    await prisma.note.create({
      data: {
        userId,
        title: `Seeded Note ${String(index + 1)}`,
        contentType: isList ? "LIST" : "TEXT",
        content,
      },
    });
  }
}

async function main(): Promise<void> {
  // User 1 gets 25 notes so pagination can be validated across multiple pages.
  await seedForUser(SEEDED_USER_IDS[0], 250);
  await seedForUser(SEEDED_USER_IDS[1], 10);
  await seedForUser(SEEDED_USER_IDS[2], 65);

  console.log("Seeded notes database with multi-page and long-content data");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
