import { pgTable, text, integer, index, uniqueIndex, timestamp, halfvec, vector } from "drizzle-orm/pg-core";
import { id, tsvector } from "../../lib/db-types";
import type { PaperAbstractEmbeddingId, PaperId, PaperPageId } from "../../lib/id";
import { sql } from "drizzle-orm";

export const papers = pgTable("papers", {
  id: id<PaperId>().primaryKey(),
  title: text().notNull(),
  abstract: text().notNull(),
  universalId: text().notNull(),
  publicationDate: timestamp({ withTimezone: true }).notNull(),
  votes: integer().notNull().default(0)
}, (table) => ({
  universalIdUnique: uniqueIndex("papers_universal_id_idx").on(table.universalId),
  votesIndex: index("papers_votes_idx").on(table.votes.desc())
}));

export const paperPages = pgTable("paper_pages", {
  id: id<PaperPageId>().primaryKey(),
  paperId: id<PaperId>().notNull().references(() => papers.id, { onDelete: "cascade" }),
  pageNumber: integer().notNull(),
  text: text().notNull(),
  textSearchVector: tsvector().notNull(),
}, (table) => ({
  textGinIndex: index("paper_pages_text_gin_idx").using("gin", sql`to_tsvector('english', ${table.text})`),
  textSearchVectorGinIndex: index("paper_pages_text_search_vector_gin_idx").using("gin", table.textSearchVector),
  paperPageUnique: uniqueIndex("paper_pages_paper_id_page_number_idx").on(table.paperId, table.pageNumber)
}));

export const paperAbstractEmbeddings = pgTable("paper_abstract_embeddings", {
  id: id<PaperAbstractEmbeddingId>().primaryKey(),
  paperId: id<PaperId>().notNull().references(() => papers.id, { onDelete: "cascade" }),
  abstractEmbedding: vector({ dimensions: 3072 }).notNull(), // Raw embedding in case we want to do a better transform in the future (PCA, better rounding, etc)
  abstractEmbeddingHalf: halfvec({ dimensions: 3072 }).notNull(), // Half-sized quant of the raw embedding for indexing, raw embedding doesn't fit into an 8kb page
}, (table) => [
  index("idx_paper_version_embeddings_embedding").using(
    "hnsw",
    table.abstractEmbeddingHalf.op("halfvec_cosine_ops")
  ),
  uniqueIndex("uidx_paper_abstract_embeddings_paper_id").on(table.paperId),
]);