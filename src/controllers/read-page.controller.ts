import { createRoute, z } from "@hono/zod-openapi";
import type { RouteHandler } from "@hono/zod-openapi";
import { getPaperPageByUniversalIdAndNumber } from "../../db/services/papers";

const route = createRoute({
  method: "get",
  path: "/page",
  summary: "Read a specific page from a paper",
  description: "Retrieve the content of a specific page by paper universal ID and page number",
  request: {
    query: z.object({
      universalId: z.string().openapi({ example: "2301.12345" }),
      pageNumber: z.coerce.number().int().positive().openapi({ example: 1 }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            pageId: z.string(),
            paperId: z.string(),
            pageNumber: z.number(),
            text: z.string(),
          }),
        },
      },
      description: "Successful response with page content",
    },
    404: {
      content: {
        "application/json": {
          schema: z.object({
            message: z.string(),
          }),
        },
      },
      description: "Page not found",
    },
  },
});

const handler: RouteHandler<typeof route> = async (c) => {
  const { universalId, pageNumber } = c.req.valid("query");
  
  const page = await getPaperPageByUniversalIdAndNumber(universalId, pageNumber);

  if (!page) {
    return c.json({
      message: "Page not found",
    }, 404);
  }

  return c.json({
    pageId: page.pageId,
    paperId: page.paperId,
    pageNumber: page.pageNumber,
    text: page.text,
  }, 200);
};

export { handler, route };
