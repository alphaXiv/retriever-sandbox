import { getPapersByUniversalIds, createPapersWithPages } from "../services/papers";

interface TopPaperResponse {
  papers: Array<{
    universalPaperId: string;
    title: string;
    abstract: string;
    totalVotes?: number;
    publicationDate?: string;
    pages?: Array<{
      pageNumber: number;
      text: string;
    }>;
  }>;
}

const API_BASE = "https://api.alphaxiv.org/retrieve/v1";
const BATCH_SIZE = 10;
const MAX_PAPERS = 100000;
const SKIP_PAPERS = 124000;

async function fetchTopPapers(limit: number, skip: number): Promise<TopPaperResponse> {
  const url = `${API_BASE}/top-papers?limit=${limit}&skip=${skip}`;
  console.log(`Fetching papers from: ${url}`);
  
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch papers: ${response.status} ${response.statusText}`);
  }
  
  return await response.json();
}

async function migratePapers() {
  let processed = 0;
  let created = 0;
  let skipped = 0;
  let errors = 0;

  console.log(`Starting migration of up to ${MAX_PAPERS} papers (skipping first ${SKIP_PAPERS})...\n`);

  while (processed < MAX_PAPERS) {
    const skip = SKIP_PAPERS + processed;
    const limit = Math.min(BATCH_SIZE, MAX_PAPERS - processed);

    try {
      const data = await fetchTopPapers(limit, skip);
      
      if (!data.papers || data.papers.length === 0) {
        console.log("No more papers to fetch.");
        break;
      }

      console.log(`Processing batch: ${skip + 1} to ${skip + data.papers.length}`);

      const universalIds = data.papers.map(p => p.universalPaperId);
      const existingPapers = await getPapersByUniversalIds(universalIds);
      const existingIds = new Set(existingPapers.map(p => p.universalId));

      const newPapers = data.papers.filter(p => !existingIds.has(p.universalPaperId));
      
      if (newPapers.length === 0) {
        console.log(`  ⏭️  All ${data.papers.length} papers already exist, skipping batch`);
        skipped += data.papers.length;
      } else {
        const skippedInBatch = data.papers.length - newPapers.length;
        if (skippedInBatch > 0) {
          console.log(`  ⏭️  Skipping ${skippedInBatch} papers (already exist)`);
          skipped += skippedInBatch;
        }

        try {
          const papersToCreate = newPapers.map(paper => ({
            title: paper.title,
            abstract: paper.abstract,
            universalId: paper.universalPaperId,
            publicationDate: paper.publicationDate ? new Date(paper.publicationDate) : new Date(),
            votes: paper.totalVotes ?? 0,
            pages: paper.pages,
          }));

          const result = await createPapersWithPages(papersToCreate);
          
          const totalPages = result.pages.length;
          const totalVotes = result.papers.reduce((sum, p) => sum + p.votes, 0);
          const paperIds = result.papers.map(p => p.universalId).join(', ');
          console.log(`  ✅ Created ${result.papers.length} papers with ${totalPages} total pages and ${totalVotes} total votes`);
          console.log(`  📝 Paper IDs: ${paperIds}`);
          created += result.papers.length;
        } catch (error) {
          console.error(`  ❌ Error processing batch:`, error);
          errors += newPapers.length;
        }
      }

      processed += data.papers.length;
      console.log(`Progress: ${processed}/${MAX_PAPERS} papers processed\n`);

      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Error fetching batch at skip=${skip}:`, error);
      errors++;
      break;
    }
  }

  console.log("\n=== Migration Complete ===");
  console.log(`Total processed: ${processed}`);
  console.log(`Created: ${created}`);
  console.log(`Skipped (already exist): ${skipped}`);
  console.log(`Errors: ${errors}`);
}

migratePapers()
  .then(() => {
    console.log("\nMigration finished successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nMigration failed:", error);
    process.exit(1);
  });
