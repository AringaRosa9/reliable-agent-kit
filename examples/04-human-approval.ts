/**
 * Example 04: Human Approval Flow
 *
 * An agent where dangerous operations (e.g. divide, deploy) require
 * human approval before execution. Demonstrates the full approval lifecycle:
 * agent selects tool → pauses → human approves/rejects → resumes.
 *
 * Demonstrates: createHumanHandler, approval intents, rejection feedback
 */
import {
  createAgentLoop,
  createHumanHandler,
  Thread,
  MemoryStore,
} from "../src/index.js";
import type { HumanContactRequest, HumanPayload } from "../src/index.js";

interface Step {
  intent: string;
  a?: number;
  b?: number;
  message?: string;
}

let turn = 0;
async function mockLLM(_context: string): Promise<Step> {
  turn++;
  switch (turn) {
    case 1:
      return { intent: "add", a: 10, b: 5 };
    case 2:
      // This will require approval
      return { intent: "divide", a: 15, b: 3 };
    case 3:
      return { intent: "done_for_now", message: "Result: 10 + 5 = 15, 15 / 3 = 5" };
    default:
      return { intent: "done_for_now", message: "Done" };
  }
}

const loop = createAgentLoop<Step>({
  resolveNextStep: mockLLM,
  getIntent: (step) => step.intent,
  tools: {
    add: async (step) => (step.a ?? 0) + (step.b ?? 0),
    divide: async (step) => (step.a ?? 0) / (step.b ?? 0),
  },
  // divide is an approval intent — agent pauses before executing
  pauseIntents: ["done_for_now", "request_clarification", "divide"],
});

const humanHandler = createHumanHandler({
  approvalIntents: ["divide"],
  responseIntents: ["request_clarification", "done_for_now"],
  onContactHuman: async (request: HumanContactRequest) => {
    console.log(`\n📨 Human contacted:`, {
      type: request.type,
      intent: request.intent,
      message: request.message,
    });
  },
  formatForHuman: (intent, step) => {
    if (intent === "divide") {
      return `Agent wants to divide ${step.a} by ${step.b}. Approve?`;
    }
    return step.message ?? JSON.stringify(step);
  },
});

async function main() {
  const store = new MemoryStore();

  // --- Turn 1: Agent runs, does add(10,5), then pauses on divide(15,3) ---
  console.log("=== Turn 1: Agent runs until approval needed ===");
  const thread = new Thread({
    approvalIntents: ["divide"],
  });
  thread.addEvent({ type: "user_input", data: "Add 10+5, then divide by 3" });

  const threadId = store.create(thread.snapshot());
  const result1 = await loop.run(thread);
  store.update(threadId, thread.snapshot());

  console.log("Exit reason:", result1.exitReason);
  console.log("Last intent:", result1.lastIntent);

  // Handle the pause — notify human
  await humanHandler.handlePause(threadId, thread);

  // --- Turn 2: Human approves the divide operation ---
  console.log("\n=== Turn 2: Human approves ===");
  const approval: HumanPayload = { type: "approval", approved: true, comment: "Looks good" };
  const restored = Thread.fromSnapshot(store.get(threadId)!, {
    approvalIntents: ["divide"],
  });

  humanHandler.handleResponse(restored, approval);

  // Execute the approved tool manually, then resume
  const lastToolCall = restored.events.filter((e) => e.type === "tool_call").pop();
  if (lastToolCall) {
    const handler = loop.config.tools[lastToolCall.data.intent];
    if (handler) {
      const toolResult = await handler(lastToolCall.data, restored);
      restored.addEvent({ type: "tool_response", data: toolResult });
    }
  }

  const result2 = await loop.run(restored);
  store.update(threadId, restored.snapshot());

  console.log("\nFinal exit:", result2.exitReason);
  console.log("Events:");
  restored.events.forEach((e, i) => {
    console.log(`  ${i}: [${e.type}] ${JSON.stringify(e.data)}`);
  });
}

main().catch(console.error);
