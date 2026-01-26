import { db } from "../client";
import { papers, paperPages } from "../schemas/papers";
import { sql, like, inArray } from "drizzle-orm";

async function deleteHyphenatedIds() {
  console.log("Finding papers with hyphens in universal-id...\n");

  const hyphenatedPapers = await db
    .select({ id: papers.id, universalId: papers.universalId })
    .from(papers)
    .where(like(papers.universalId, "%-%"));

  if (hyphenatedPapers.length === 0) {
    console.log("No papers found with hyphens in universal-id.");
    return;
  }

  console.log(`Found ${hyphenatedPapers.length} papers with hyphenated universal-ids:`);
  hyphenatedPapers.forEach((paper) => {
    console.log(`  - ${paper.universalId} (${paper.id})`);
  });
  console.log();

  console.log("Deleting papers and their pages...\n");

  const paperIds = hyphenatedPapers.map((p) => p.id);
  
  const deletedPages = await db
    .delete(paperPages)
    .where(inArray(paperPages.paperId, paperIds));
  
  console.log(`✅ Deleted pages for ${hyphenatedPapers.length} papers`);

  const deletedPapers = await db
    .delete(papers)
    .where(like(papers.universalId, "%-%"));
  
  console.log(`✅ Deleted ${hyphenatedPapers.length} papers with hyphenated universal-ids`);

  console.log("\n=== Deletion Complete ===");
}

deleteHyphenatedIds()
  .then(() => {
    console.log("\nDone!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nError:", error);
    process.exit(1);
  });
