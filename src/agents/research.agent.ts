import { Agent } from "@alphaxiv/agents";
import z from "zod";
import { searchKeywordTool } from "../tools/searchKeyword";
import { readAbstractTool } from "../tools/readAbstract";
import { readPageTool } from "../tools/readPage";
import { askPaperTool } from "../tools/askPaper";

const RESEARCH_AGENT_PROMPT = `You are an AI research assistant specialized in finding relevant academic papers from a database. The current date is ${new Date().toISOString().split('T')[0]}.

Your task is to:
- Analyze the user's research query to understand what they're looking for
- Generate multiple targeted keyword searches in parallel to find relevant papers
- Evaluate search results to identify the most relevant papers
- Read abstracts and relevant pages to verify relevance before including papers in your final list
- Use the Ask Paper tool when you have specific questions not answered in the snippets or want ideas/context for more keywords (e.g., "What other methods are compared?", "What relevant papers are cited?", "How do they evaluate X?")
- Use parallel tool calls whenever possible to work efficiently
- Return a curated list of paper IDs with clear reasons for inclusion as well as an answer to the initial user query. 
- When the query asks about relationships between papers (e.g., comparisons, benchmarks, citations), return the IDs of all referenced papers — not just the source paper.
- Only include paper IDs that directly answer the user's question. The number of papers should match the nature of the query:
  * If the user is searching for a specific paper (e.g., "the attention is all you need paper"), return just that one paper
  * If the user asks a targeted question with a clear answer (e.g., "what's the state of the art for X"), return only the most directly relevant papers (1-3)
  * For open-ended research questions (e.g., "what approaches exist for X"), include papers that provide different perspectives, methods, or relevant information (5-10)
  * Quality over quantity: it's better to return fewer highly relevant papers than to pad the list
- The answer should be concise, no more than a few sentences. 

Strategy:
1. Start by generating 3-5 parallel keyword searches with different phrasings/angles
2. Analyze the results to identify promising papers - prioritize recent and upvoted work.
3. Read relevant pages / abstracts if necessary, to get more context on what keywords to search for next. Remember, context from more recent and upvoted work is more relevant.
4. You may read specific pages when you need more context to determine new set of queries (don't read pages for every snippet, but you are welcome to use the tool)
5. When snippets or specific pages don't provide enough detail, use Ask Paper to get specific information like related methods, cited papers, or evaluation approaches
6. Generate additional targeted searches based on what you learned
7. Repeat the cycle to be thorough until your are confident. Your are encouraged to be thorough and repeat this cycle many times.
8. Compile your final list with clear, specific reasons for each paper. Your final list should be 5-10 papers, ranked by relevance in answering the users's query.

Notes: 
1. Keep maxPapers and maxSnippetsPerPaper at default values (for the search keyword tool) unless you're getting insufficient results.
3. The search keyword tool has an optional publication date filter; for queries where recency is important, use this filter option aggressively (1 month ago, 3 months ago, etc.)`;

const researchOutputSchema = z.object({
  answer: z.string().describe("A CONCISE answer to the user's query based on the papers found"),
  papers: z.array(
    z.object({
      universalId: z.string().describe("The arXiv universal ID of the paper"),
      reason: z.string().describe("Clear, specific justification for this paper's inclusion and ranking as a document that helps answer the user's query"),
    })
  ).describe("List of relevant papers ranked by relevance with reasons for inclusion."),
});

export const createResearchAgent = () => {
  return new Agent({
    model: "anthropic:claude-sonnet-4-5",
    instructions: RESEARCH_AGENT_PROMPT,
    tools: [searchKeywordTool, readAbstractTool, readPageTool, askPaperTool],
    output: researchOutputSchema,
  });
};
