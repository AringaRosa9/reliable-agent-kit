import type { Thread } from "../thread-state/thread.js";
import type {
  HumanHandler,
  HumanHandlerConfig,
  HumanContactRequest,
  HumanPayload,
} from "./types.js";

export function createHumanHandler(config: HumanHandlerConfig): HumanHandler {
  const {
    approvalIntents,
    responseIntents,
    onContactHuman,
    formatForHuman,
  } = config;

  const approvalSet = new Set(approvalIntents);
  const responseSet = new Set(responseIntents);

  return {
    needsApproval(intent: string): boolean {
      return approvalSet.has(intent);
    },

    needsResponse(intent: string): boolean {
      return responseSet.has(intent);
    },

    async handlePause(
      threadId: string,
      thread: Thread
    ): Promise<HumanContactRequest | null> {
      const lastEvent = thread.lastEvent();
      if (!lastEvent || lastEvent.type !== "tool_call") return null;

      const intent = lastEvent.data?.intent;
      if (!intent) return null;

      const message = formatForHuman
        ? formatForHuman(intent, lastEvent.data)
        : lastEvent.data?.message ?? JSON.stringify(lastEvent.data);

      if (approvalSet.has(intent)) {
        const request: HumanContactRequest = {
          type: "approval",
          threadId,
          intent,
          step: lastEvent.data,
          message,
        };
        await onContactHuman(request);
        return request;
      }

      if (responseSet.has(intent)) {
        const request: HumanContactRequest = {
          type: "response",
          threadId,
          intent,
          step: lastEvent.data,
          message,
        };
        await onContactHuman(request);
        return request;
      }

      return null;
    },

    handleResponse(thread: Thread, payload: HumanPayload): Thread {
      if (payload.type === "approval") {
        if (payload.approved) {
          thread.addEvent({
            type: "human_approval",
            data: { approved: true, comment: payload.comment },
          });
        } else {
          thread.addEvent({
            type: "tool_response",
            data: {
              rejected: true,
              feedback: payload.comment ?? "User denied the operation",
            },
          });
        }
      } else if (payload.type === "response") {
        thread.addEvent({
          type: "human_response",
          data: payload.response,
        });
      }

      return thread;
    },
  };
}
