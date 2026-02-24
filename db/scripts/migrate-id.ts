import { getPaperByUniversalId, createPapersWithPages, getPaperPageCountByUniversalId, deletePaperByUniversalId } from "../services/papers";

// Set the universal paper ID to migrate here
const UNIVERSAL_PAPER_ID = "2602.15763";

interface PaperResponse {
  universalId: string;
  title: string;
  abstract: string;
  citationsCount?: number;
  publicationDate?: number; // epoch ms
  pages?: Array<{
    pageNumber: number;
    text: string;
  }>;
}

const API_BASE = "https://api.alphaxiv.org/papers/v3";

async function fetchPaperByUniversalId(universalId: string): Promise<PaperResponse> {
  const url = `${API_BASE}/${universalId}`;
  console.log(`Fetching paper from: ${url}`);
  
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch paper: ${response.status} ${response.statusText}`);
  }
  
  return await response.json();
}

async function migrateSinglePaper() {
  console.log(`Starting migration for paper: ${UNIVERSAL_PAPER_ID}\n`);

  try {
    // Check if paper already exists
    const existingPaper = await getPaperByUniversalId(UNIVERSAL_PAPER_ID);
    
    console.info("existingPaper:", existingPaper);

    if (existingPaper) {
      const pageCount = await getPaperPageCountByUniversalId(UNIVERSAL_PAPER_ID);
      console.info("pageCount:", pageCount);
      if (Number(pageCount) === 0) {
        console.log(`\n🗑️  Paper has 0 pages, deleting and continuing migration...`);
        await deletePaperByUniversalId(UNIVERSAL_PAPER_ID);
        console.log(`  Paper deleted successfully.`);
        return;
      } else {
        console.log(`\nNo migration needed.`);
        return;
      }
    }

    // Fetch paper from API
    console.log(`Fetching paper data from API...`);
    const paperData = await fetchPaperByUniversalId(UNIVERSAL_PAPER_ID);

    if (!paperData) {
      throw new Error(`Paper not found: ${UNIVERSAL_PAPER_ID}`);
    }

    console.log(`\n📊 Paper Page Entries:`);
    console.log(`  Number of paper page entries: ${paperData.pages?.length ?? 0}`);

    console.log(`\n📄 Paper Details:`);
    console.log(`  Title: ${paperData.title}`);
    console.log(`  Citations: ${paperData.citationsCount ?? 0}`);
    console.log(`  Publication Date: ${paperData.publicationDate ? new Date(paperData.publicationDate).toISOString() : 'N/A'}`);
    console.log(`  Pages: ${paperData.pages?.length ?? 0}`);

    // Create paper with pages
    console.log(`\nCreating paper in database...`);
    const result = await createPapersWithPages([{
      title: paperData.title,
      abstract: paperData.abstract,
      universalId: paperData.universalId,
      publicationDate: paperData.publicationDate ? new Date(paperData.publicationDate) : new Date(),
      votes: paperData.citationsCount ?? 0,
      pages: paperData.pages,
    }]);

    console.log(`\n✅ Migration Complete!`);
    console.log(`  Created paper ID: ${result.papers[0]?.id}`);
    console.log(`  Universal ID: ${result.papers[0]?.universalId}`);
    console.log(`  Total pages created: ${result.pages.length}`);
    console.log(`  Votes: ${result.papers[0]?.votes}`);

  } catch (error) {
    console.error(`\n❌ Migration failed:`, error);
    throw error;
  }
}

migrateSinglePaper()
  .then(() => {
    console.log("\nMigration finished successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nMigration failed:", error);
    process.exit(1);
  });
