import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Thread } from "../src/thread-state/thread.js";
import { serializeEvents } from "../src/thread-state/serializer.js";
import { MemoryStore } from "../src/thread-state/stores/memory-store.js";
import { FileStore } from "../src/thread-state/stores/file-store.js";
import { rmSync, existsSync } from "node:fs";
import { join } from "node:path";

describe("Thread", () => {
  it("should add events with timestamps", () => {
    const thread = new Thread();
    thread.addEvent({ type: "user_input", data: "hello" });

    expect(thread.events).toHaveLength(1);
    expect(thread.events[0].type).toBe("user_input");
    expect(thread.events[0].data).toBe("hello");
    expect(thread.events[0].timestamp).toBeTypeOf("number");
  });

  it("should return last event", () => {
    const thread = new Thread();
    thread.addEvent({ type: "a", data: 1 });
    thread.addEvent({ type: "b", data: 2 });

    expect(thread.lastEvent()?.type).toBe("b");
    expect(thread.lastEvent()?.data).toBe(2);
  });

  it("should return undefined for empty thread lastEvent", () => {
    const thread = new Thread();
    expect(thread.lastEvent()).toBeUndefined();
  });

  it("should filter events by type", () => {
    const thread = new Thread();
    thread.addEvent({ type: "tool_call", data: { intent: "add" } });
    thread.addEvent({ type: "tool_response", data: 5 });
    thread.addEvent({ type: "tool_call", data: { intent: "multiply" } });

    const calls = thread.eventsByType("tool_call");
    expect(calls).toHaveLength(2);
  });

  it("should detect awaiting human", () => {
    const thread = new Thread({
      humanPauseIntents: ["done_for_now", "request_clarification"],
    });

    thread.addEvent({ type: "tool_call", data: { intent: "request_clarification" } });
    expect(thread.isAwaitingHuman()).toBe(true);

    thread.addEvent({ type: "human_response", data: "here" });
    expect(thread.isAwaitingHuman()).toBe(false);
  });

  it("should detect awaiting approval", () => {
    const thread = new Thread({
      approvalIntents: ["deploy", "delete"],
    });

    thread.addEvent({ type: "tool_call", data: { intent: "deploy" } });
    expect(thread.isAwaitingApproval()).toBe(true);

    thread.addEvent({ type: "human_approval", data: { approved: true } });
    expect(thread.isAwaitingApproval()).toBe(false);
  });

  it("should count consecutive errors", () => {
    const thread = new Thread();
    thread.addEvent({ type: "tool_response", data: "ok" });
    thread.addEvent({ type: "error", data: "err1" });
    thread.addEvent({ type: "error", data: "err2" });

    expect(thread.consecutiveErrorCount()).toBe(2);
  });

  it("should fork a thread independently", () => {
    const thread = new Thread();
    thread.addEvent({ type: "user_input", data: "hello" });

    const forked = thread.fork();
    forked.addEvent({ type: "tool_call", data: { intent: "add" } });

    expect(thread.events).toHaveLength(1);
    expect(forked.events).toHaveLength(2);
  });

  it("should create and restore snapshots", () => {
    const thread = new Thread({ metadata: { userId: "u1" } });
    thread.addEvent({ type: "user_input", data: "hi" });
    thread.addEvent({ type: "tool_call", data: { intent: "done_for_now" } });

    const snapshot = thread.snapshot();
    const restored = Thread.fromSnapshot(snapshot);

    expect(restored.events).toHaveLength(2);
    expect(restored.metadata.userId).toBe("u1");
  });
});

describe("serializeEvents", () => {
  const events = [
    { type: "user_input", data: "hello", timestamp: 1000 },
    { type: "tool_call", data: { intent: "add", a: 1, b: 2 }, timestamp: 2000 },
    { type: "tool_response", data: 3, timestamp: 3000 },
  ];

  it("should serialize to JSON", () => {
    const result = serializeEvents(events, { format: "json" });
    const parsed = JSON.parse(result);
    expect(parsed).toHaveLength(3);
    expect(parsed[0].type).toBe("user_input");
  });

  it("should serialize to pretty JSON", () => {
    const result = serializeEvents(events, { format: "json", pretty: true });
    expect(result).toContain("\n");
  });

  it("should serialize to XML", () => {
    const result = serializeEvents(events, { format: "xml" });
    expect(result).toContain("<user_input>");
    expect(result).toContain("</user_input>");
    expect(result).toContain("<add>");
    expect(result).toContain("a: 1");
    expect(result).toContain("</add>");
    expect(result).toContain("<tool_response>");
  });

  it("should serialize to markdown", () => {
    const result = serializeEvents(events, { format: "markdown" });
    expect(result).toContain("### user_input");
    expect(result).toContain("### add");
    expect(result).toContain("**a**");
  });
});

describe("MemoryStore", () => {
  it("should create, get, update, delete threads", () => {
    const store = new MemoryStore();
    const snapshot = { events: [], createdAt: Date.now(), updatedAt: Date.now() };

    const id = store.create(snapshot);
    expect(id).toBeTypeOf("string");

    const got = store.get(id);
    expect(got).toBeDefined();
    expect(got!.events).toEqual([]);

    store.update(id, { ...snapshot, events: [{ type: "a", data: 1, timestamp: 0 }] });
    const updated = store.get(id);
    expect(updated!.events).toHaveLength(1);

    const deleted = store.delete(id);
    expect(deleted).toBe(true);
    expect(store.get(id)).toBeUndefined();
  });

  it("should list thread ids", () => {
    const store = new MemoryStore();
    const snap = { events: [], createdAt: Date.now(), updatedAt: Date.now() };
    const id1 = store.create(snap);
    const id2 = store.create(snap);

    const ids = store.list();
    expect(ids).toContain(id1);
    expect(ids).toContain(id2);
    expect(store.size()).toBe(2);
  });

  it("should throw on update of non-existent thread", () => {
    const store = new MemoryStore();
    const snap = { events: [], createdAt: Date.now(), updatedAt: Date.now() };
    expect(() => store.update("nope", snap)).toThrow("Thread not found");
  });
});

describe("FileStore", () => {
  const testDir = join(process.cwd(), ".test-threads");

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  it("should create and read threads from filesystem", () => {
    const store = new FileStore(testDir);
    const snap = {
      events: [{ type: "user_input", data: "hello", timestamp: Date.now() }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const id = store.create(snap);
    const got = store.get(id);

    expect(got).toBeDefined();
    expect(got!.events).toHaveLength(1);
    expect(got!.events[0].data).toBe("hello");
  });

  it("should list and delete threads", () => {
    const store = new FileStore(testDir);
    const snap = { events: [], createdAt: Date.now(), updatedAt: Date.now() };

    const id1 = store.create(snap);
    const id2 = store.create(snap);

    expect(store.list()).toHaveLength(2);

    store.delete(id1);
    expect(store.list()).toHaveLength(1);
    expect(store.get(id1)).toBeUndefined();
  });
});
