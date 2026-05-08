import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ThreadStore, ThreadSnapshot } from "../types.js";

export class FileStore implements ThreadStore {
  private dir: string;

  constructor(dir: string) {
    this.dir = dir;
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private filePath(id: string): string {
    return join(this.dir, `${id}.json`);
  }

  create(snapshot: ThreadSnapshot): string {
    const id = randomUUID();
    const data: ThreadSnapshot = { ...snapshot, id };
    writeFileSync(this.filePath(id), JSON.stringify(data, null, 2), "utf-8");
    return id;
  }

  get(id: string): ThreadSnapshot | undefined {
    const path = this.filePath(id);
    if (!existsSync(path)) return undefined;
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as ThreadSnapshot;
  }

  update(id: string, snapshot: ThreadSnapshot): void {
    const path = this.filePath(id);
    if (!existsSync(path)) {
      throw new Error(`Thread not found: ${id}`);
    }
    const data: ThreadSnapshot = { ...snapshot, id, updatedAt: Date.now() };
    writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
  }

  delete(id: string): boolean {
    const path = this.filePath(id);
    if (!existsSync(path)) return false;
    unlinkSync(path);
    return true;
  }

  list(): string[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""));
  }
}
