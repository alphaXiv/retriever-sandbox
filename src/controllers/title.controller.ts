import { createRoute, z } from "@hono/zod-openapi";
import type { RouteHandler } from "@hono/zod-openapi";
import { getPaperByUniversalId } from "../../db/services/papers";

const route = createRoute({
  method: "get",
  path: "/title",
  summary: "Get the title and publication date of a paper",
  description: "Retrieve the title and publication date by paper universal ID",
  request: {
    query: z.object({
      universalId: z.string().openapi({ example: "2301.12345" }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            title: z.string(),
            publicationDate: z.string(),
          }),
        },
      },
      description: "Successful response with title and publication date",
    },
    404: {
      content: {
        "application/json": {
          schema: z.object({
            message: z.string(),
          }),
        },
      },
      description: "Paper not found",
    },
  },
});

const handler: RouteHandler<typeof route> = async (c) => {
  const { universalId } = c.req.valid("query");

  const paper = await getPaperByUniversalId(universalId);

  if (!paper) {
    return c.json({
      message: "Paper not found",
    }, 404);
  }

  return c.json({
    title: paper.title,
    publicationDate: paper.publicationDate.toISOString(),
  }, 200);
};

export { handler, route };
