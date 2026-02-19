import { getPaperByUniversalId, createPapersWithPages } from "../services/papers";

// Set the universal paper ID to migrate here
const UNIVERSAL_PAPER_ID = "1802.06002";

interface PaperResponse {
  universalPaperId: string;
  title: string;
  abstract: string;
  totalVotes?: number;
  publicationDate?: string;
  pages?: Array<{
    pageNumber: number;
    text: string;
  }>;
}

const API_BASE = "https://api.alphaxiv.org/retrieve/v1";

async function fetchPaperByUniversalId(universalId: string): Promise<PaperResponse> {
  const url = `${API_BASE}/paper/${universalId}`;
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
    
    if (existingPaper) {
      console.log(`❌ Paper already exists in database:`);
      console.log(`  ID: ${existingPaper.id}`);
      console.log(`  Universal ID: ${existingPaper.universalId}`);
      console.log(`  Title: ${existingPaper.title}`);
      console.log(`  Votes: ${existingPaper.votes}`);
      console.log(`  Publication Date: ${existingPaper.publicationDate}`);
      console.log(`\nNo migration needed.`);
      return;
    }

    // Fetch paper from API
    console.log(`Fetching paper data from API...`);
    const paperData = await fetchPaperByUniversalId(UNIVERSAL_PAPER_ID);

    if (!paperData) {
      throw new Error(`Paper not found: ${UNIVERSAL_PAPER_ID}`);
    }

    console.log(`\n📄 Paper Details:`);
    console.log(`  Title: ${paperData.title}`);
    console.log(`  Total Votes: ${paperData.totalVotes ?? 0}`);
    console.log(`  Publication Date: ${paperData.publicationDate ?? 'N/A'}`);
    console.log(`  Pages: ${paperData.pages?.length ?? 0}`);

    // Create paper with pages
    console.log(`\nCreating paper in database...`);
    const result = await createPapersWithPages([{
      title: paperData.title,
      abstract: paperData.abstract,
      universalId: paperData.universalPaperId,
      publicationDate: paperData.publicationDate ? new Date(paperData.publicationDate) : new Date(),
      votes: paperData.totalVotes ?? 0,
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
