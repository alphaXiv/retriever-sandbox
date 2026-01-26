import { db } from "../client";
import { papers, paperPages } from "../schemas/papers";
import { eq, sql } from "drizzle-orm";

async function listEntries() {
  console.log("Fetching all papers...\n");

  const allPapers = await db
    .select({
      id: papers.id,
      title: papers.title,
      universalId: papers.universalId,
      votes: papers.votes,
      publicationDate: papers.publicationDate,
      pageCount: sql<number>`count(${paperPages.id})`.as("page_count"),
    })
    .from(papers)
    .leftJoin(paperPages, eq(papers.id, paperPages.paperId))
    .groupBy(papers.id)
    .orderBy(papers.votes);

  if (allPapers.length === 0) {
    console.log("No papers found in database.");
    return;
  }

  console.log(`Found ${allPapers.length} papers:\n`);

  for (const paper of allPapers) {
    console.log(`📄 ${paper.title}`);
    console.log(`   ID: ${paper.id}`);
    console.log(`   Universal ID: ${paper.universalId}`);
    console.log(`   Votes: ${paper.votes}`);
    console.log(`   Pages: ${paper.pageCount}`);
    console.log(`   Published: ${paper.publicationDate.toISOString()}`);
    console.log();
  }

  console.log(`\nTotal: ${allPapers.length} papers`);
}

listEntries()
  .then(() => {
    console.log("\nDone!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nError:", error);
    process.exit(1);
  });
