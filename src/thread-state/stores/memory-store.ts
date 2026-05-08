import { randomUUID } from "node:crypto";
import type { ThreadStore, ThreadSnapshot } from "../types.js";

export class MemoryStore implements ThreadStore {
  private threads = new Map<string, ThreadSnapshot>();

  create(snapshot: ThreadSnapshot): string {
    const id = randomUUID();
    this.threads.set(id, {
      ...snapshot,
      id,
    });
    return id;
  }

  get(id: string): ThreadSnapshot | undefined {
    const snapshot = this.threads.get(id);
    if (!snapshot) return undefined;
    return { ...snapshot, events: [...snapshot.events] };
  }

  update(id: string, snapshot: ThreadSnapshot): void {
    if (!this.threads.has(id)) {
      throw new Error(`Thread not found: ${id}`);
    }
    this.threads.set(id, { ...snapshot, id, updatedAt: Date.now() });
  }

  delete(id: string): boolean {
    return this.threads.delete(id);
  }

  list(): string[] {
    return Array.from(this.threads.keys());
  }

  clear(): void {
    this.threads.clear();
  }

  size(): number {
    return this.threads.size;
  }
}
