import { Tool } from "@alphaxiv/agents";
import z from "zod";
import { getFullPaperByUniversalId } from "../../db/services/papers";
import { sanitizeText } from "./utils";

export const readFullPaperTool = new Tool({
  name: "Read Full Paper",
  description: `Retrieve the complete text content of a paper including its title and all pages concatenated together.

Use this tool to read the entire paper at once. This is useful when you need to analyze the complete content, search for information across the entire document, or get a comprehensive understanding of the paper.

Examples:
- Read full paper: { "universalId": "2301.12345" }
- Get complete text: { "universalId": "2401.00001" }`,
  parameters: z.object({
    universalId: z.string().describe("The arXiv universal ID of the paper (e.g., '2301.12345')"),
  }),
  async execute({ param }) {
    try {
      const { universalId } = param as {
        universalId: string;
      };

      const paper = await getFullPaperByUniversalId(universalId);

      if (!paper) {
        return `Paper with universal ID ${universalId} not found.`;
      }

      if (paper.pages.length === 0) {
        return `Paper ${universalId} exists but has no pages available.`;
      }

      const fullText = paper.pages
        .map(page => sanitizeText(page.text))
        .join("\n\n");

      const textPreview = fullText.length > 10000 
        ? fullText.substring(0, 10000) + "\n\n... [Content truncated due to length. Total pages: " + paper.pages.length + "]"
        : fullText;

      return `**Title**: ${paper.title}
**Universal ID**: ${universalId}
**Total Pages**: ${paper.pages.length}

**Full Text**:
${textPreview}`;
    } catch (error) {
      return `Error reading full paper: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  },
});
