import { Agent, Tool } from "@alphaxiv/agents";
import z from "zod";
import { getFullPaperByUniversalId } from "../../db/services/papers";
import { sanitizeText } from "./utils";

const MAX_WORDS = 400;

export const askPaperTool = new Tool({
  name: "Ask Paper",
  description: `Ask a specific question about a paper's content and receive a concise answer.

Use this tool when you have specific questions not answered in the snippets, such as:
- What are other methods mentioned in this paper?
- What are the relevant papers cited?
- What additional context or details are provided on a specific topic?
- How does the paper address a particular aspect?

The answer will be concise (maximum ${MAX_WORDS} words) and directly address your question.

Examples:
- Ask about methods: { "universalId": "2301.12345", "query": "What other methods does this paper compare against?" }
- Ask about citations: { "universalId": "2401.00001", "query": "What are the key related papers cited in the introduction?" }
- Ask about details: { "universalId": "2312.09876", "query": "How do they evaluate their approach?" }`,
  parameters: z.object({
    universalId: z.string().describe("The arXiv universal ID of the paper (e.g., '2301.12345')"),
    query: z.string().describe("Your specific question about the paper's content"),
  }),
  async execute({ param }) {
    try {
      const { universalId, query } = param as {
        universalId: string;
        query: string;
      };

      console.info("question", query, "on paper", universalId);
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

      const agent = new Agent({
        model: "google:gemini-3-flash",
        instructions: `You are a research assistant that answers specific questions about academic papers.

Given the full text of a paper, answer the user's question concisely and accurately.

IMPORTANT CONSTRAINTS:
- Your answer MUST be no more than ${MAX_WORDS} words
- Be concise but informative
- Focus on directly answering the question
- If the answer requires listing items, use bullet points for clarity
- If the paper doesn't contain information to answer the question, say so briefly

Remember: Keep your response under ${MAX_WORDS} words while still being helpful.`,
      });

      const paperContext = `**Paper Title**: ${paper.title}
**Universal ID**: ${universalId}

**Full Text**:
${fullText}

**Question**: ${query}`;

      const result = await agent.run(paperContext);

      const words = result.outputText.split(/\s+/).length;
      console.info("answer", result.outputText)
      if (words > MAX_WORDS) {
        return result.outputText.split(/\s+/).slice(0, MAX_WORDS).join(' ') + '...';
      }

      return result.outputText;
    } catch (error) {
      return `Error asking question about paper: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  },
});
