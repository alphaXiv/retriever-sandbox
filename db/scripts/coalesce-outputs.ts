import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

interface OutputFile {
  query: string;
  response: {
    answer: string;
    papers: Array<{
      universalId: string;
      reason: string;
    }>;
  };
  timestamp: string;
}

interface CoalescedResult {
  query: string;
  papers: string[];
}

async function coalesceOutputs() {
  console.log("Reading output files...\n");

  // Get the repo root (go up from db/scripts/)
  const currentFileDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(currentFileDir, "..", "..");
  const outputsDir = join(repoRoot, "outputs_train_round_2");
  const processedOutputsDir = join(repoRoot, "processed_outputs");

  // Create processed_outputs directory if it doesn't exist
  await mkdir(processedOutputsDir, { recursive: true });

  // Read all files from outputs directory
  const files = await readdir(outputsDir);
  const jsonFiles = files.filter((file) => file.endsWith(".json"));

  if (jsonFiles.length === 0) {
    console.log("No JSON files found in outputs directory.");
    return;
  }

  console.log(`Found ${jsonFiles.length} JSON files\n`);

  const results: CoalescedResult[] = [];

  for (const file of jsonFiles) {
    const filePath = join(outputsDir, file);
    const content = await readFile(filePath, "utf-8");
    const data = JSON.parse(content) as OutputFile;

    // Extract query and papers (universal IDs)
    const papers = data.response.papers.map((paper) => paper.universalId);

    results.push({
      query: data.query,
      papers,
    });
  }

  // Generate timestamped filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputFilename = `coalesced-${timestamp}.json`;
  const outputPath = join(processedOutputsDir, outputFilename);

  // Write the coalesced results
  await writeFile(outputPath, JSON.stringify(results, null, 2), "utf-8");

  console.log(`Coalesced ${results.length} queries into ${outputFilename}`);
  console.log(`Output written to: ${outputPath}`);
}

coalesceOutputs()
  .then(() => {
    console.log("\nDone!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nError:", error);
    process.exit(1);
  });
