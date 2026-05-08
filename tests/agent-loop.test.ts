import { describe, it, expect, vi } from "vitest";
import { createAgentLoop } from "../src/agent-loop/index.js";
import { Thread } from "../src/thread-state/thread.js";

function makeStep(intent: string, extra?: Record<string, any>) {
  return { intent, ...extra };
}

describe("createAgentLoop", () => {
  it("should pause on pauseIntents", async () => {
    const loop = createAgentLoop({
      resolveNextStep: async () => makeStep("done_for_now", { message: "hi" }),
      getIntent: (s) => s.intent,
      tools: {},
      pauseIntents: ["done_for_now"],
    });

    const thread = new Thread();
    thread.addEvent({ type: "user_input", data: "hello" });
    const result = await loop.run(thread);

    expect(result.exitReason).toBe("paused");
    expect(result.lastIntent).toBe("done_for_now");
    expect(result.iterations).toBe(1);
    expect(thread.events).toHaveLength(2); // user_input + tool_call
  });

  it("should execute tools and continue looping", async () => {
    let call = 0;
    const loop = createAgentLoop({
      resolveNextStep: async () => {
        call++;
        if (call <= 2) return makeStep("add", { a: call, b: call });
        return makeStep("done_for_now", { message: "done" });
      },
      getIntent: (s) => s.intent,
      tools: {
        add: async (step) => step.a + step.b,
      },
      pauseIntents: ["done_for_now"],
    });

    const thread = new Thread();
    thread.addEvent({ type: "user_input", data: "go" });
    const result = await loop.run(thread);

    expect(result.exitReason).toBe("paused");
    expect(result.iterations).toBe(3);
    // user_input, tool_call(add), tool_response, tool_call(add), tool_response, tool_call(done)
    expect(thread.events).toHaveLength(6);

    const responses = thread.events.filter((e) => e.type === "tool_response");
    expect(responses[0].data).toBe(2); // 1+1
    expect(responses[1].data).toBe(4); // 2+2
  });

  it("should stop at maxIterations", async () => {
    const loop = createAgentLoop({
      resolveNextStep: async () => makeStep("add", { a: 1, b: 1 }),
      getIntent: (s) => s.intent,
      tools: { add: async (step) => step.a + step.b },
      pauseIntents: ["done_for_now"],
      maxIterations: 3,
    });

    const thread = new Thread();
    thread.addEvent({ type: "user_input", data: "loop forever" });
    const result = await loop.run(thread);

    expect(result.exitReason).toBe("max_iterations");
    expect(result.iterations).toBe(3);
  });

  it("should handle tool errors and count consecutive errors", async () => {
    let call = 0;
    const loop = createAgentLoop({
      resolveNextStep: async () => {
        call++;
        if (call <= 3) return makeStep("fail_tool");
        return makeStep("done_for_now");
      },
      getIntent: (s) => s.intent,
      tools: {
        fail_tool: async () => {
          throw new Error("tool broke");
        },
      },
      pauseIntents: ["done_for_now"],
      maxConsecutiveErrors: 3,
    });

    const thread = new Thread();
    thread.addEvent({ type: "user_input", data: "go" });
    const result = await loop.run(thread);

    expect(result.exitReason).toBe("max_errors");
    const errors = thread.events.filter((e) => e.type === "error");
    expect(errors).toHaveLength(3);
  });

  it("should reset consecutive error count after a success", async () => {
    let call = 0;
    const loop = createAgentLoop({
      resolveNextStep: async () => {
        call++;
        if (call === 1) return makeStep("fail_tool");
        if (call === 2) return makeStep("add", { a: 1, b: 2 });
        if (call === 3) return makeStep("fail_tool");
        return makeStep("done_for_now");
      },
      getIntent: (s) => s.intent,
      tools: {
        fail_tool: async () => {
          throw new Error("broken");
        },
        add: async (step) => step.a + step.b,
      },
      pauseIntents: ["done_for_now"],
      maxConsecutiveErrors: 2,
    });

    const thread = new Thread();
    thread.addEvent({ type: "user_input", data: "go" });
    const result = await loop.run(thread);

    // error -> success (reset) -> error -> done
    expect(result.exitReason).toBe("paused");
    expect(result.iterations).toBe(4);
  });

  it("should handle unknown tools gracefully", async () => {
    const loop = createAgentLoop({
      resolveNextStep: async () => makeStep("unknown_tool"),
      getIntent: (s) => s.intent,
      tools: {},
      pauseIntents: ["done_for_now"],
    });

    const thread = new Thread();
    thread.addEvent({ type: "user_input", data: "go" });
    const result = await loop.run(thread);

    expect(result.exitReason).toBe("no_handler");
    const errors = thread.events.filter((e) => e.type === "error");
    expect(errors[0].data.message).toContain("Unknown tool");
  });

  it("should call beforeToolExec and skip if returns false", async () => {
    let call = 0;
    const loop = createAgentLoop({
      resolveNextStep: async () => {
        call++;
        if (call === 1) return makeStep("add", { a: 1, b: 2 });
        return makeStep("done_for_now");
      },
      getIntent: (s) => s.intent,
      tools: { add: async (step) => step.a + step.b },
      pauseIntents: ["done_for_now"],
      beforeToolExec: async (intent) => intent !== "add", // skip add
    });

    const thread = new Thread();
    thread.addEvent({ type: "user_input", data: "go" });
    await loop.run(thread);

    const responses = thread.events.filter((e) => e.type === "tool_response");
    expect(responses[0].data).toEqual({ skipped: true, intent: "add" });
  });

  it("should call onError and respect its return value", async () => {
    const onError = vi.fn().mockReturnValue("pause");
    const loop = createAgentLoop({
      resolveNextStep: async () => makeStep("fail_tool"),
      getIntent: (s) => s.intent,
      tools: {
        fail_tool: async () => {
          throw new Error("boom");
        },
      },
      pauseIntents: ["done_for_now"],
      onError,
    });

    const thread = new Thread();
    thread.addEvent({ type: "user_input", data: "go" });
    const result = await loop.run(thread);

    expect(result.exitReason).toBe("paused");
    expect(onError).toHaveBeenCalledOnce();
  });

  it("should handle LLM errors", async () => {
    let call = 0;
    const loop = createAgentLoop({
      resolveNextStep: async () => {
        call++;
        if (call <= 3) throw new Error("LLM timeout");
        return makeStep("done_for_now");
      },
      getIntent: (s) => s.intent,
      tools: {},
      pauseIntents: ["done_for_now"],
      maxConsecutiveErrors: 3,
    });

    const thread = new Thread();
    thread.addEvent({ type: "user_input", data: "go" });
    const result = await loop.run(thread);

    expect(result.exitReason).toBe("max_errors");
    const errors = thread.events.filter((e) => e.type === "error");
    expect(errors[0].data.source).toBe("llm");
  });
});
