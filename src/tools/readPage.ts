import { Tool } from "@alphaxiv/agents";
import z from "zod";
import { getPaperPageByUniversalIdAndNumber } from "../../db/services/papers";
import { sanitizeText } from "./utils";

export const readPageTool = new Tool({
  name: "Read Paper Page",
  description: `Retrieve the full text content of a specific page from a paper.

Use this tool to read detailed content from a specific page of a paper. This is useful when you need to examine specific sections, figures, or detailed explanations that were mentioned in search results.

Examples:
- Read first page: { "universalId": "2301.12345", "pageNumber": 1 }
- Read specific page: { "universalId": "2401.00001", "pageNumber": 5 }`,
  parameters: z.object({
    universalId: z.string().describe("The arXiv universal ID of the paper (e.g., '2301.12345')"),
    pageNumber: z
      .number()
      .int()
      .positive()
      .describe("The page number to retrieve (must be a positive integer)"),
  }),
  async execute({ param }) {
    try {
      const { universalId, pageNumber } = param as {
        universalId: string;
        pageNumber: number;
      };

      const page = await getPaperPageByUniversalIdAndNumber(universalId, pageNumber);

      if (!page) {
        return `Page ${pageNumber} not found for paper ${universalId}. The paper may not exist or may not have this page number.`;
      }

      const sanitizedText = sanitizeText(page.text);
      const textPreview = sanitizedText.length > 2000 
        ? sanitizedText.substring(0, 2000) + "\n\n... [Content truncated. Use a smaller page range or request specific sections if needed]"
        : sanitizedText;

      return `**Paper**: ${universalId}
**Page Number**: ${pageNumber}

**Content**:
${textPreview}`;
    } catch (error) {
      return `Error reading paper page: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  },
});
