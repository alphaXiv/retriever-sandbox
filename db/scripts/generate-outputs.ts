import { createResearchAgent } from "../../src/agents/research.agent";
import { mkdir, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import pLimit from "p-limit";

// Array of queries to process
const queries: string[] = [
//   "What are tricks for converging during pre-training that popular open source models use?",
//   "What are tricks to improve stability during post-training?",
//   "What's the typical ratio of learning rates between pre-training and SFT fine-tuning for LLMs?",
//   "Which OCR methods do best on OmniDocBench?",
//   "What techniques are used to optimize LLMs for inference on local devices (phones, laptops, etc)?",
//   "What are the common techniques to extend the context window of an LLM that was using RoPE embeddings?",
//   "What are the best positional embedding techniques for LLMs?",
//   "When does adding a KL penalty with the reference policy help when RL fine-tuning?",
//   "What are some strategies for maximizing GPU utilization and minimizing data staleness when doing distributed RL fine-tuning of LLMs?",
//   "What are the most important and trusted benchmarks for evaluating OCR models?",
//   "What are the most important benchmarks for evaluating LLM agents in mulit-turn long horizon settings?",
//   "What are good methods for dealing with extremely long context lengths with LLMs?",
//   "What are common techniques for improving LLM pre-training instability?",
//   "What are specific regularization techniques for reducing LLM pre-training instability?",
//   "What are good benchmarks to assess LLM's tool calling abilities?",
//   "What's a good preference optimization algorithm to use if instead of having paired preference data I have raw responses like upvote/downvote from users?",
//   "What architectural changes can I make to improve convergence when training my model?",
//   "How does sequence packing affect model accuracy for LLMs during Supervised Fine Tuning?",
//   "What are the three most important hyperparameters that influence LLM preference optimization fine-tuning specifically?",
//   "Which papers use transformers in a recursive architecture to solve puzzles?",
//   "What techniques exist for when I want to fine-tune my LLM with RL but I don't have easily verifiable rewards?",
//   "What are techniques to mitigate reward-hacking when RL fine-tuning LLMs for reasoning?",
//   "What are some good datasets to do SFT LLM post-training on to learn reasoning?",
//   "What is currently the best performing model (both open source and closed source) on the multi-turn benchmark Tau bench?",
//   "What are some important considerations when doing RL fine-tuning for agents in a multi-turn setting as opposed to just single-turn envs?",
//   "What are popular optimization objectives for RL fine-tuning LLMs today?",
//   "Which open-source LLM is best to do RL fine-tuning on top of?",
//   "What are the best benchmarks to test an LLM in its ability to do \"deep research\"?",
//   "What is more prone to inducing catastrophic forgetting in LLMs: supervised fine-tuning or RL fine-tuning?",
//   "Which factor plays a larger role in mitigating catastrophic forgetting for RL fine-tuning LLMs: the KL divergence term or the usage of on-policy data?",
//   "Describe the pareto frontier that RL and SFT fine-tuning for LLMs sit on. What are the tradeoffs of each method?",
//   "What learning rate schedules work best for RL post-training LLMs?",
//   "What are typical batch sizes, number of prompts, and number of rollouts per prompt used during GRPO training?",
//   "What are new RL post-training algorithms to address model collapse?",
//   "Why is Qwen so easily able to replicate realistic chat-like behavior when RL-ing with cold start?",
//   "What improvements can be made to GRPO to improve stability when RL fine-tuning MOE models?",
];

async function generateOutputs() {
  console.log(`Processing ${queries.length} queries in parallel (pool size: 5)...\n`);

  // Get repo root by going up two levels from db/scripts/
  const currentFileDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(currentFileDir, "..", "..");
  const outputsDir = join(repoRoot, "outputs");
  await mkdir(outputsDir, { recursive: true });

  const limit = pLimit(5);
  let completed = 0;
  const total = queries.length;
  const progressInterval = Math.max(1, Math.floor(total / 20));

  const processQuery = async (query: string, index: number) => {
    if (!query) return;

    try {
      console.log(`[${index + 1}/${total}] Starting query: ${query}`);
      
      const agent = createResearchAgent();
      const result = await agent.run(query);

      // Save output to file
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `research-${timestamp}.json`;
      const filepath = join(outputsDir, filename);

      const outputData = {
        query,
        response: result.output,
        timestamp: new Date().toISOString(),
      };

      await writeFile(filepath, JSON.stringify(outputData, null, 2), "utf-8");
      
      completed++;
      
      // Log progress periodically
      if (completed % progressInterval === 0 || completed === total) {
        const percentage = Math.round((completed / total) * 100);
        process.stdout.write(
          `\rProgress: ${completed}/${total} (${percentage}%)`
        );
      }
      
      console.log(`✅ [${index + 1}/${total}] Completed: ${query}`);
    } catch (error) {
      completed++;
      console.error(`❌ [${index + 1}/${total}] Error processing query "${query}":`, error);
      
      // Log progress even on error
      if (completed % progressInterval === 0 || completed === total) {
        const percentage = Math.round((completed / total) * 100);
        process.stdout.write(
          `\rProgress: ${completed}/${total} (${percentage}%)`
        );
      }
    }
  };

  // Process all queries in parallel with limit
  const promises = queries.map((query, index) =>
    limit(() => processQuery(query, index))
  );

  await Promise.all(promises);

  // Clear the progress line
  process.stdout.write("\r" + " ".repeat(50) + "\r");
  
  console.log(`\nCompleted processing ${queries.length} queries`);
}

generateOutputs()
  .then(() => {
    console.log("\nDone!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nError:", error);
    process.exit(1);
  });
