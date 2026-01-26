import { Tool } from "@alphaxiv/agents";
import z from "zod";
import { getPaperAbstractByUniversalId } from "../../db/services/papers";
import { sanitizeText } from "./utils";

export const readAbstractTool = new Tool({
  name: "Read Paper Abstract",
  description: `Retrieve the abstract of a paper by its arXiv universal ID.

Use this tool to get a quick overview of what a paper is about without reading the full text. The abstract provides a summary of the paper's purpose, methods, and key findings.

Examples:
- Read abstract: { "universalId": "2301.12345" }
- Get paper overview: { "universalId": "2401.00001" }`,
  parameters: z.object({
    universalId: z.string().describe("The arXiv universal ID of the paper (e.g., '2301.12345')"),
  }),
  async execute({ param }) {
    try {
      const { universalId } = param as { universalId: string };

      const paper = await getPaperAbstractByUniversalId(universalId);

      if (!paper) {
        return `Paper not found with universal ID: ${universalId}`;
      }

      return `**${sanitizeText(paper.title)}**

**arXiv ID**: ${paper.universalId}

**Abstract**:
${sanitizeText(paper.abstract)}`;
    } catch (error) {
      return `Error reading paper abstract: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  },
});
