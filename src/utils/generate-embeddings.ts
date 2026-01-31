import { gemini } from "../integrations/gemini";

export async function generateEmbedding(
  string: string,
  config?:
    | {
        taskType:
          | "SEMANTIC_SIMILARITY"
          | "CLASSIFICATION"
          | "CLUSTERING"
          | "RETRIEVAL_QUERY"
          | "CODE_RETRIEVAL_QUERY"
          | "QUESTION_ANSWERING"
          | "FACT_VERIFICATION";
      }
    | {
        taskType: "RETRIEVAL_DOCUMENT";
        title: string;
      }
): Promise<number[] | null> {
  const result = await gemini.models.embedContent({
    model: "gemini-embedding-001",
    contents: string,
    config: {
      taskType: config?.taskType ?? "SEMANTIC_SIMILARITY",
      title: config?.taskType === "RETRIEVAL_DOCUMENT" ? config.title : undefined,
    },
  });

  return result.embeddings?.[0]?.values ?? null;
}
