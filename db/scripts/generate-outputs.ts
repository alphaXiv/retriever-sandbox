import { createResearchAgent } from "../../src/agents/research.agent";
import { mkdir, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import pLimit from "p-limit";
import { getPapersByUniversalIds } from "../services/papers";

// Load queries from text file (one query per line)
const currentFileDir = dirname(fileURLToPath(import.meta.url));
const queriesFile = Bun.file(join(currentFileDir, "new-data", "train_easy.txt"));
const queriesText = await queriesFile.text();
const queries: string[] = queriesText.split("\n").map((l: string) => l.trim()).filter(Boolean);

async function generateOutputs() {
  console.log(`Processing ${queries.length} queries in parallel (pool size: 5)...\n`);

  // Get repo root by going up two levels from db/scripts/
  const repoRoot = join(currentFileDir, "..", "..");
  const outputsDir = join(repoRoot, "outputs");
  await mkdir(outputsDir, { recursive: true });

  const limit = pLimit(5);
  let completed = 0;
  const total = queries.length;
  const progressInterval = Math.max(1, Math.floor(total / 20));

  const processQuery = async (query: string, index: number) => {
    if (!query) return;

    try {
      console.log(`[${index + 1}/${total}] Starting query: ${query}`);
      
      const agent = createResearchAgent();
      const result = await agent.run(query);

      // Fetch paper titles from universal IDs
      const universalIds = result.output.papers.map((p: any) => p.universalId);
      const paperRecords = await getPapersByUniversalIds(universalIds);
      
      // Create a map of universalId -> title
      const titleMap = new Map(paperRecords.map(p => [p.universalId, p.title]));
      
      // Enrich papers with titles
      const papersWithTitles = result.output.papers.map((p: any) => ({
        universalId: p.universalId,
        title: titleMap.get(p.universalId) || "Title not found",
        reason: p.reason,
      }));

      // Save output to file
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `research-${timestamp}.json`;
      const filepath = join(outputsDir, filename);

      const outputData = {
        query,
        response: result.output,
        papersWithTitles,
        timestamp: new Date().toISOString(),
      };

      await writeFile(filepath, JSON.stringify(outputData, null, 2), "utf-8");
      
      completed++;
      
      // Log progress periodically
      if (completed % progressInterval === 0 || completed === total) {
        const percentage = Math.round((completed / total) * 100);
        process.stdout.write(
          `\rProgress: ${completed}/${total} (${percentage}%)`
        );
      }
      
      console.log(`✅ [${index + 1}/${total}] Completed: ${query}`);
    } catch (error) {
      completed++;
      console.error(`❌ [${index + 1}/${total}] Error processing query "${query}":`, error);
      
      // Log progress even on error
      if (completed % progressInterval === 0 || completed === total) {
        const percentage = Math.round((completed / total) * 100);
        process.stdout.write(
          `\rProgress: ${completed}/${total} (${percentage}%)`
        );
      }
    }
  };

  // Process all queries in parallel with limit
  const promises = queries.map((query, index) =>
    limit(() => processQuery(query, index))
  );

  await Promise.all(promises);

  // Clear the progress line
  process.stdout.write("\r" + " ".repeat(50) + "\r");
  
  console.log(`\nCompleted processing ${queries.length} queries`);
}

generateOutputs()
  .then(() => {
    console.log("\nDone!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nError:", error);
    process.exit(1);
  });
