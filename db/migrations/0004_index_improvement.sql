ALTER TABLE "paper_pages" ADD COLUMN "text_search_vector" "tsvector";--> statement-breakpoint
CREATE INDEX "paper_pages_text_search_vector_gin_idx" ON "paper_pages" USING gin ("text_search_vector");