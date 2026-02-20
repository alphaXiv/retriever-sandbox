import { db } from "../client";
import { paperPages } from "../schemas/papers";
import { inArray, isNull, sql } from "drizzle-orm";

const BATCH_SIZE = 2000;

async function main() {
  console.log("Starting text search vector migration...");

  // Count total rows that need migration
  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(paperPages)
    .where(isNull(paperPages.textSearchVector));

  const totalRows = Number(countResult?.count ?? 0);
  console.log(`Found ${totalRows} paper pages without textSearchVector`);

  if (totalRows === 0) {
    console.log("Nothing to migrate!");
    return;
  }

  let totalUpdated = 0;

  while (true) {
    // Get next batch of IDs that need migration
    const batch = await db
      .select({ id: paperPages.id })
      .from(paperPages)
      .where(isNull(paperPages.textSearchVector))
      .limit(BATCH_SIZE);

    if (batch.length === 0) break;

    const ids = batch.map((row) => row.id);

    // Update the batch: set textSearchVector = to_tsvector('english', text)
    await db
      .update(paperPages)
      .set({
        textSearchVector: sql`to_tsvector('english', ${paperPages.text})`,
      })
      .where(inArray(paperPages.id, ids));

    totalUpdated += batch.length;
    console.log(`  ✅ Updated ${totalUpdated}/${totalRows} rows`);
  }

  console.log(`\nMigration complete! Updated ${totalUpdated} paper pages.`);
}

main()
  .then(() => {
    console.log("Done.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
