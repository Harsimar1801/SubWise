import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  // Phase 1 deliberately creates no fake customers, credentials, or transactions.
  // Future explicitly approved reference-data upserts belong here.
  await db.$queryRaw`SELECT 1`;
  console.log("Database connection verified. No seed records are required in Phase 1.");
}

main()
  .catch(() => {
    console.error("Seed failed. Check DATABASE_URL and PostgreSQL availability.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
