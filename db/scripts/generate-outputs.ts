import { createResearchAgent } from "../../src/agents/research.agent";
import { mkdir, writeFile, readdir, readFile, unlink } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import pLimit from "p-limit";
import { getPapersByUniversalIds } from "../services/papers";

// Load queries from text file (one query per line)
const currentFileDir = dirname(fileURLToPath(import.meta.url));
const queriesFile = Bun.file(join(currentFileDir, "new-data", "train_round_2.txt"));
const queriesText = await queriesFile.text();
const queries: string[] = queriesText.split("\n").map((l: string) => l.trim()).filter(Boolean);

async function generateOutputs() {
  console.log(`Processing ${queries.length} queries in parallel (pool size: 5)...\n`);

  // Get repo root by going up two levels from db/scripts/
  const repoRoot = join(currentFileDir, "..", "..");
  const outputsDir = join(repoRoot, "outputs_train_round_2");
  await mkdir(outputsDir, { recursive: true });

  // Build a set of already-processed queries
  const processedQueries = new Set<string>();
  try {
    const existingFiles = await readdir(outputsDir);
    for (const file of existingFiles) {
      if (file.endsWith('.json')) {
        try {
          const content = await readFile(join(outputsDir, file), 'utf-8');
          const data = JSON.parse(content);
          if (data.query) {
            processedQueries.add(data.query);
          }
        } catch (e) {
          // Skip malformed files
        }
      }
    }
    console.log(`Found ${processedQueries.size} already-processed queries\n`);
  } catch (e) {
    // outputs directory might not exist yet
  }

  // Delete JSON files whose query is NOT in the original text file
  const validQueries = new Set(queries);
  try {
    const existingFiles = await readdir(outputsDir);
    let deleted = 0;
    for (const file of existingFiles) {
      if (file.endsWith('.json')) {
        try {
          const content = await readFile(join(outputsDir, file), 'utf-8');
          const data = JSON.parse(content);
          if (data.query && !validQueries.has(data.query)) {
            await unlink(join(outputsDir, file));
            console.log(`🗑️  Deleted stale output (query not in source file): ${file}`);
            processedQueries.delete(data.query);
            deleted++;
          }
        } catch (e) {
          // Skip malformed files
        }
      }
    }
    if (deleted > 0) {
      console.log(`Deleted ${deleted} stale output files\n`);
    }
  } catch (e) {
    // outputs directory might not exist yet
  }

  const limit = pLimit(5);
  let completed = 0;
  let skipped = 0;
  const total = queries.length;
  const progressInterval = Math.max(1, Math.floor(total / 20));

  const processQuery = async (query: string, index: number) => {
    if (!query) return;

    // Skip if already processed
    if (processedQueries.has(query)) {
      console.log(`⏭️  [${index + 1}/${total}] Skipping (already exists): ${query}`);
      completed++;
      skipped++;
      
      // Log progress
      if (completed % progressInterval === 0 || completed === total) {
        const percentage = Math.round((completed / total) * 100);
        process.stdout.write(
          `\rProgress: ${completed}/${total} (${percentage}%)`
        );
      }
      return;
    }

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
  console.log(`Skipped: ${skipped}, Processed: ${completed - skipped}`);
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
