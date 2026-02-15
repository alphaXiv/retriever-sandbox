import { createRoute, z } from "@hono/zod-openapi";
import type { RouteHandler } from "@hono/zod-openapi";
import { createResearchAgent } from "../agents/research.agent";
import { mkdir, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createFastResearchAgent } from "#agents/research-fast.agent";

const route = createRoute({
  method: "post",
  path: "/research-fast",
  summary: "Research a query",
  description: "Find relevant papers for a research query using AI agent",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            query: z.string().openapi({ example: "What are the latest advances in vision transformers?" }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            answer: z.string(),
            papers: z.array(
              z.object({
                universalId: z.string(),
                reason: z.string(),
              })
            ),
          }),
        },
      },
      description: "Successful response with answer and relevant papers",
    },
  },
});

const handler: RouteHandler<typeof route> = async (c) => {
  const { query } = c.req.valid("json");
  

  console.info("creating agent");
  const agent = createFastResearchAgent();
  console.info("passing in query", query);

  const result = await agent.run(query);

  // Save output to file
  // Get repo root by going up two levels from src/controllers/
  const currentFileDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(currentFileDir, "..", "..");
  const outputsDir = join(repoRoot, "outputs");
  await mkdir(outputsDir, { recursive: true });
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `research-${timestamp}.json`;
  const filepath = join(outputsDir, filename);
  
  const outputData = {
    query,
    response: result.output,
    timestamp: new Date().toISOString(),
  };
  
  await writeFile(filepath, JSON.stringify(outputData, null, 2), "utf-8");
  console.info(`Saved output to ${filepath}`);

  return c.json(result.output, 200);
};

export { handler, route };
