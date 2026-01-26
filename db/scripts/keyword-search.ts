import { searchPaperPagesByKeyword } from "../services/papers";

const KEYWORD = "gsm8k vision";
const MAX_PAPERS = 50;
const MAX_SNIPPETS_PER_PAPER = 10;

async function keywordSearch() {
  console.log(`Searching for keyword: "${KEYWORD}"`);
  console.log(`Max papers: ${MAX_PAPERS}, Max snippets per paper: ${MAX_SNIPPETS_PER_PAPER}\n`);

  const results = await searchPaperPagesByKeyword(KEYWORD, {
    maxPapers: MAX_PAPERS,
    maxSnippetsPerPaper: MAX_SNIPPETS_PER_PAPER,
  });

  if (results.length === 0) {
    console.log("No results found.");
    return;
  }

  console.log(`Found ${results.length} paper(s) with matches:\n`);

  for (const paper of results) {
    console.log(`📄 ${paper.paperTitle}`);
    console.log(`   Paper ID: ${paper.universalId}`);
    console.log(`   Occurrences: ${paper.occurrences.length}\n`);

    for (const occurrence of paper.occurrences) {
      console.log(`   Page ${occurrence.pageNumber}`);
      console.log(`   ${occurrence.snippet}`);
      console.log();
    }

    console.log();
  }

  const totalOccurrences = results.reduce((sum, paper) => sum + paper.occurrences.length, 0);
  console.log(`\nTotal: ${results.length} papers, ${totalOccurrences} page occurrences`);
}

keywordSearch()
  .then(() => {
    console.log("\nDone!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nError:", error);
    process.exit(1);
  });
