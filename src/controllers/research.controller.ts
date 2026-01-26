import { createRoute, z } from "@hono/zod-openapi";
import type { RouteHandler } from "@hono/zod-openapi";
import { createResearchAgent } from "../agents/research.agent";

const route = createRoute({
  method: "post",
  path: "/research",
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
  const agent = createResearchAgent();
  console.info("passing in query", query);

  const result = await agent.run(query);
  
  return c.json(result.output, 200);
};

export { handler, route };
