import type { Thread } from "../thread-state/thread.js";
import type { AgentLoop, AgentLoopConfig, AgentLoopResult } from "./types.js";

export type { AgentLoop, AgentLoopConfig, AgentLoopResult, ToolHandler } from "./types.js";

export function createAgentLoop<TStep = any>(
  config: AgentLoopConfig<TStep>
): AgentLoop<TStep> {
  const {
    resolveNextStep,
    getIntent,
    tools,
    pauseIntents,
    maxIterations = 50,
    maxConsecutiveErrors = 3,
    onError,
    beforeToolExec,
    afterToolExec,
  } = config;

  return {
    config,

    async run(thread: Thread): Promise<AgentLoopResult> {
      let iterations = 0;
      let consecutiveErrors = 0;
      let lastIntent = "";

      while (iterations < maxIterations) {
        iterations++;

        let nextStep: TStep;
        try {
          nextStep = await resolveNextStep(thread.serialize());
        } catch (error) {
          consecutiveErrors++;
          thread.addEvent({
            type: "error",
            data: { source: "llm", message: (error as Error).message },
          });

          if (consecutiveErrors >= maxConsecutiveErrors) {
            return { thread, iterations, exitReason: "max_errors", lastIntent };
          }
          continue;
        }

        lastIntent = getIntent(nextStep);
        thread.addEvent({ type: "tool_call", data: nextStep });

        // Pause on human-facing intents
        if (pauseIntents.includes(lastIntent)) {
          return { thread, iterations, exitReason: "paused", lastIntent };
        }

        // Find handler
        const handler = tools[lastIntent];
        if (!handler) {
          thread.addEvent({
            type: "error",
            data: { source: "dispatch", message: `Unknown tool: ${lastIntent}` },
          });
          return { thread, iterations, exitReason: "no_handler", lastIntent };
        }

        // Pre-execution hook
        if (beforeToolExec) {
          const proceed = await beforeToolExec(lastIntent, nextStep, thread);
          if (!proceed) {
            thread.addEvent({
              type: "tool_response",
              data: { skipped: true, intent: lastIntent },
            });
            continue;
          }
        }

        // Execute tool
        try {
          const result = await handler(nextStep, thread);
          thread.addEvent({ type: "tool_response", data: result });
          consecutiveErrors = 0;

          if (afterToolExec) {
            await afterToolExec(lastIntent, result, thread);
          }
        } catch (error) {
          consecutiveErrors++;
          thread.addEvent({
            type: "error",
            data: { source: lastIntent, message: (error as Error).message },
          });

          if (onError) {
            const action = onError(error as Error, consecutiveErrors, thread);
            if (action === "abort") {
              return { thread, iterations, exitReason: "aborted", lastIntent };
            }
            if (action === "pause") {
              return { thread, iterations, exitReason: "paused", lastIntent };
            }
          }

          if (consecutiveErrors >= maxConsecutiveErrors) {
            return { thread, iterations, exitReason: "max_errors", lastIntent };
          }
        }
      }

      thread.addEvent({
        type: "error",
        data: { source: "loop", message: `Max iterations reached (${maxIterations})` },
      });
      return { thread, iterations, exitReason: "max_iterations", lastIntent };
    },
  };
}
