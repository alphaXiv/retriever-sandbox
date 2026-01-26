import { db } from "../client";
import { papers, paperPages } from "../schemas/papers";
import { sql } from "drizzle-orm";

async function deleteAllEntries() {
  console.log("Fetching current counts...\n");

  const [paperCount] = await db.select({ count: sql<number>`count(*)` }).from(papers);
  const [pageCount] = await db.select({ count: sql<number>`count(*)` }).from(paperPages);

  console.log(`Current database state:`);
  console.log(`  Papers: ${paperCount?.count ?? 0}`);
  console.log(`  Paper Pages: ${pageCount?.count ?? 0}`);
  console.log();

  if ((paperCount?.count ?? 0) === 0 && (pageCount?.count ?? 0) === 0) {
    console.log("Database is already empty. Nothing to delete.");
    return;
  }

  console.log("Deleting all entries...\n");

  const deletedPages = await db.delete(paperPages);
  console.log(`✅ Deleted all paper pages`);

  const deletedPapers = await db.delete(papers);
  console.log(`✅ Deleted all papers`);

  console.log("\n=== Deletion Complete ===");
  console.log("All papers and paper pages have been removed from the database.");
}

deleteAllEntries()
  .then(() => {
    console.log("\nDone!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nError:", error);
    process.exit(1);
  });
