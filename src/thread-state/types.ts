export interface ThreadEvent {
  type: string;
  data: any;
  timestamp?: number;
}

export type SerializeFormat = "json" | "xml" | "markdown";

export interface SerializerOptions {
  format: SerializeFormat;
  pretty?: boolean;
  includeTimestamps?: boolean;
}

export interface ThreadStore {
  create(thread: ThreadSnapshot): string;
  get(id: string): ThreadSnapshot | undefined;
  update(id: string, snapshot: ThreadSnapshot): void;
  delete(id: string): boolean;
  list(): string[];
}

export interface ThreadSnapshot {
  id?: string;
  events: ThreadEvent[];
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, any>;
}

export interface ThreadStatus {
  id: string;
  eventCount: number;
  lastEventType: string | null;
  isAwaitingHuman: boolean;
  isAwaitingApproval: boolean;
  createdAt: number;
  updatedAt: number;
}
