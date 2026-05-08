/**
 * Example 01: Basic Agent Loop
 *
 * The simplest possible agent — an echo bot that receives user input
 * and immediately responds with done_for_now.
 *
 * Demonstrates: createAgentLoop, Thread, pauseIntents
 */
import { createAgentLoop, Thread } from "../src/index.js";

// Simulate an LLM that always says "done"
async function mockLLM(context: string) {
  return {
    intent: "done_for_now",
    message: `You said: ${JSON.parse(context).pop()?.data ?? "nothing"}`,
  };
}

const loop = createAgentLoop({
  resolveNextStep: mockLLM,
  getIntent: (step) => step.intent,
  tools: {},
  pauseIntents: ["done_for_now", "request_clarification"],
});

async function main() {
  const thread = new Thread();
  thread.addEvent({ type: "user_input", data: "Hello, agent!" });

  const result = await loop.run(thread);

  console.log("Exit reason:", result.exitReason);
  console.log("Iterations:", result.iterations);
  console.log("Events:", JSON.stringify(thread.events, null, 2));
}

main().catch(console.error);
