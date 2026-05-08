import { describe, it, expect, vi } from "vitest";
import { createHumanHandler } from "../src/human-in-loop/handler.js";
import { Thread } from "../src/thread-state/thread.js";

describe("createHumanHandler", () => {
  function makeHandler(onContact = vi.fn()) {
    return createHumanHandler({
      approvalIntents: ["deploy", "delete"],
      responseIntents: ["request_clarification", "done_for_now"],
      onContactHuman: onContact,
      formatForHuman: (intent, step) => {
        if (intent === "deploy") return `Deploy ${step.target}?`;
        return step.message ?? JSON.stringify(step);
      },
    });
  }

  describe("needsApproval / needsResponse", () => {
    it("should correctly identify approval intents", () => {
      const handler = makeHandler();
      expect(handler.needsApproval("deploy")).toBe(true);
      expect(handler.needsApproval("delete")).toBe(true);
      expect(handler.needsApproval("add")).toBe(false);
    });

    it("should correctly identify response intents", () => {
      const handler = makeHandler();
      expect(handler.needsResponse("request_clarification")).toBe(true);
      expect(handler.needsResponse("done_for_now")).toBe(true);
      expect(handler.needsResponse("deploy")).toBe(false);
    });
  });

  describe("handlePause", () => {
    it("should create approval request for approval intents", async () => {
      const onContact = vi.fn();
      const handler = makeHandler(onContact);

      const thread = new Thread();
      thread.addEvent({
        type: "tool_call",
        data: { intent: "deploy", target: "production" },
      });

      const request = await handler.handlePause("thread-1", thread);

      expect(request).not.toBeNull();
      expect(request!.type).toBe("approval");
      expect(request!.intent).toBe("deploy");
      expect(request!.message).toBe("Deploy production?");
      expect(onContact).toHaveBeenCalledOnce();
    });

    it("should create response request for response intents", async () => {
      const onContact = vi.fn();
      const handler = makeHandler(onContact);

      const thread = new Thread();
      thread.addEvent({
        type: "tool_call",
        data: { intent: "request_clarification", message: "What format?" },
      });

      const request = await handler.handlePause("thread-1", thread);

      expect(request).not.toBeNull();
      expect(request!.type).toBe("response");
      expect(request!.message).toBe("What format?");
    });

    it("should return null for non-human intents", async () => {
      const handler = makeHandler();

      const thread = new Thread();
      thread.addEvent({
        type: "tool_call",
        data: { intent: "add", a: 1, b: 2 },
      });

      const request = await handler.handlePause("thread-1", thread);
      expect(request).toBeNull();
    });

    it("should return null if last event is not a tool_call", async () => {
      const handler = makeHandler();

      const thread = new Thread();
      thread.addEvent({ type: "tool_response", data: 42 });

      const request = await handler.handlePause("thread-1", thread);
      expect(request).toBeNull();
    });
  });

  describe("handleResponse", () => {
    it("should add human_approval event on approval", () => {
      const handler = makeHandler();
      const thread = new Thread();
      thread.addEvent({ type: "tool_call", data: { intent: "deploy" } });

      handler.handleResponse(thread, {
        type: "approval",
        approved: true,
        comment: "Ship it",
      });

      const last = thread.lastEvent()!;
      expect(last.type).toBe("human_approval");
      expect(last.data.approved).toBe(true);
      expect(last.data.comment).toBe("Ship it");
    });

    it("should add tool_response with rejection feedback on denial", () => {
      const handler = makeHandler();
      const thread = new Thread();
      thread.addEvent({ type: "tool_call", data: { intent: "delete" } });

      handler.handleResponse(thread, {
        type: "approval",
        approved: false,
        comment: "Too risky",
      });

      const last = thread.lastEvent()!;
      expect(last.type).toBe("tool_response");
      expect(last.data.rejected).toBe(true);
      expect(last.data.feedback).toBe("Too risky");
    });

    it("should add human_response event on response", () => {
      const handler = makeHandler();
      const thread = new Thread();
      thread.addEvent({
        type: "tool_call",
        data: { intent: "request_clarification" },
      });

      handler.handleResponse(thread, {
        type: "response",
        response: "Use JSON format please",
      });

      const last = thread.lastEvent()!;
      expect(last.type).toBe("human_response");
      expect(last.data).toBe("Use JSON format please");
    });
  });
});
