import { db } from "../client";
import { papers, paperAbstractEmbeddings } from "../schemas/papers";
import { insertPaperAbstractEmbedding } from "../services/papers";
import { eq, notExists } from "drizzle-orm";
import { generateEmbedding } from "../../src/utils/generate-embeddings";
import pLimit from "p-limit";

async function main() {
  console.log("Starting paper abstract embedding generation...");

  // Get all papers that don't have embeddings yet
  const papersWithoutEmbeddings = await db
    .select({
      id: papers.id,
      title: papers.title,
      abstract: papers.abstract,
      universalId: papers.universalId,
    })
    .from(papers)
    .where(
      notExists(
        db
          .select()
          .from(paperAbstractEmbeddings)
          .where(eq(paperAbstractEmbeddings.paperId, papers.id))
      )
    );

  console.log(`Found ${papersWithoutEmbeddings.length} papers without embeddings`);

  let successCount = 0;
  let failureCount = 0;
  const limit = pLimit(10);

  const processPaper = async (paper: typeof papersWithoutEmbeddings[number], index: number) => {
    try {
      console.log(
        `[${index + 1}/${papersWithoutEmbeddings.length}] Generating embedding for paper: ${paper.universalId}`
      );

      const embedding = await generateEmbedding(paper.abstract);

      if (!embedding) {
        console.error(`  ❌ Failed to generate embedding (null result)`);
        failureCount++;
        return;
      }

      if (embedding.length !== 3072) {
        console.error(`  ❌ Invalid embedding length: ${embedding.length} (expected 3072)`);
        failureCount++;
        return;
      }

      await insertPaperAbstractEmbedding(paper.id, embedding);
      console.log(`  ✓ Successfully inserted embedding`);
      successCount++;
    } catch (error) {
      console.error(`  ❌ Error processing paper ${paper.universalId}:`, error);
      failureCount++;
    }
  };

  await Promise.all(
    papersWithoutEmbeddings.map((paper, index) =>
      limit(() => processPaper(paper, index))
    )
  );

  console.log("\n=== Summary ===");
  console.log(`Total papers processed: ${papersWithoutEmbeddings.length}`);
  console.log(`Successful: ${successCount}`);
  console.log(`Failed: ${failureCount}`);
  
  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
