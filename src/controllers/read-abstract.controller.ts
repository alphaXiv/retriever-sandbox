import { createRoute, z } from "@hono/zod-openapi";
import type { RouteHandler } from "@hono/zod-openapi";
import { getPaperAbstractByUniversalId } from "../../db/services/papers";

const route = createRoute({
  method: "get",
  path: "/abstract",
  summary: "Read a paper's abstract",
  description: "Retrieve the abstract of a paper by its universal ID",
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
            id: z.string(),
            title: z.string(),
            abstract: z.string(),
            universalId: z.string(),
          }),
        },
      },
      description: "Successful response with paper abstract",
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
  
  const paper = await getPaperAbstractByUniversalId(universalId);

  if (!paper) {
    return c.json({
      message: "Paper not found",
    }, 404);
  }

  return c.json({
    id: paper.id,
    title: paper.title,
    abstract: paper.abstract,
    universalId: paper.universalId,
  }, 200);
};

export { handler, route };
