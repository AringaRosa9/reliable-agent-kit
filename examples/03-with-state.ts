/**
 * Example 03: Stateful Agent with Persistence
 *
 * Shows how to persist thread state using MemoryStore (or FileStore),
 * pause on clarification, and resume after receiving a human response.
 *
 * Demonstrates: ThreadStore, snapshot/restore, pause/resume pattern
 */
import { createAgentLoop, Thread, MemoryStore } from "../src/index.js";

interface Step {
  intent: string;
  message?: string;
  query?: string;
}

let turn = 0;
async function mockLLM(context: string): Promise<Step> {
  turn++;
  if (turn === 1) {
    return {
      intent: "request_clarification",
      message: "What currency should I use for the conversion?",
    };
  }
  return {
    intent: "done_for_now",
    message: "Got it — I'll use USD. The total is $42.00.",
  };
}

const loop = createAgentLoop<Step>({
  resolveNextStep: mockLLM,
  getIntent: (step) => step.intent,
  tools: {},
  pauseIntents: ["done_for_now", "request_clarification"],
});

async function main() {
  const store = new MemoryStore();

  // --- Turn 1: User sends a message, agent asks for clarification ---
  console.log("=== Turn 1: Initial request ===");
  const thread = new Thread();
  thread.addEvent({ type: "user_input", data: "Convert 42 to another currency" });

  const threadId = store.create(thread.snapshot());
  await loop.run(thread);
  store.update(threadId, thread.snapshot());

  console.log("Status:", thread.status(threadId));
  console.log("Awaiting human?", thread.isAwaitingHuman());

  // --- Turn 2: Human responds, agent resumes ---
  console.log("\n=== Turn 2: Human responds ===");
  const restored = Thread.fromSnapshot(store.get(threadId)!);
  restored.addEvent({ type: "human_response", data: "Use USD" });

  await loop.run(restored);
  store.update(threadId, restored.snapshot());

  console.log("Final events:");
  console.log(restored.serialize({ format: "json", pretty: true }));
}

main().catch(console.error);
