import { Router } from "express";
import type { Request, Response } from "express";
import type { ThreadStore } from "../thread-state/types.js";
import type { AgentLoop } from "../agent-loop/types.js";
import type { HumanHandler, HumanPayload, WebhookEvent } from "./types.js";
import { Thread } from "../thread-state/thread.js";

export interface AgentRouterConfig {
  store: ThreadStore;
  loop: AgentLoop;
  humanHandler: HumanHandler;

  /** Thread constructor options passed when creating new threads */
  threadOptions?: ConstructorParameters<typeof Thread>[0];

  /**
   * Called when an agent loop completes (pauses or finishes).
   * Useful for sending notifications or updating external systems.
   */
  onComplete?: (threadId: string, thread: Thread) => Promise<void>;

  /**
   * If true, agent loop runs asynchronously — POST /thread returns immediately.
   * Default: false (synchronous).
   */
  async?: boolean;
}

export function createAgentRouter(config: AgentRouterConfig): Router {
  const {
    store,
    loop,
    humanHandler,
    threadOptions,
    onComplete,
    async: asyncMode = false,
  } = config;

  const router = Router();

  // POST /thread — Create a new thread and start the agent
  router.post("/thread", async (req: Request, res: Response) => {
    const { message, metadata } = req.body;
    if (!message) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    const thread = new Thread(threadOptions);
    thread.addEvent({ type: "user_input", data: message });
    if (metadata) {
      thread.metadata = { ...thread.metadata, ...metadata };
    }

    const threadId = store.create(thread.snapshot());

    if (asyncMode) {
      // Fire and forget — respond immediately
      runAndNotify(threadId, thread).catch(console.error);
      res.status(202).json({ threadId, status: "processing" });
      return;
    }

    const result = await loop.run(thread);
    store.update(threadId, thread.snapshot());

    if (result.exitReason === "paused") {
      await humanHandler.handlePause(threadId, thread);
    }
    if (onComplete) {
      await onComplete(threadId, thread);
    }

    res.status(200).json({
      threadId,
      status: result.exitReason,
      lastIntent: result.lastIntent,
      events: thread.events,
    });
  });

  // GET /thread/:id — Get thread status and events
  router.get("/thread/:id", (req: Request, res: Response) => {
    const id = paramAsString(req.params.id);
    const snapshot = store.get(id);
    if (!snapshot) {
      res.status(404).json({ error: "Thread not found" });
      return;
    }
    const thread = Thread.fromSnapshot(snapshot, threadOptions);
    res.json({
      ...thread.status(id),
      events: thread.events,
    });
  });

  // POST /thread/:id/respond — Human responds (approval or clarification)
  router.post("/thread/:id/respond", async (req: Request, res: Response) => {
    const id = paramAsString(req.params.id);
    const snapshot = store.get(id);
    if (!snapshot) {
      res.status(404).json({ error: "Thread not found" });
      return;
    }

    const thread = Thread.fromSnapshot(snapshot, threadOptions);
    const payload = req.body as HumanPayload;

    if (!payload?.type) {
      res.status(400).json({ error: "payload.type is required (approval | response)" });
      return;
    }

    // Apply human response to thread
    humanHandler.handleResponse(thread, payload);

    // If approval was granted for a tool that needs execution, run it
    if (payload.type === "approval" && payload.approved) {
      const lastToolCall = findLastToolCall(thread);
      if (lastToolCall) {
        const intent = lastToolCall.data?.intent;
        const handler = loop.config.tools[intent];
        if (handler) {
          try {
            const result = await handler(lastToolCall.data, thread);
            thread.addEvent({ type: "tool_response", data: result });
          } catch (error) {
            thread.addEvent({
              type: "error",
              data: { source: intent, message: (error as Error).message },
            });
          }
        }
      }
    }

    // Resume agent loop
    if (asyncMode) {
      runAndNotify(id, thread).catch(console.error);
      res.status(202).json({ threadId: id, status: "processing" });
      return;
    }

    const result = await loop.run(thread);
    store.update(id, thread.snapshot());

    if (result.exitReason === "paused") {
      await humanHandler.handlePause(id, thread);
    }
    if (onComplete) {
      await onComplete(id, thread);
    }

    res.json({
      threadId: id,
      status: result.exitReason,
      lastIntent: result.lastIntent,
      events: thread.events,
    });
  });

  // POST /webhook — External webhook handler (e.g. from HumanLayer, email, Slack)
  router.post("/webhook", async (req: Request, res: Response) => {
    const event = req.body as WebhookEvent;
    if (!event?.threadId || !event?.payload) {
      res.status(400).json({ error: "threadId and payload are required" });
      return;
    }

    const snapshot = store.get(event.threadId);
    if (!snapshot) {
      res.status(404).json({ error: "Thread not found" });
      return;
    }

    const thread = Thread.fromSnapshot(snapshot, threadOptions);
    humanHandler.handleResponse(thread, event.payload);

    if (event.payload.type === "approval" && event.payload.approved) {
      const lastToolCall = findLastToolCall(thread);
      if (lastToolCall) {
        const intent = lastToolCall.data?.intent;
        const handler = loop.config.tools[intent];
        if (handler) {
          try {
            const result = await handler(lastToolCall.data, thread);
            thread.addEvent({ type: "tool_response", data: result });
          } catch (error) {
            thread.addEvent({
              type: "error",
              data: { source: intent, message: (error as Error).message },
            });
          }
        }
      }
    }

    const result = await loop.run(thread);
    store.update(event.threadId, thread.snapshot());

    if (result.exitReason === "paused") {
      await humanHandler.handlePause(event.threadId, thread);
    }
    if (onComplete) {
      await onComplete(event.threadId, thread);
    }

    res.json({
      threadId: event.threadId,
      status: result.exitReason,
      lastIntent: result.lastIntent,
    });
  });

  // DELETE /thread/:id
  router.delete("/thread/:id", (req: Request, res: Response) => {
    const id = paramAsString(req.params.id);
    const deleted = store.delete(id);
    if (!deleted) {
      res.status(404).json({ error: "Thread not found" });
      return;
    }
    res.json({ deleted: true });
  });

  async function runAndNotify(threadId: string, thread: Thread): Promise<void> {
    const result = await loop.run(thread);
    store.update(threadId, thread.snapshot());

    if (result.exitReason === "paused") {
      await humanHandler.handlePause(threadId, thread);
    }
    if (onComplete) {
      await onComplete(threadId, thread);
    }
  }

  return router;
}

function paramAsString(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

function findLastToolCall(thread: Thread) {
  for (let i = thread.events.length - 1; i >= 0; i--) {
    if (thread.events[i].type === "tool_call") {
      return thread.events[i];
    }
  }
  return null;
}
