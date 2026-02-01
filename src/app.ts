import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import * as searchKeywordController from "./controllers/search-keyword.controller";
import * as readPageController from "./controllers/read-page.controller";
import * as readAbstractController from "./controllers/read-abstract.controller";
import * as researchController from "./controllers/research.controller";
import * as searchEmbeddingController from "./controllers/search-embedding.controller";

export const app = new OpenAPIHono();

app.use("*", cors({ origin: "*", credentials: true }));

app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  console.info(`${c.req.method} ${c.req.path} ${c.res.status} ${duration}ms`);
});

app.onError((err, c) => {
  console.error("Error:", err);
  const status = ("status" in err && typeof err.status === "number" ? err.status : 500) as 500;
  return c.json({ message: err.message || "Internal Server Error" }, status);
});

app.get("/health", (c) => c.json({ status: "ok" }));

const apiRoutes = new OpenAPIHono();
apiRoutes.openapi(searchKeywordController.route, searchKeywordController.handler);
apiRoutes.openapi(readPageController.route, readPageController.handler);
apiRoutes.openapi(readAbstractController.route, readAbstractController.handler);
apiRoutes.openapi(researchController.route, researchController.handler);
apiRoutes.openapi(searchEmbeddingController.route, searchEmbeddingController.handler);

app.route("/api", apiRoutes);
