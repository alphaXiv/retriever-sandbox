import { searchPaperPagesByKeyword } from "../services/papers";

const BATCH_SIZE = 100; // increment this yourself
const TOTAL = 1_000_000;

const ML_WORDS = [
  "neural", "network", "transformer", "attention", "gradient", "backpropagation", "convolution",
  "recurrent", "embedding", "tokenizer", "encoder", "decoder", "autoregressive", "diffusion",
  "generative", "discriminative", "adversarial", "reinforcement", "supervised", "unsupervised",
  "self-supervised", "contrastive", "pretraining", "finetuning", "distillation", "pruning",
  "quantization", "sparsity", "regularization", "dropout", "normalization", "batch", "layer",
  "activation", "softmax", "sigmoid", "relu", "loss", "cross-entropy", "perplexity",
  "likelihood", "bayesian", "variational", "latent", "representation", "feature", "kernel",
  "pooling", "stride", "residual", "skip", "connection", "bottleneck", "architecture",
  "scaling", "parameter", "hyperparameter", "optimization", "stochastic", "momentum",
  "learning", "rate", "scheduler", "warmup", "curriculum", "augmentation", "overfitting",
  "underfitting", "bias", "variance", "ensemble", "boosting", "bagging", "classification",
  "regression", "segmentation", "detection", "recognition", "generation", "translation",
  "summarization", "retrieval", "ranking", "clustering", "dimensionality", "reduction",
  "manifold", "interpolation", "extrapolation", "robustness", "adversarial", "perturbation",
  "benchmark", "evaluation", "metric", "precision", "recall", "accuracy", "inference",
  "multimodal", "vision", "language", "speech", "alignment", "reward", "policy", "agent",
  "exploration", "exploitation", "trajectory", "reward", "discount", "temporal",
];

function randomQuery(): string {
  const wordCount = 1 + Math.floor(Math.random() * 3); // 1–3 words
  const words: string[] = [];
  for (let i = 0; i < wordCount; i++) {
    words.push(ML_WORDS[Math.floor(Math.random() * ML_WORDS.length)]!);
  }
  return words.join(" ");
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

async function callSearch(query: string): Promise<{ query: string; ok: boolean; ms: number }> {
  const start = performance.now();
  try {
    await searchPaperPagesByKeyword(query);
    const ms = performance.now() - start;
    return { query, ok: true, ms };
  } catch {
    const ms = performance.now() - start;
    return { query, ok: false, ms };
  }
}

async function main() {
  console.log(`Starting search test — BATCH_SIZE=${BATCH_SIZE}, TOTAL=${TOTAL}`);
  console.log("---");

  let succeeded = 0;
  let failed = 0;
  let totalMs = 0;

  for (let i = 1; i <= TOTAL; i += BATCH_SIZE) {
    const batchStart = performance.now();
    const batchSize = Math.min(BATCH_SIZE, TOTAL - i + 1);
    const queries = Array.from({ length: batchSize }, () => randomQuery());

    // all calls in the batch fire in parallel
    const results = await Promise.all(queries.map(callSearch));

    const batchMs = performance.now() - batchStart;
    totalMs += batchMs;

    const times = results.map((r) => r.ms);
    const fastest = Math.min(...times);
    const slowest = Math.max(...times);
    const med = median(times);

    for (const r of results) {
      if (r.ok) {
        succeeded++;
      } else {
        failed++;
        console.error(`  ✗ query="${r.query}" (${r.ms.toFixed(0)}ms)`);
      }
    }

    const progress = Math.min(i + BATCH_SIZE - 1, TOTAL);
    const batchNum = Math.ceil(i / BATCH_SIZE);
    console.log(
      `Batch ${batchNum} | queries ${i}–${progress} | ` +
        `${batchMs.toFixed(0)}ms wall | ` +
        `fastest ${fastest.toFixed(0)}ms | median ${med.toFixed(0)}ms | slowest ${slowest.toFixed(0)}ms | ` +
        `✓ ${succeeded} ✗ ${failed}`
    );
  }

  console.log("---");
  console.log(
    `Done. ${succeeded} succeeded, ${failed} failed out of ${TOTAL}. ` +
      `Total wall time: ${(totalMs / 1000).toFixed(1)}s`
  );

  process.exit(0);
}

main().catch(console.error);
