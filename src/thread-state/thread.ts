import { serializeEvents } from "./serializer.js";
import type {
  ThreadEvent,
  SerializerOptions,
  ThreadSnapshot,
  ThreadStatus,
} from "./types.js";

export class Thread {
  events: ThreadEvent[] = [];
  metadata: Record<string, any> = {};

  private _createdAt: number;
  private _updatedAt: number;
  private _humanPauseIntents: Set<string>;
  private _approvalIntents: Set<string>;
  private _serializeOptions: SerializerOptions;

  constructor(options?: {
    events?: ThreadEvent[];
    metadata?: Record<string, any>;
    humanPauseIntents?: string[];
    approvalIntents?: string[];
    serializeFormat?: SerializerOptions;
  }) {
    const now = Date.now();
    this._createdAt = now;
    this._updatedAt = now;

    if (options?.events) {
      this.events = [...options.events];
    }
    if (options?.metadata) {
      this.metadata = { ...options.metadata };
    }

    this._humanPauseIntents = new Set(
      options?.humanPauseIntents ?? ["done_for_now", "request_clarification"]
    );
    this._approvalIntents = new Set(options?.approvalIntents ?? []);
    this._serializeOptions = options?.serializeFormat ?? { format: "xml" };
  }

  addEvent(event: Omit<ThreadEvent, "timestamp"> & { timestamp?: number }): void {
    this.events.push({
      ...event,
      timestamp: event.timestamp ?? Date.now(),
    });
    this._updatedAt = Date.now();
  }

  lastEvent(): ThreadEvent | undefined {
    return this.events[this.events.length - 1];
  }

  eventsByType(type: string): ThreadEvent[] {
    return this.events.filter((e) => e.type === type);
  }

  serialize(options?: SerializerOptions): string {
    return serializeEvents(this.events, options ?? this._serializeOptions);
  }

  lastIntent(): string | null {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const event = this.events[i];
      if (event.type === "tool_call" && event.data?.intent) {
        return event.data.intent;
      }
    }
    return null;
  }

  isAwaitingHuman(): boolean {
    const last = this.lastEvent();
    if (!last || last.type !== "tool_call") return false;
    const intent = last.data?.intent;
    return intent !== null && this._humanPauseIntents.has(intent);
  }

  isAwaitingApproval(): boolean {
    const last = this.lastEvent();
    if (!last || last.type !== "tool_call") return false;
    const intent = last.data?.intent;
    return intent !== null && this._approvalIntents.has(intent);
  }

  hasError(): boolean {
    const last = this.lastEvent();
    return last?.type === "error";
  }

  consecutiveErrorCount(): number {
    let count = 0;
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].type === "error") {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  snapshot(): ThreadSnapshot {
    return {
      events: [...this.events],
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
      metadata: { ...this.metadata },
    };
  }

  status(id: string): ThreadStatus {
    const last = this.lastEvent();
    return {
      id,
      eventCount: this.events.length,
      lastEventType: last?.type ?? null,
      isAwaitingHuman: this.isAwaitingHuman(),
      isAwaitingApproval: this.isAwaitingApproval(),
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
    };
  }

  fork(): Thread {
    return new Thread({
      events: this.events.map((e) => ({ ...e })),
      metadata: { ...this.metadata, forkedFrom: this._createdAt },
      humanPauseIntents: [...this._humanPauseIntents],
      approvalIntents: [...this._approvalIntents],
      serializeFormat: { ...this._serializeOptions },
    });
  }

  static fromSnapshot(
    snapshot: ThreadSnapshot,
    options?: {
      humanPauseIntents?: string[];
      approvalIntents?: string[];
      serializeFormat?: SerializerOptions;
    }
  ): Thread {
    const thread = new Thread({
      events: snapshot.events,
      metadata: snapshot.metadata,
      ...options,
    });
    return thread;
  }
}
