# reliable-agent-kit

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Tests](https://img.shields.io/badge/Tests-36%20passed-brightgreen)](./tests)

Production-grade building blocks for LLM agents, based on the [12-Factor Agents](https://github.com/humanlayer/12-factor-agents) methodology.

Not a framework — a toolkit. You own every line of your agent's code.

## Two Ways to Use

### Way 1: Claude Code Skill (Recommended)

If you use [Claude Code](https://claude.ai/claude-code), copy `SKILL.md` into `~/.claude/skills/reliable-agent-kit/` and invoke:

```
/reliable-agent-kit Build a customer support agent with order lookup and refund approval
```

Claude generates production-ready code for you — no boilerplate to write by hand.

### Way 2: npm Library

```bash
npm install reliable-agent-kit
```

Import the modules and build your agent programmatically. See [Quick Start](#quick-start) below.

## Why

Most agent frameworks get you to 70-80% fast, then block you from reaching production quality. This kit gives you small, composable modules that slot into your existing Node.js application without lock-in.

Inspired by the insight from 12-Factor Agents: the best production agents are built by taking small, modular concepts and incorporating them into existing products — not by adopting monolithic frameworks.

## Modules

| Module | 12-Factor Principles | What it does |
|--------|---------------------|--------------|
| `agent-loop` | #4 Tools Are Structured Outputs, #8 Own Your Control Flow | Core while-loop with tool dispatch, error recovery, lifecycle hooks |
| `thread-state` | #3 Own Your Context Window, #5 Unify State, #12 Stateless Reducer | Event-sourced Thread, JSON/XML/Markdown serialization, pluggable stores |
| `human-in-loop` | #6 Launch/Pause/Resume, #7 Contact Humans with Tool Calls | Approval/response workflows, Express router, webhook support |

## Quick Start

### 1. Minimal Agent Loop

```typescript
import { createAgentLoop, Thread } from "reliable-agent-kit";

const loop = createAgentLoop({
  resolveNextStep: async (context) => {
    const response = await callYourLLM(context);
    return JSON.parse(response); // { intent: "add", a: 1, b: 2 }
  },
  getIntent: (step) => step.intent,
  tools: {
    add: async (step) => step.a + step.b,
    search: async (step) => await db.search(step.query),
  },
  pauseIntents: ["done_for_now", "request_clarification"],
});

const thread = new Thread({ serializeFormat: { format: "xml" } });
thread.addEvent({ type: "user_input", data: "What is 3 + 4?" });

const result = await loop.run(thread);
// result.exitReason: "paused" | "max_iterations" | "max_errors" | ...
// thread.events: full audit trail of every step
```

### 2. With State Persistence

```typescript
import { Thread, MemoryStore } from "reliable-agent-kit";

const store = new MemoryStore();

// Create and persist
const thread = new Thread();
thread.addEvent({ type: "user_input", data: "Hello" });
const threadId = store.create(thread.snapshot());

// Later: restore and resume
const snapshot = store.get(threadId);
const restored = Thread.fromSnapshot(snapshot);
restored.addEvent({ type: "human_response", data: "Use JSON format" });
await loop.run(restored);
store.update(threadId, restored.snapshot());
```

For filesystem persistence, swap `MemoryStore` with `FileStore`:

```typescript
import { FileStore } from "reliable-agent-kit";
const store = new FileStore("./data/threads");
```

### 3. Human-in-the-Loop

```typescript
import { createHumanHandler } from "reliable-agent-kit";

const humanHandler = createHumanHandler({
  approvalIntents: ["deploy", "delete"],
  responseIntents: ["request_clarification"],

  onContactHuman: async (request) => {
    if (request.type === "approval") {
      await sendSlackMessage(`Approve "${request.intent}"? ${request.message}`);
    } else {
      await sendEmail(request.message);
    }
  },

  formatForHuman: (intent, step) => {
    if (intent === "deploy") return `Deploy to ${step.target}?`;
    return step.message;
  },
});

// After agent pauses:
await humanHandler.handlePause(threadId, thread);

// When human responds:
humanHandler.handleResponse(thread, {
  type: "approval",
  approved: true,
  comment: "Ship it",
});
```

### 4. Full HTTP Server

```typescript
import express from "express";
import {
  createAgentLoop,
  createHumanHandler,
  createAgentRouter,
  MemoryStore,
} from "reliable-agent-kit";

const app = express();
app.use(express.json());

const router = createAgentRouter({
  store: new MemoryStore(),
  loop: myAgentLoop,
  humanHandler: myHumanHandler,
  async: true,
  onComplete: async (threadId, thread) => {
    console.log(`Thread ${threadId} completed`);
  },
});

app.use("/api", router);
app.listen(3000);
```

**Routes created:**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/thread` | Start a new agent thread |
| `GET` | `/api/thread/:id` | Get thread status & events |
| `POST` | `/api/thread/:id/respond` | Human responds (approval/clarification) |
| `POST` | `/api/webhook` | External webhook (email, Slack, etc.) |
| `DELETE` | `/api/thread/:id` | Delete a thread |

## API Reference

### `createAgentLoop(config)`

Creates the core agent loop.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `resolveNextStep` | `(context: string) => Promise<TStep>` | required | Your LLM call |
| `getIntent` | `(step: TStep) => string` | required | Extract intent from step |
| `tools` | `Record<string, ToolHandler>` | required | Intent -> handler map |
| `pauseIntents` | `string[]` | required | Intents that pause the loop |
| `maxIterations` | `number` | `50` | Safety limit |
| `maxConsecutiveErrors` | `number` | `3` | Error threshold before stop |
| `onError` | `(err, count, thread) => action` | — | Custom error handling (`"continue"` / `"pause"` / `"abort"`) |
| `beforeToolExec` | `(intent, step, thread) => boolean` | — | Pre-execution hook, return `false` to skip |
| `afterToolExec` | `(intent, result, thread) => void` | — | Post-execution hook |

Returns `AgentLoop` with a `.run(thread)` method that returns:

```typescript
interface AgentLoopResult {
  thread: Thread;
  iterations: number;
  exitReason: "paused" | "max_iterations" | "max_errors" | "aborted" | "no_handler";
  lastIntent: string;
}
```

### `Thread`

Event-sourced state container.

```typescript
const thread = new Thread({
  events: [],                                      // Initial events
  metadata: { userId: "u1" },                      // Custom metadata
  humanPauseIntents: ["done_for_now"],             // What counts as "awaiting human"
  approvalIntents: ["deploy"],                     // What counts as "awaiting approval"
  serializeFormat: { format: "xml" },              // Default serialization
});

thread.addEvent({ type: "user_input", data: "hi" });
thread.lastEvent();                  // Last event or undefined
thread.lastIntent();                 // Last tool_call intent or null
thread.eventsByType("error");        // Filter events
thread.isAwaitingHuman();            // Is the last event a pause intent?
thread.isAwaitingApproval();         // Is the last event an approval intent?
thread.consecutiveErrorCount();      // Trailing error count
thread.serialize();                  // Serialize with default format
thread.serialize({ format: "xml" }); // Override format
thread.fork();                       // Deep copy for branching
thread.snapshot();                   // Serializable snapshot for storage
thread.status(id);                   // Summary object

Thread.fromSnapshot(snapshot, opts); // Restore from snapshot
```

### Serialization Formats

```typescript
// JSON — verbose but debuggable
thread.serialize({ format: "json", pretty: true });

// XML (recommended) — ~40% fewer tokens, good for LLM context
// <user_input>hi</user_input>
// <add>
//   a: 1
//   b: 2
// </add>
thread.serialize({ format: "xml" });

// Markdown — human-readable
thread.serialize({ format: "markdown" });
```

### Stores

```typescript
// In-memory (dev/test)
import { MemoryStore } from "reliable-agent-kit";
const store = new MemoryStore();

// Filesystem (simple persistence)
import { FileStore } from "reliable-agent-kit";
const store = new FileStore("./data/threads");

// Custom store — implement the interface
interface ThreadStore {
  create(snapshot: ThreadSnapshot): string;
  get(id: string): ThreadSnapshot | undefined;
  update(id: string, snapshot: ThreadSnapshot): void;
  delete(id: string): boolean;
  list(): string[];
}
```

### `createHumanHandler(config)`

Creates handlers for human-in-the-loop workflows.

| Option | Type | Description |
|--------|------|-------------|
| `approvalIntents` | `string[]` | Intents requiring human approval before execution |
| `responseIntents` | `string[]` | Intents expecting human text response |
| `onContactHuman` | `(request: HumanContactRequest) => Promise<void>` | Notification callback (Slack, email, etc.) |
| `formatForHuman` | `(intent: string, step: any) => string` | Format step for humans (optional) |

### `createAgentRouter(config)`

Creates an Express Router with full agent lifecycle endpoints.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `store` | `ThreadStore` | required | Where to persist threads |
| `loop` | `AgentLoop` | required | The agent loop instance |
| `humanHandler` | `HumanHandler` | required | Human interaction handler |
| `threadOptions` | `ThreadConstructorOptions` | — | Options passed when creating new Thread instances |
| `async` | `boolean` | `false` | Non-blocking mode (returns 202 immediately) |
| `onComplete` | `(id, thread) => Promise<void>` | — | Completion callback |

## Architecture

```
User Input
    |
    v
+------------------------------------------+
|  Agent Loop (while loop)                 |
|  +------------------------------------+  |
|  | 1. Serialize thread -> context     |  |
|  | 2. Call LLM -> structured step     |  |
|  | 3. Append tool_call event          |  |
|  | 4. Check: pause intent? -> RETURN  |  |
|  | 5. Execute tool handler            |  |
|  | 6. Append tool_response event      |  |
|  | 7. Loop back to 1                  |  |
|  +------------------------------------+  |
+------------------+-----------------------+
                   | paused
                   v
+-------------------------------+
|  Human Handler                |
|  - Format request for human   |
|  - Send notification          |
|  - Wait for response          |
|  - Apply to thread            |
|  - Resume loop                |
+-------------------------------+
                   |
                   v
+-------------------------------+
|  Thread Store                 |
|  - Persist snapshots          |
|  - Restore on resume          |
|  - Memory / File / Custom     |
+-------------------------------+
```

## Claude Code Skill

This project includes a `SKILL.md` that integrates with [Claude Code](https://claude.ai/claude-code). Install it:

```bash
mkdir -p ~/.claude/skills/reliable-agent-kit
cp SKILL.md ~/.claude/skills/reliable-agent-kit/
```

Then invoke in Claude Code:

```
/reliable-agent-kit Build an agent that searches a database and needs approval for deletions
```

The skill provides 6 templates (A-F) covering basic loops, state persistence, human approval, HTTP servers, full production setups, and context serialization optimization.

## Examples

See the [`examples/`](./examples) directory for runnable code:

| File | What it shows |
|------|---------------|
| `01-basic-loop.ts` | Minimal agent loop with mock LLM |
| `02-calculator.ts` | Multi-step tool execution, XML vs JSON serialization |
| `03-with-state.ts` | Pause/resume with MemoryStore |
| `04-human-approval.ts` | Full approval lifecycle |
| `05-full-server.ts` | Complete Express server with webhooks |

## Project Structure

```
reliable-agent-kit/
├── src/
|   ├── index.ts                     # Public API — all exports
|   ├── agent-loop/
|   |   ├── types.ts                 # AgentLoopConfig, AgentLoopResult, ToolHandler
|   |   └── index.ts                 # createAgentLoop()
|   ├── thread-state/
|   |   ├── types.ts                 # ThreadEvent, ThreadStore, ThreadSnapshot
|   |   ├── thread.ts                # Thread class (event sourcing, fork, serialize)
|   |   ├── serializer.ts            # JSON / XML / Markdown serialization
|   |   └── stores/
|   |       ├── index.ts             # Store exports
|   |       ├── memory-store.ts      # In-memory store (dev/test)
|   |       └── file-store.ts        # Filesystem store (simple persistence)
|   └── human-in-loop/
|       ├── types.ts                 # Approval/Response/Webhook types
|       ├── handler.ts               # createHumanHandler()
|       ├── router.ts                # createAgentRouter() — Express endpoints
|       └── index.ts                 # Module exports
├── examples/                        # 5 progressive examples
├── tests/                           # 36 tests (vitest)
├── SKILL.md                         # Claude Code skill definition
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .gitignore
├── LICENSE
├── CONTRIBUTING.md
├── CHANGELOG.md
└── README.md
```

## 12-Factor Mapping

| Factor | Principle | How this kit implements it |
|--------|-----------|---------------------------|
| #3 | Own Your Context Window | `Thread.serialize()` with JSON/XML/Markdown formats |
| #4 | Tools Are Structured Outputs | `tools` map — LLM outputs JSON, your code executes |
| #5 | Unify State | `Thread.events` — single event log for everything |
| #6 | Launch/Pause/Resume | `pauseIntents` + `ThreadStore` + `createAgentRouter` |
| #7 | Contact Humans with Tool Calls | `createHumanHandler` — humans as structured tools |
| #8 | Own Your Control Flow | You write the `switch`; the loop just dispatches |
| #9 | Compact Errors into Context | Errors become events; LLM reads them and self-heals |
| #12 | Stateless Reducer | `Thread` is the state; `loop.run()` is the reducer |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## License

MIT
