import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../client";
import { papers, paperPages, paperAbstractEmbeddings } from "../schemas/papers";
import { generate } from "../../lib/uuidv7";
import type { PaperAbstractEmbeddingId, PaperId, PaperPageId } from "../../lib/id";

export const getPaperByUniversalId = async (universalId: string) => {
  const [paper] = await db.select().from(papers).where(eq(papers.universalId, universalId)).limit(1);

  return paper ?? null;
};

export const getPaperPageCountByUniversalId = async (universalId: string) => {
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(paperPages)
    .innerJoin(papers, eq(paperPages.paperId, papers.id))
    .where(eq(papers.universalId, universalId));

  return result?.count ?? 0;
};

export const deletePaperByUniversalId = async (universalId: string) => {
  const deletedPaper = await db.delete(papers).where(eq(papers.universalId, universalId)).returning();
  return deletedPaper[0] ?? null;
};

export const getPaperAbstractByUniversalId = async (universalId: string) => {
  const [paper] = await db
    .select({
      id: papers.id,
      title: papers.title,
      abstract: papers.abstract,
      universalId: papers.universalId,
    })
    .from(papers)
    .where(eq(papers.universalId, universalId))
    .limit(1);

  return paper ?? null;
};

export const getPapersByUniversalIds = async (universalIds: string[]) => {
  if (universalIds.length === 0) return [];
  
  return await db.select().from(papers).where(inArray(papers.universalId, universalIds));
};

export const getPaperPageByUniversalIdAndNumber = async (universalId: string, pageNumber: number) => {
  const [result] = await db
    .select({
      pageId: paperPages.id,
      paperId: paperPages.paperId,
      pageNumber: paperPages.pageNumber,
      text: paperPages.text,
    })
    .from(paperPages)
    .innerJoin(papers, eq(paperPages.paperId, papers.id))
    .where(sql`${papers.universalId} = ${universalId} AND ${paperPages.pageNumber} = ${pageNumber}`)
    .limit(1);

  return result ?? null;
};

export const getFullPaperByUniversalId = async (universalId: string) => {
  const [paper] = await db
    .select({
      title: papers.title,
      universalId: papers.universalId,
    })
    .from(papers)
    .where(eq(papers.universalId, universalId))
    .limit(1);

  if (!paper) return null;

  const pages = await db
    .select({
      pageNumber: paperPages.pageNumber,
      text: paperPages.text,
    })
    .from(paperPages)
    .innerJoin(papers, eq(paperPages.paperId, papers.id))
    .where(eq(papers.universalId, universalId))
    .orderBy(paperPages.pageNumber);

  return {
    title: paper.title,
    universalId: paper.universalId,
    pages,
  };
};

export const createPaper = async (data: {
  title: string;
  abstract: string;
  universalId: string;
  publicationDate: Date;
  votes: number;
}) => {
  const [paper] = await db.insert(papers).values({
    id: generate<PaperId>(),
    title: data.title,
    abstract: data.abstract,
    universalId: data.universalId,
    publicationDate: data.publicationDate,
    votes: data.votes,
  }).returning();

  return paper!;
};

export const createPaperPages = async (pages: Array<{
  paperId: PaperId;
  pageNumber: number;
  text: string;
}>) => {
  if (pages.length === 0) return [];

  const values = pages.map(page => ({
    id: generate<PaperPageId>(),
    paperId: page.paperId,
    pageNumber: page.pageNumber,
    text: page.text,
    textSearchVector: sql`to_tsvector('english', ${page.text})`,
  }));

  return await db.insert(paperPages).values(values).returning();
};

export const createPapersWithPages = async (papersData: Array<{
  title: string;
  abstract: string;
  universalId: string;
  publicationDate: Date;
  votes: number;
  pages?: Array<{
    pageNumber: number;
    text: string;
  }>;
}>) => {
  if (papersData.length === 0) return { papers: [], pages: [] };

  return await db.transaction(async (tx) => {
    const paperValues = papersData.map(p => ({
      id: generate<PaperId>(),
      title: p.title,
      abstract: p.abstract,
      universalId: p.universalId,
      publicationDate: p.publicationDate,
      votes: p.votes,
    }));

    const createdPapers = await tx.insert(papers).values(paperValues).returning();

    const allPages: Array<{
      id: PaperPageId;
      paperId: PaperId;
      pageNumber: number;
      text: string;
      textSearchVector: ReturnType<typeof sql>;
    }> = [];

    createdPapers.forEach((paper, idx) => {
      const paperData = papersData[idx];
      if (!paperData) return;
      
      const pagesForPaper = paperData.pages;
      if (pagesForPaper && pagesForPaper.length > 0) {
        pagesForPaper.forEach(page => {
          allPages.push({
            id: generate<PaperPageId>(),
            paperId: paper.id,
            pageNumber: page.pageNumber,
            text: page.text,
            textSearchVector: sql`to_tsvector('english', ${page.text})`,
          });
        });
      }
    });

    let createdPages: Array<{
      id: PaperPageId;
      paperId: PaperId;
      pageNumber: number;
      text: string;
      textSearchVector: string;
    }> = [];
    if (allPages.length > 0) {
      createdPages = await tx.insert(paperPages).values(allPages).returning();
    }

    return { papers: createdPapers, pages: createdPages };
  });
};

export const searchPaperPagesByKeyword = async (
  keyword: string,
  options: {
    maxPapers?: number;
    maxSnippetsPerPaper?: number;
    minPublicationDate?: Date;
  } = {}
) => {
  const { maxPapers = 10, maxSnippetsPerPaper = 10, minPublicationDate } = options;
  const tsQuery = keyword.trim().split(/\s+/).join(' & ');

  // Step 1: Fast GIN-only search to find distinct matching paper IDs (no join, no sort)
  const matchingPaperIds = await db
    .selectDistinct({ paperId: paperPages.paperId })
    .from(paperPages)
    .where(sql`${paperPages.textSearchVector} @@ to_tsquery('english', ${tsQuery})`)
    .limit(maxPapers * 10); // Overfetch to account for date filtering

  if (matchingPaperIds.length === 0) return [];

  const paperIdList = matchingPaperIds.map((r) => r.paperId);

  // Step 2: Look up those papers, apply date filter, sort by votes, take top N
  const paperWhereConditions = [inArray(papers.id, paperIdList)];
  if (minPublicationDate !== undefined) {
    paperWhereConditions.push(gte(papers.publicationDate, minPublicationDate));
  }

  const topPapers = await db
    .select({
      id: papers.id,
      title: papers.title,
      universalId: papers.universalId,
      votes: papers.votes,
      publicationDate: papers.publicationDate,
    })
    .from(papers)
    .where(and(...paperWhereConditions))
    .orderBy(desc(papers.votes))
    .limit(maxPapers);

  if (topPapers.length === 0) return [];

  const topPaperIds = topPapers.map((p) => p.id);

  // Step 3: Fetch matching page snippets only for the top papers
  const pageResults = await db
    .select({
      paperId: paperPages.paperId,
      pageNumber: paperPages.pageNumber,
      text: paperPages.text,
    })
    .from(paperPages)
    .where(
      and(
        inArray(paperPages.paperId, topPaperIds),
        sql`${paperPages.textSearchVector} @@ to_tsquery('english', ${tsQuery})`,
      )
    );

  // Build a lookup for paper details
  const paperDetailsMap = new Map(topPapers.map((p) => [p.id, p]));

  // Assemble results in votes-sorted order
  const paperMap = new Map<PaperId, {
    universalId: string;
    paperTitle: string;
    votes: number;
    publicationDate: Date;
    occurrences: Array<{
      pageNumber: number;
      snippet: string;
    }>;
  }>();

  // Initialize in sorted order
  for (const paper of topPapers) {
    paperMap.set(paper.id, {
      universalId: paper.universalId,
      paperTitle: paper.title,
      votes: paper.votes,
      publicationDate: paper.publicationDate,
      occurrences: [],
    });
  }

  // Fill in snippets
  for (const page of pageResults) {
    const paper = paperMap.get(page.paperId);
    if (!paper || paper.occurrences.length >= maxSnippetsPerPaper) continue;

    const snippets = extractSnippets(page.text, keyword);

    for (const snippet of snippets) {
      if (paper.occurrences.length >= maxSnippetsPerPaper) break;

      paper.occurrences.push({
        pageNumber: page.pageNumber,
        snippet,
      });
    }
  }

  return Array.from(paperMap.values());
};

function extractSnippets(text: string, keyword: string, windowSize: number = 400): string[] {
  const lowerText = text.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();
  const keywords = lowerKeyword.split(/\s+/);
  
  const snippets: string[] = [];
  
  for (const kw of keywords) {
    const index = lowerText.indexOf(kw);
    if (index === -1) continue;
    
    const start = Math.max(0, index - Math.floor(windowSize / 2));
    const end = Math.min(text.length, start + windowSize);
    
    let snippet = text.slice(start, end);
    
    if (start > 0) snippet = '...' + snippet;
    if (end < text.length) snippet = snippet + '...';
    
    snippets.push(snippet);
  }
  
  if (snippets.length === 0) {
    return [text.slice(0, windowSize) + (text.length > windowSize ? '...' : '')];
  }
  
  return snippets;
}

export const insertPaperAbstractEmbedding = async (paperId: PaperId, embedding: number[]) => {
  if (embedding.length !== 3072) {
    throw new Error("Invalid embedding: must be an array of 3072 numbers");
  }

  await db
    .insert(paperAbstractEmbeddings)
    .values({
      id: generate<PaperAbstractEmbeddingId>(),
      paperId,
      abstractEmbedding: embedding,
      abstractEmbeddingHalf: embedding,
    })
    .onConflictDoNothing();
};

/**
 * Search for papers by embedding similarity
 * @param queryEmbedding The embedding vector to search for similar papers
 * @param options Search options including limit and minimum publication date
 * @returns Array of papers sorted by similarity to the query, with their similarity scores
 */
export const searchPapersByEmbedding = async (
  queryEmbedding: number[],
  options: {
    limit?: number;
    minPublicationDate?: Date;
  } = {}
) => {
  const { limit = 100, minPublicationDate } = options;

  // Validate embedding dimensions
  if (queryEmbedding.length !== 3072) {
    throw new Error(`Invalid embedding dimensions: expected 3072, got ${queryEmbedding.length}`);
  }

  // Use transaction with SET LOCAL to ensure ef_search only affects this query
  const result = await db.transaction(async (tx) => {
    // Increase ef_search to explore more of the HNSW graph (default is ~40)
    // Higher values give better recall at the cost of query speed
    await tx.execute(sql`SET LOCAL hnsw.ef_search = 1000`);

    // Query the HNSW index for similar embeddings
    // Using halfvec for the index as it fits in 8kb pages for better performance
    const similarPapers = await tx
      .select({
        paperId: paperAbstractEmbeddings.paperId,
        distance: sql<number>`abstract_embedding_half <=> ${sql.raw(`'[${queryEmbedding.join(",")}]'::halfvec`)}`,
      })
      .from(paperAbstractEmbeddings)
      .orderBy(sql`abstract_embedding_half <=> ${sql.raw(`'[${queryEmbedding.join(",")}]'::halfvec`)}`)
      .limit(limit);

    const paperIds = similarPapers.map((p) => p.paperId);

    // Build where conditions
    const whereConditions = [inArray(papers.id, paperIds)];
    
    if (minPublicationDate !== undefined) {
      whereConditions.push(gte(papers.publicationDate, minPublicationDate));
    }

    // Join with papers table to get full paper details
    const filteredResults = await tx
      .select({
        id: papers.id,
        title: papers.title,
        abstract: papers.abstract,
        universalId: papers.universalId,
        publicationDate: papers.publicationDate,
        votes: papers.votes,
      })
      .from(papers)
      .where(and(...whereConditions));

    // Create a map to preserve similarity order and add distance scores
    const paperIdToDistance = new Map(
      similarPapers.map((p) => [p.paperId, p.distance])
    );

    const paperIdToDetails = new Map(
      filteredResults.map((p) => [p.id, p])
    );

    // Maintain original similarity order and combine with paper details
    return paperIds
      .map((paperId) => {
        const details = paperIdToDetails.get(paperId);
        if (!details) return null;
        
        const { id, ...detailsWithoutId } = details;
        
        return {
          ...detailsWithoutId,
          similarityDistance: paperIdToDistance.get(paperId) ?? 1.0,
        };
      })
      .filter((paper): paper is NonNullable<typeof paper> => paper !== null)
      .slice(0, limit); // Trim to requested limit after filtering
  });

  return result;
};

