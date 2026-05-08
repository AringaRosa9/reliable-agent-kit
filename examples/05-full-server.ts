/**
 * Example 05: Full HTTP Server with Webhook Support
 *
 * A complete Express server exposing the agent as an API.
 * Supports: create thread, get status, human response, external webhooks.
 *
 * Demonstrates: createAgentRouter, async mode, full lifecycle
 *
 * Routes:
 *   POST   /api/thread           — Start a new agent thread
 *   GET    /api/thread/:id       — Get thread status & events
 *   POST   /api/thread/:id/respond — Human responds (approval or clarification)
 *   POST   /api/webhook          — External webhook (e.g. from email/Slack)
 *   DELETE /api/thread/:id       — Delete a thread
 */
import express from "express";
import {
  createAgentLoop,
  createHumanHandler,
  createAgentRouter,
  MemoryStore,
} from "../src/index.js";

interface Step {
  intent: string;
  a?: number;
  b?: number;
  message?: string;
  query?: string;
}

// In production, replace with actual LLM call
async function callLLM(context: string): Promise<Step> {
  // Simple mock: always respond with done_for_now
  return {
    intent: "done_for_now",
    message: "I've processed your request.",
  };
}

// --- Setup ---

const store = new MemoryStore();

const loop = createAgentLoop<Step>({
  resolveNextStep: callLLM,
  getIntent: (step) => step.intent,
  tools: {
    add: async (step) => (step.a ?? 0) + (step.b ?? 0),
    subtract: async (step) => (step.a ?? 0) - (step.b ?? 0),
    multiply: async (step) => (step.a ?? 0) * (step.b ?? 0),
    divide: async (step) => {
      if (step.b === 0) throw new Error("Division by zero");
      return (step.a ?? 0) / (step.b ?? 0);
    },
    search: async (step) => `Results for "${step.query}": [item1, item2, item3]`,
  },
  pauseIntents: ["done_for_now", "request_clarification", "divide"],
  maxIterations: 20,
  maxConsecutiveErrors: 3,
});

const humanHandler = createHumanHandler({
  approvalIntents: ["divide"],
  responseIntents: ["request_clarification", "done_for_now"],
  onContactHuman: async (request) => {
    console.log(`[HumanContact] ${request.type} for thread ${request.threadId}:`, request.message);
    // In production: send email, Slack message, push notification, etc.
  },
  formatForHuman: (intent, step) => {
    if (intent === "divide") {
      return `Agent wants to divide ${step.a} by ${step.b}. Approve?`;
    }
    return step.message ?? JSON.stringify(step);
  },
});

const agentRouter = createAgentRouter({
  store,
  loop,
  humanHandler,
  async: true,
  onComplete: async (threadId, thread) => {
    console.log(`[Complete] Thread ${threadId}: ${thread.lastIntent()}`);
  },
});

// --- Server ---

const app = express();
app.use(express.json());
app.use("/api", agentRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", threads: store.size() });
});

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`Agent server running on http://localhost:${PORT}`);
  console.log(`
Try it:
  curl -X POST http://localhost:${PORT}/api/thread \\
    -H "Content-Type: application/json" \\
    -d '{"message": "Hello agent!"}'
  `);
});
