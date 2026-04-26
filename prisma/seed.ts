import { PrismaClient, type Tone } from "@prisma/client";

/**
 * Demo seed (quickstart.md § 3).
 *
 * Creates two users — alice@example.com (slug: alice) and
 * bob@example.com (slug: bob) — five published posts across varied
 * tones, and two remixes. Idempotent: re-running upserts users + wipes
 * existing demo posts/comments/likes/saves before re-inserting.
 *
 * Run with:  pnpm db:seed
 */

const prisma = new PrismaClient();

const ALICE_ID = "demo-user-alice";
const BOB_ID = "demo-user-bob";

const POSTS: Array<{
  authorId: string;
  title: string;
  body: string;
  tone: Tone;
  daysAgo: number;
}> = [
  {
    authorId: ALICE_ID,
    title: "On the joy of walking at dawn",
    body: "There is a quiet hour before the city wakes. The air carries last night's coolness and the day's promise in one breath. I walk slowly, deliberately, letting the rhythm of my steps clear the static of yesterday's noise.",
    tone: "INSPIRING",
    daysAgo: 0,
  },
  {
    authorId: BOB_ID,
    title: "Why I gave up on perfect notes",
    body: "For years I tried to keep a perfect notebook. Pristine pages, color-coded tabs, the works. Then I noticed I was spending more time arranging notes than reading them. The system was the work.",
    tone: "ANALYTICAL",
    daysAgo: 1,
  },
  {
    authorId: ALICE_ID,
    title: "Three jokes my dog has invented",
    body: "He pretends not to hear his name when food is involved, then immediately appears at the sound of a fridge door from two rooms away. He has decided this is hilarious. I am the audience.",
    tone: "PLAYFUL",
    daysAgo: 2,
  },
  {
    authorId: BOB_ID,
    title: "The library at the edge of the lake",
    body: "Long after closing time, the lamp in the corner still hums. Someone's bookmark waits between two pages of a poem about water. The lake outside repeats the line, slowly, in its own language.",
    tone: "POETIC",
    daysAgo: 3,
  },
  {
    authorId: ALICE_ID,
    title: "A short note on async over-engineering",
    body: "Most queues we add to systems end up being slower, more brittle, and harder to reason about than the synchronous call they replaced. Reach for a queue when you actually need decoupling, not when the diagram looks more impressive.",
    tone: "PROFESSIONAL",
    daysAgo: 4,
  },
];

async function main() {
  console.log("⊙ resetting demo content");
  // Wipe demo content (leaves real users, if any, untouched).
  await prisma.like.deleteMany({ where: { user: { id: { in: [ALICE_ID, BOB_ID] } } } });
  await prisma.save.deleteMany({ where: { user: { id: { in: [ALICE_ID, BOB_ID] } } } });
  await prisma.comment.deleteMany({ where: { author: { id: { in: [ALICE_ID, BOB_ID] } } } });
  await prisma.draft.deleteMany({ where: { authorId: { in: [ALICE_ID, BOB_ID] } } });
  await prisma.post.deleteMany({ where: { authorId: { in: [ALICE_ID, BOB_ID] } } });

  console.log("⊙ upserting demo users");
  await prisma.user.upsert({
    where: { id: ALICE_ID },
    update: {
      email: "alice@example.com",
      displayName: "Alice",
      username: "alice",
      description: "Walks at dawn, writes at dusk.",
    },
    create: {
      id: ALICE_ID,
      email: "alice@example.com",
      displayName: "Alice",
      username: "alice",
      description: "Walks at dawn, writes at dusk.",
      emailVerified: new Date(),
    },
  });
  await prisma.user.upsert({
    where: { id: BOB_ID },
    update: {
      email: "bob@example.com",
      displayName: "Bob",
      username: "bob",
      description: "Notes, not systems.",
    },
    create: {
      id: BOB_ID,
      email: "bob@example.com",
      displayName: "Bob",
      username: "bob",
      description: "Notes, not systems.",
      emailVerified: new Date(),
    },
  });

  console.log("⊙ inserting 5 published posts");
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const created: { id: string; authorId: string; tone: Tone; title: string }[] = [];
  for (const p of POSTS) {
    const post = await prisma.post.create({
      data: {
        authorId: p.authorId,
        title: p.title,
        body: p.body,
        tone: p.tone,
        status: "PUBLISHED",
        publishedAt: new Date(now - p.daysAgo * day),
      },
    });
    created.push({ id: post.id, authorId: post.authorId!, tone: post.tone, title: post.title });
  }

  console.log("⊙ inserting 2 remixes");
  // Bob remixes Alice's "joy of walking" post (PLAYFUL rewrite).
  const aliceWalk = created.find((p) => p.authorId === ALICE_ID && p.title.includes("walking"))!;
  await prisma.post.create({
    data: {
      authorId: BOB_ID,
      title: "On the chaos of walking at dawn (with a dog)",
      body: "Alice's quiet hour does not exist if you have a 30kg dog who has just discovered a squirrel. The morning still arrives — it just arrives as a tornado.",
      tone: "PLAYFUL",
      status: "PUBLISHED",
      publishedAt: new Date(now - 6 * 60 * 60 * 1000),
      parentId: aliceWalk.id,
      parentAuthorSnapshot: { id: ALICE_ID, displayName: "Alice" },
      remixMode: "CHANGE_TONE",
    },
  });
  await prisma.post.update({
    where: { id: aliceWalk.id },
    data: { remixCount: { increment: 1 } },
  });

  // Alice remixes Bob's "perfect notes" post (POETIC summarize).
  const bobNotes = created.find((p) => p.authorId === BOB_ID && p.title.includes("notes"))!;
  await prisma.post.create({
    data: {
      authorId: ALICE_ID,
      title: "Notes are weather",
      body: "What stays is what we read again. The rest is wind.",
      tone: "POETIC",
      status: "PUBLISHED",
      publishedAt: new Date(now - 2 * 60 * 60 * 1000),
      parentId: bobNotes.id,
      parentAuthorSnapshot: { id: BOB_ID, displayName: "Bob" },
      remixMode: "SUMMARIZE",
    },
  });
  await prisma.post.update({
    where: { id: bobNotes.id },
    data: { remixCount: { increment: 1 } },
  });

  console.log("✓ seed complete");
  console.log("  Alice:", ALICE_ID, "(slug: alice)");
  console.log("  Bob:  ", BOB_ID, "(slug: bob)");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
