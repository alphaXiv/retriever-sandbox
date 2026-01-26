import { createRoute, z } from "@hono/zod-openapi";
import type { RouteHandler } from "@hono/zod-openapi";
import { searchPaperPagesByKeyword } from "../../db/services/papers";

const route = createRoute({
  method: "get",
  path: "/search/keyword",
  summary: "Search papers by keyword",
  description: "Search for papers containing specific keywords and return matching snippets",
  request: {
    query: z.object({
      keyword: z.string().openapi({ example: "gsm8k vision" }),
      maxPapers: z.coerce.number().int().positive().optional().default(50).openapi({ example: 50 }),
      maxSnippetsPerPaper: z.coerce.number().int().positive().optional().default(10).openapi({ example: 10 }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            results: z.array(z.object({
              universalId: z.string(),
              paperTitle: z.string(),
              votes: z.number(),
              publicationDate: z.date(),
              occurrences: z.array(z.object({
                pageNumber: z.number(),
                snippet: z.string(),
              })),
            })),
            totalPapers: z.number(),
            totalOccurrences: z.number(),
          }),
        },
      },
      description: "Successful response with search results",
    },
  },
});

const handler: RouteHandler<typeof route> = async (c) => {
  const { keyword, maxPapers, maxSnippetsPerPaper } = c.req.valid("query");
  
  const results = await searchPaperPagesByKeyword(keyword, {
    maxPapers,
    maxSnippetsPerPaper,
  });

  const totalOccurrences = results.reduce((sum, paper) => sum + paper.occurrences.length, 0);

  return c.json({
    results,
    totalPapers: results.length,
    totalOccurrences,
  }, 200);
};

export { handler, route };
