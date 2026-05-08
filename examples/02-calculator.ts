/**
 * Example 02: Calculator Agent
 *
 * An agent with actual tools — add, subtract, multiply, divide.
 * Shows the core tool dispatch pattern with multiple iterations.
 *
 * Demonstrates: tools map, multi-step execution, XML serialization
 */
import { createAgentLoop, Thread } from "../src/index.js";

interface CalculatorStep {
  intent: string;
  a?: number;
  b?: number;
  message?: string;
}

// Simulate an LLM that plans a multi-step calculation: (3 + 4) * 2
let callCount = 0;
async function mockCalculatorLLM(_context: string): Promise<CalculatorStep> {
  callCount++;
  switch (callCount) {
    case 1:
      return { intent: "add", a: 3, b: 4 };
    case 2:
      return { intent: "multiply", a: 7, b: 2 };
    case 3:
      return { intent: "done_for_now", message: "The result of (3 + 4) * 2 = 14" };
    default:
      return { intent: "done_for_now", message: "Done" };
  }
}

const loop = createAgentLoop<CalculatorStep>({
  resolveNextStep: mockCalculatorLLM,
  getIntent: (step) => step.intent,
  tools: {
    add: async (step) => (step.a ?? 0) + (step.b ?? 0),
    subtract: async (step) => (step.a ?? 0) - (step.b ?? 0),
    multiply: async (step) => (step.a ?? 0) * (step.b ?? 0),
    divide: async (step) => {
      if (step.b === 0) throw new Error("Division by zero");
      return (step.a ?? 0) / (step.b ?? 0);
    },
  },
  pauseIntents: ["done_for_now", "request_clarification"],
});

async function main() {
  const thread = new Thread({
    serializeFormat: { format: "xml" },
  });
  thread.addEvent({
    type: "user_input",
    data: "Calculate (3 + 4) * 2",
  });

  const result = await loop.run(thread);

  console.log("Exit reason:", result.exitReason);
  console.log("Iterations:", result.iterations);
  console.log("\n--- Thread (XML) ---");
  console.log(thread.serialize());
  console.log("\n--- Thread (JSON) ---");
  console.log(thread.serialize({ format: "json", pretty: true }));
}

main().catch(console.error);
