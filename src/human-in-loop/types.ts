import type { Thread } from "../thread-state/thread.js";

export interface ApprovalRequest {
  type: "approval";
  threadId: string;
  intent: string;
  step: any;
  message?: string;
}

export interface ResponseRequest {
  type: "response";
  threadId: string;
  intent: string;
  step: any;
  message: string;
}

export type HumanContactRequest = ApprovalRequest | ResponseRequest;

export interface ApprovalPayload {
  type: "approval";
  approved: boolean;
  comment?: string;
}

export interface ResponsePayload {
  type: "response";
  response: string;
}

export type HumanPayload = ApprovalPayload | ResponsePayload;

export interface HumanHandlerConfig {
  /** Intents that require human approval before execution */
  approvalIntents: string[];

  /** Intents that request a human response (clarification, done) */
  responseIntents: string[];

  /**
   * Called when the agent needs to contact a human.
   * Implement this to send notifications (email, Slack, webhook, etc).
   */
  onContactHuman: (request: HumanContactRequest) => Promise<void>;

  /**
   * Optional: transform the step data before sending to human.
   * Useful for formatting tool call details into human-readable messages.
   */
  formatForHuman?: (intent: string, step: any) => string;
}

export interface HumanHandler {
  /**
   * Determine if and how the agent should contact a human.
   * Call this after the agent loop pauses.
   */
  handlePause(threadId: string, thread: Thread): Promise<HumanContactRequest | null>;

  /**
   * Process a human's response and apply it to the thread.
   * Returns the updated thread ready to resume the agent loop.
   */
  handleResponse(thread: Thread, payload: HumanPayload): Thread;

  /** Check if an intent requires approval */
  needsApproval(intent: string): boolean;

  /** Check if an intent expects a human response */
  needsResponse(intent: string): boolean;
}

export interface WebhookEvent {
  threadId: string;
  payload: HumanPayload;
  timestamp: number;
  source?: string;
}
