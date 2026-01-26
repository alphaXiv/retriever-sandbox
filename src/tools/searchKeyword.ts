import { Tool } from "@alphaxiv/agents";
import z from "zod";
import { searchPaperPagesByKeyword } from "../../db/services/papers";
import { sanitizeText } from "./utils";

export const searchKeywordTool = new Tool({
  name: "Search Papers by Keyword",
  description: `Search for papers containing specific keywords and return matching snippets from paper pages.
  
Use this tool to find papers that discuss specific topics, methods, or concepts. The search is performed on the full text of papers and returns relevant snippets with page numbers.

Examples:
- Search for "transformer architecture": { "keyword": "transformer architecture", "maxPapers": 20, "maxSnippetsPerPaper": 5 }
- Search for "gsm8k vision": { "keyword": "gsm8k vision" }
- Find papers about "reinforcement learning": { "keyword": "reinforcement learning", "maxPapers": 50 }`,
  parameters: z.object({
    keyword: z.string().describe("Keyword or phrase to search for (can contain spaces)"),
    maxPapers: z
      .number()
      .int()
      .positive()
      .optional()
      .default(20)
      .describe("Maximum number of papers to return (default: 20)"),
    maxSnippetsPerPaper: z
      .number()
      .int()
      .positive()
      .optional()
      .default(10)
      .describe("Maximum number of snippets per paper (default: 10)"),
  }),
  async execute({ param }) {
    try {
      const { keyword, maxPapers, maxSnippetsPerPaper} = param as {
        keyword: string;
        maxPapers?: number;
        maxSnippetsPerPaper?: number;
      };

      console.info("executing with keyword", keyword)

      const results = await searchPaperPagesByKeyword(keyword, {
        maxPapers,
        maxSnippetsPerPaper,
      });

      if (results.length === 0) {
        return `No papers found matching keyword: "${keyword}"`;
      }

      const totalOccurrences = results.reduce(
        (sum, paper) => sum + paper.occurrences.length,
        0
      );

      let output = `**Found ${results.length} paper(s) with ${totalOccurrences} occurrence(s) for "${keyword}":**\n\n`;

      for (const paper of results) {
        output += `📄 **${paper.paperTitle}**\n`;
        output += `   - arXiv ID: ${paper.universalId}\n`;
        output += `   - Publication Date: ${paper.publicationDate.toISOString().split('T')[0]}\n`;
        output += `   - Votes: ${paper.votes}\n`;
        output += `   - Occurrences: ${paper.occurrences.length}\n\n`;

        for (const occurrence of paper.occurrences.slice(0, 3)) {
          const snippet = sanitizeText(occurrence.snippet).substring(0, 200);
          output += `   Page ${occurrence.pageNumber}: "${snippet}${occurrence.snippet.length > 200 ? "..." : ""}"\n\n`;
        }

        if (paper.occurrences.length > 3) {
          output += `   ... and ${paper.occurrences.length - 3} more occurrence(s)\n\n`;
        }
      }

      console.info("Paper titles found:", results.map(p => p.paperTitle));

      return output;
    } catch (error) {
      return `Error searching papers by keyword: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  },
});
