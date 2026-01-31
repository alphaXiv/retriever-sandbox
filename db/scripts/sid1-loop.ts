import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionMessageToolCall } from "openai/resources/chat/completions";

const SID_URL = process.env.SID_URL;
const SID_API_KEY = process.env.SID_API_KEY;
const TOOL_BASE_URL = process.env.TOOL_BASE_URL;

if (!SID_URL || !SID_API_KEY || !TOOL_BASE_URL) {
  throw new Error("SID_URL, SID_API_KEY, and TOOL_BASE_URL must be set in environment variables");
}

const client = new OpenAI({
  baseURL: SID_URL,
  apiKey: SID_API_KEY,
  defaultHeaders: {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  },
});

const systemPrompt = `You are an expert research assistant that retrieves relevant arXiv papers for a given research query. Your task is to find all arXiv paper IDs that are relevant to answering the research question.

Steps:
1. Reflect on what information is needed to answer the research question and use search or text_search to find relevant arXiv papers. Each paper has an arXiv ID.
2. Repeat step 1 until all papers necessary and sufficient to answer the question have been found. Take as many turns and searches as needed - you can make multiple searches per turn! Most questions will require multiple turns. Most questions require at least 5-8 search requests. Many will need more.
3. Use the report_helpful_ids tool to report the most helpful arXiv paper IDs. List the most helpful paper IDs first (important!).

The interaction ends once report_helpful_ids is called. You will be scored based on whether you have found all the relevant papers and whether you reported them in the correct order (NDCG).


You have access to the following tools:

- search: performs a semantic search with the query
  - Arguments: query (required), limit (optional, default 10, max 50)
- text_search: performs a full-text search using Postgres TS_VECTOR webquery
  - Arguments: query (required), limit (optional, default 10, max 50)
- read: reads the full content of an arXiv paper by its ID
  - Arguments: id (required, arXiv paper ID)
- report_helpful_ids: report helpful arXiv paper IDs in order (most helpful first)
  - Arguments: ids (required, list of arXiv paper ID strings)

To use a tool, enclose it within <tool_call> tags with a Python dictionary containing "name" and "arguments". For example:

<tool_call>
{"name": "search", "arguments": {"query": "machine learning algorithms", "limit": 3}}
</tool_call>

The semantic search tool will match things that are conceptually related or use synonyms. This request above would also find texts that talk about linear regression, for example, although "linear regression" does not appear in the query directly. You can write long queries describing the paper you want precisely with this tool.


<tool_call>
{"name": "text_search", "arguments": {"query": "machine learning algorithms", "limit": 3}}
</tool_call>

For text_search queries, you can use "" (escaped double quotes) to find exact matches for a term. Since the query is inside a JSON string with double quotes, you need to escape the inner double quotes with backslashes ("dimensionality reduction").
You can also use a - to exclude terms (like -PCA). You don't need to use "" or - operators, but it can be helpful. If your text_search query has too many terms, there might not be a paper that matches all the constraints and no data will be found.

Both search tools return snippets (relevant excerpts) rather than full papers. Snippets are approximately 50 words long and show the most relevant portion of the paper based on your query. If the paper was truncated, you'll see "..." at the beginning or end.
To read the full paper content, use the read tool with the arXiv paper ID from your search results. You can only read papers that were previously returned by search or text_search.

<tool_call>
{"name": "read", "arguments": {"id": "2301.12345"}}
</tool_call>

After you've received the tool responses, you can report the helpful arXiv paper IDs:

<tool_call>
{"name": "report_helpful_ids", "arguments": {"ids": ["2301.12345", "2302.67890", "2303.11111"]}}
</tool_call>`;

const MAX_TURNS = 10;

function formatSearchResultsAsXML(data: any): string {
  const results = data.results || [];
  
  return results.map((paper: any) => {
    const snippets = paper.occurrences?.map((occ: any) => occ.snippet).join("\n") || "";
    return `<doc id="${paper.universalId}" title="${paper.paperTitle}">\n${snippets}\n</doc>`;
  }).join("\n\n");
}

function formatEmbeddingSearchResultsAsXML(data: any): string {
  const results = data.results || [];
  
  return results.map((paper: any) => {
    return `<doc id="${paper.universalId}" title="${paper.title}">\n${paper.abstract}\n</doc>`;
  }).join("\n\n");
}

function formatPageAsXML(data: any): string {
  return `<doc id="${data.universalId}" title="${data.title}">\n${data.text}\n</doc>`;
}

async function callTool(toolName: string, args: Record<string, any>): Promise<string> {
  let endpoint: string;
  let queryParams: Record<string, string> = {};

  if (toolName === "search") {
    endpoint = "/api/search/embedding";
    queryParams = {
      query: args.query,
      limit: String(args.limit || 10),
    };
    if (args.after) {
      queryParams.minPublicationDate = args.after;
    }
  } else if (toolName === "text_search") {
    endpoint = "/api/search/keyword";
    queryParams = {
      keyword: args.query,
      maxPapers: String(args.limit || 10),
    };
    if (args.after) {
      queryParams.minPublicationDate = args.after;
    }
  } else if (toolName === "read") {
    endpoint = "/api/page";
    queryParams = {
      universalId: args.id,
      pageNumber: String(args.pageNumber || 1),
    };
  } else if (toolName === "report_helpful_ids") {
    return "";
  } else {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  const url = new URL(endpoint, TOOL_BASE_URL);
  Object.entries(queryParams).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Tool call failed (${response.status}): ${errorText}`);
  }

  const responseText = await response.text();
  const data = JSON.parse(responseText);

  if (toolName === "search") {
    return formatEmbeddingSearchResultsAsXML(data);
  } else if (toolName === "text_search") {
    return formatSearchResultsAsXML(data);
  } else if (toolName === "read") {
    return formatPageAsXML(data);
  }

  return responseText;
}

async function executeToolCalls(toolCalls: ChatCompletionMessageToolCall[]): Promise<{ tool_call_id: string; content: string }[]> {
  const results = await Promise.all(
    toolCalls.map(async (toolCall) => {
      if (toolCall.type !== "function") {
        throw new Error(`Unsupported tool call type: ${toolCall.type}`);
      }
      
      const { name, arguments: argsStr } = toolCall.function;
      const args = JSON.parse(argsStr);
      
      const content = await callTool(name, args);
      
      return {
        tool_call_id: toolCall.id,
        content,
      };
    })
  );

  return results;
}

async function runAgentLoop(query: string) {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: query },
  ];

  let turn = 0;
  let done = false;
  let reportedIds: string[] | null = null;

  while (!done && turn < MAX_TURNS) {
    turn++;
    console.log(`\n=== Turn ${turn} ===`);

    const response = await client.chat.completions.create({
      model: "sid-1",
      messages,
      tools: [
        { type: "function", function: { name: "search" } },
        { type: "function", function: { name: "text_search" } },
        { type: "function", function: { name: "read" } },
        { type: "function", function: { name: "report_helpful_ids" } },
      ],
    });

    const choice = response.choices[0];
    if (!choice) {
      throw new Error("No response from model");
    }
    
    const assistantMessage = choice.message;
    messages.push(assistantMessage);

    console.log("Assistant:", assistantMessage.content);
    console.log("Tool calls:", assistantMessage.tool_calls?.length || 0);

    const toolCalls = assistantMessage.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      break;
    }

    console.log("\nTool calls:");
    for (const toolCall of toolCalls) {
      if (toolCall.type === "function") {
        const args = JSON.parse(toolCall.function.arguments);
        console.log(`  - ${toolCall.function.name}:`, args);
        
        if (toolCall.function.name === "report_helpful_ids") {
          reportedIds = args.ids;
          done = true;
        }
      }
    }

    const toolResponses = await executeToolCalls(toolCalls);

    console.log("\nTool responses:");
    for (const toolResponse of toolResponses) {
      messages.push({
        role: "tool",
        content: toolResponse.content,
        tool_call_id: toolResponse.tool_call_id,
      });
      
      if (toolResponse.content.trim().startsWith("<doc")) {
        const docCount = (toolResponse.content.match(/<doc /g) || []).length;
        const docIds = [...toolResponse.content.matchAll(/<doc id="([^"]+)"/g)].map(m => m[1]);
        console.log(`  Response: ${docCount} document(s) in XML format`);
        console.log(`  Document IDs:`, docIds);
      } else if (toolResponse.content) {
        console.log(`  Response:`, toolResponse.content.substring(0, 200));
      } else {
        console.log(`  Response: (empty)`);
      }
    }
  }

  console.log("\n=== Final Results ===");
  console.log("Total turns:", turn);
  console.log("Reported IDs:", reportedIds);

  return { messages, reportedIds, turnCount: turn };
}

const query = "Find papers that frame prompt optimization as a gradient descent problem over discrete tokens.";
const result = await runAgentLoop(query);
console.log("\nAgent loop completed:", result.turnCount, "turns");