import type { Thread } from "../thread-state/thread.js";

export interface ToolHandler<TStep = any> {
  (step: TStep, thread: Thread): Promise<any> | any;
}

export interface AgentLoopConfig<TStep = any> {
  /**
   * Call your LLM to determine the next step.
   * Receives the serialized thread context, returns the structured step object.
   */
  resolveNextStep: (context: string) => Promise<TStep>;

  /**
   * Extract the intent string from a step object.
   * e.g. (step) => step.intent
   */
  getIntent: (step: TStep) => string;

  /**
   * Map of intent → handler function.
   * Each handler executes the tool and returns the result.
   */
  tools: Record<string, ToolHandler<TStep>>;

  /**
   * Intents that should pause the loop and return control.
   * Typically human-facing intents: ['done_for_now', 'request_clarification']
   */
  pauseIntents: string[];

  /** Maximum loop iterations before forced stop. Default: 50 */
  maxIterations?: number;

  /** Maximum consecutive errors before forced stop. Default: 3 */
  maxConsecutiveErrors?: number;

  /**
   * Custom error handler.
   * Return 'continue' to let the loop retry, 'pause' to return the thread,
   * or 'abort' to throw.
   */
  onError?: (
    error: Error,
    consecutiveErrors: number,
    thread: Thread
  ) => "continue" | "pause" | "abort";

  /**
   * Called before each tool execution. Return false to skip execution.
   * Useful for logging, metrics, or pre-execution checks.
   */
  beforeToolExec?: (intent: string, step: TStep, thread: Thread) => Promise<boolean> | boolean;

  /**
   * Called after each tool execution with the result.
   * Useful for logging, metrics, or post-processing.
   */
  afterToolExec?: (intent: string, result: any, thread: Thread) => Promise<void> | void;
}

export interface AgentLoopResult {
  thread: Thread;
  iterations: number;
  exitReason: "paused" | "max_iterations" | "max_errors" | "aborted" | "no_handler";
  lastIntent: string;
}

export interface AgentLoop<TStep = any> {
  run(thread: Thread): Promise<AgentLoopResult>;
  config: Readonly<AgentLoopConfig<TStep>>;
}
