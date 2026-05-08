---
name: reliable-agent-kit
description: |
  基于 12-Factor Agents 方法论的生产级 Agent 快速搭建工具。当用户需要构建 LLM Agent、
  搭建带工具调用的 Agent 循环、实现人工审批流程、或将 Agent 暴露为 HTTP 服务时，
  使用此 Skill 生成基于 reliable-agent-kit 的 TypeScript/Node.js 代码。
  触发场景：用户提到"搭建 Agent"、"Agent 循环"、"工具调用"、"人工审批"、
  "Agent API"、"Agent 状态管理"、"暂停恢复"、"webhook"、"12-factor"等。
---

# reliable-agent-kit — 生产级 Agent 快速搭建

基于 [12-Factor Agents](https://github.com/humanlayer/12-factor-agents) 方法论，通过 `reliable-agent-kit` npm 包快速生成可靠的 Agent 代码。

## 前置条件

项目必须先安装依赖：

```bash
npm install reliable-agent-kit
```

如需 HTTP 服务，还需要 Express（已作为依赖包含）。

## 使用方式

用户描述需求，根据场景匹配下方模板生成代码。

| 场景 | 关键词 | 生成模板 |
|------|--------|----------|
| 基础 Agent 循环 | `agent循环`, `工具调用`, `基础agent` | Template A |
| 带状态的 Agent | `状态管理`, `持久化`, `暂停恢复`, `记忆` | Template B |
| 人工审批 Agent | `人工审批`, `approval`, `人机协作`, `审批流` | Template C |
| HTTP Agent 服务 | `API`, `HTTP服务`, `webhook`, `服务端` | Template D |
| 完整生产级 Agent | `生产级`, `完整`, `全功能` | Template E |
| 自定义上下文序列化 | `上下文`, `token优化`, `XML序列化` | Template F |

---

## Template A: 基础 Agent 循环

最小可运行的 Agent。用户提供业务工具，此模板生成循环骨架。

根据用户的具体业务场景，替换 `tools` 中的工具定义和 `resolveNextStep` 中的 LLM 调用。

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { createAgentLoop, Thread } from "reliable-agent-kit";

const client = new Anthropic();

// 定义 Step 类型 — 根据业务场景自定义
interface Step {
  intent: string;
  // ...业务字段
}

const loop = createAgentLoop<Step>({
  resolveNextStep: async (context) => {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: `你是一个助手。根据对话上下文决定下一步操作。
以 JSON 格式回复，必须包含 intent 字段。
可用的 intent: done_for_now, request_clarification, ...你的工具名...`,
      messages: [{ role: "user", content: context }],
    });
    return JSON.parse(response.content[0].type === "text" ? response.content[0].text : "{}");
  },

  getIntent: (step) => step.intent,

  tools: {
    // 替换为你的业务工具
    example_tool: async (step, thread) => {
      return { result: "done" };
    },
  },

  pauseIntents: ["done_for_now", "request_clarification"],
  maxIterations: 30,
  maxConsecutiveErrors: 3,
});

async function main() {
  const thread = new Thread({ serializeFormat: { format: "xml" } });
  thread.addEvent({ type: "user_input", data: "用户的输入" });

  const result = await loop.run(thread);
  console.log("退出原因:", result.exitReason);
  console.log("最终意图:", result.lastIntent);
}

main();
```

**生成指引：**
- 根据用户业务替换 `Step` 接口的字段
- 根据用户需要的工具填充 `tools` 对象
- system prompt 中列出所有可用 intent
- 默认使用 XML 序列化（省 token），用户要求 JSON 时改为 `{ format: "json" }`

---

## Template B: 带状态的 Agent（暂停/恢复）

Agent 可以暂停等待外部输入，之后恢复继续执行。

```typescript
import { createAgentLoop, Thread, MemoryStore } from "reliable-agent-kit";
// 生产环境用 FileStore 或自定义 Store：
// import { FileStore } from "reliable-agent-kit";
// const store = new FileStore("./data/threads");

const store = new MemoryStore();

// ...loop 定义同 Template A...

// 第一轮：用户发起请求
async function startThread(userMessage: string) {
  const thread = new Thread({ serializeFormat: { format: "xml" } });
  thread.addEvent({ type: "user_input", data: userMessage });

  const threadId = store.create(thread.snapshot());
  const result = await loop.run(thread);
  store.update(threadId, thread.snapshot());

  return { threadId, exitReason: result.exitReason, thread };
}

// 后续轮：人类回复后恢复
async function resumeThread(threadId: string, humanMessage: string) {
  const snapshot = store.get(threadId);
  if (!snapshot) throw new Error("Thread not found");

  const thread = Thread.fromSnapshot(snapshot);
  thread.addEvent({ type: "human_response", data: humanMessage });

  const result = await loop.run(thread);
  store.update(threadId, thread.snapshot());

  return { exitReason: result.exitReason, thread };
}
```

**生成指引：**
- 开发/测试用 `MemoryStore`，生产用 `FileStore` 或自定义
- 自定义 Store 只需实现 `ThreadStore` 接口（create/get/update/delete/list）
- `Thread.fromSnapshot()` 恢复时可传入与创建时相同的 options

---

## Template C: 人工审批 Agent

某些危险操作需要人类先审批再执行。

```typescript
import {
  createAgentLoop,
  createHumanHandler,
  Thread,
  MemoryStore,
} from "reliable-agent-kit";

const store = new MemoryStore();

const loop = createAgentLoop<Step>({
  resolveNextStep: async (context) => { /* LLM 调用 */ },
  getIntent: (step) => step.intent,
  tools: {
    safe_tool: async (step) => { /* 安全操作，自动执行 */ },
    dangerous_tool: async (step) => { /* 危险操作，需审批后才执行 */ },
  },
  // 危险工具也加入 pauseIntents — 选中后暂停，等审批
  pauseIntents: ["done_for_now", "request_clarification", "dangerous_tool"],
});

const humanHandler = createHumanHandler({
  approvalIntents: ["dangerous_tool"],   // 需要审批的 intent
  responseIntents: ["request_clarification", "done_for_now"],

  onContactHuman: async (request) => {
    // 替换为你的通知方式：Slack、邮件、钉钉、短信...
    if (request.type === "approval") {
      console.log(`需要审批: ${request.message}`);
      // await sendSlack(`请审批: ${request.message}`);
    } else {
      console.log(`需要回复: ${request.message}`);
    }
  },

  formatForHuman: (intent, step) => {
    // 将工具调用格式化为人类可读的描述
    return `操作: ${intent}, 参数: ${JSON.stringify(step)}`;
  },
});

// Agent 暂停后，通知人类
async function runWithApproval(userMessage: string) {
  const thread = new Thread({ approvalIntents: ["dangerous_tool"] });
  thread.addEvent({ type: "user_input", data: userMessage });

  const threadId = store.create(thread.snapshot());
  const result = await loop.run(thread);
  store.update(threadId, thread.snapshot());

  if (result.exitReason === "paused") {
    await humanHandler.handlePause(threadId, thread);
  }

  return { threadId, result };
}

// 人类审批后恢复
async function handleApproval(threadId: string, approved: boolean, comment?: string) {
  const snapshot = store.get(threadId);
  if (!snapshot) throw new Error("Thread not found");

  const thread = Thread.fromSnapshot(snapshot, { approvalIntents: ["dangerous_tool"] });

  humanHandler.handleResponse(thread, {
    type: "approval",
    approved,
    comment,
  });

  // 审批通过 → 执行被暂停的工具
  if (approved) {
    const lastToolCall = thread.events.filter(e => e.type === "tool_call").pop();
    if (lastToolCall) {
      const handler = loop.config.tools[lastToolCall.data.intent];
      if (handler) {
        const toolResult = await handler(lastToolCall.data, thread);
        thread.addEvent({ type: "tool_response", data: toolResult });
      }
    }
  }

  // 恢复循环
  const result = await loop.run(thread);
  store.update(threadId, thread.snapshot());
  return { result, thread };
}
```

**生成指引：**
- 根据用户的业务确定哪些 intent 需要审批
- `onContactHuman` 是接入外部系统的关键 — 必须根据用户的实际通知渠道替换
- 拒绝审批时，rejection 信息会以 `tool_response` 事件写入上下文，LLM 下一轮能读到反馈并调整策略

---

## Template D: HTTP Agent 服务

将 Agent 暴露为 REST API，支持异步处理和 webhook。

```typescript
import express from "express";
import {
  createAgentLoop,
  createHumanHandler,
  createAgentRouter,
  MemoryStore,
} from "reliable-agent-kit";

// ...loop 和 humanHandler 定义同上...

const router = createAgentRouter({
  store: new MemoryStore(),
  loop,
  humanHandler,
  async: true, // true = 非阻塞，POST 立即返回 202
  onComplete: async (threadId, thread) => {
    console.log(`Thread ${threadId} 完成: ${thread.lastIntent()}`);
  },
});

const app = express();
app.use(express.json());
app.use("/api", router);

app.listen(3000, () => {
  console.log("Agent 服务运行在 http://localhost:3000");
});
```

**自动创建的路由：**

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/thread` | 创建新 Agent 会话。Body: `{ "message": "..." }` |
| GET | `/api/thread/:id` | 获取会话状态和事件列表 |
| POST | `/api/thread/:id/respond` | 人类回复。Body: `{ "type": "approval", "approved": true }` 或 `{ "type": "response", "response": "..." }` |
| POST | `/api/webhook` | 外部 webhook。Body: `{ "threadId": "...", "payload": {...} }` |
| DELETE | `/api/thread/:id` | 删除会话 |

**生成指引：**
- `async: true` 适合长时间运行的 Agent，`async: false` 适合快速响应的场景
- 生产环境替换 `MemoryStore` 为持久化方案
- 可在 router 前后添加认证中间件

---

## Template E: 完整生产级 Agent

组合以上所有能力的完整模板。当用户需要「从零搭建一个完整的 Agent」时使用。

生成时组合 Template A + B + C + D，并额外添加：
- 错误恢复配置（`onError`, `maxConsecutiveErrors`）
- 生命周期钩子（`beforeToolExec`, `afterToolExec`）
- FileStore 持久化
- 完整的 Step 类型定义

```typescript
const loop = createAgentLoop<Step>({
  resolveNextStep: async (context) => { /* ... */ },
  getIntent: (step) => step.intent,
  tools: { /* ... */ },
  pauseIntents: ["done_for_now", "request_clarification", /* 审批工具 */],
  maxIterations: 50,
  maxConsecutiveErrors: 3,

  onError: (error, consecutiveErrors, thread) => {
    console.error(`错误 [${consecutiveErrors}/3]:`, error.message);
    if (consecutiveErrors >= 3) return "pause"; // 交给人类处理
    return "continue"; // LLM 从上下文中读取错误并自我修复
  },

  beforeToolExec: async (intent, step, thread) => {
    console.log(`执行工具: ${intent}`, step);
    return true; // 返回 false 可跳过执行
  },

  afterToolExec: async (intent, result, thread) => {
    console.log(`工具完成: ${intent}`, result);
  },
});
```

---

## Template F: 自定义上下文序列化

优化 LLM 上下文 token 用量。XML 比 JSON 省约 40% token。

```typescript
const thread = new Thread({
  serializeFormat: { format: "xml" },
});

// XML 输出示例:
// <user_input>帮我查一下订单</user_input>
// <search>
//   query: 订单 12345
// </search>
// <tool_response>找到订单: ...</tool_response>

// 也可以按需切换格式:
thread.serialize({ format: "json", pretty: true });  // 调试用
thread.serialize({ format: "xml" });                 // 生产用，省 token
thread.serialize({ format: "markdown" });             // 人类阅读用
```

---

## 代码生成指引

当用户请求搭建 Agent 时，按以下步骤：

1. **确认场景** — 用户要什么类型的 Agent？匹配上方 Template A-F
2. **确认工具** — Agent 需要哪些工具？每个工具对应一个 intent + handler
3. **确认审批** — 哪些操作需要人工审批？加入 `approvalIntents`
4. **确认部署** — CLI 运行还是 HTTP 服务？选 Template A/B/C 或 Template D
5. **生成代码** — 基于模板填入用户的业务逻辑
6. **提示安装** — 确保用户已 `npm install reliable-agent-kit`

## 关键设计原则（来自 12-Factor Agents）

生成代码时遵循这些原则：

- **LLM 只决策，代码来执行** — LLM 输出结构化 JSON（intent + 参数），确定性代码执行工具
- **一切皆事件** — 所有操作（用户输入、工具调用、结果、错误、人类回复）都是 Thread 中的事件
- **暂停在选择和执行之间** — 危险操作：LLM 选择了工具 → 暂停 → 人类审批 → 才执行
- **错误即上下文** — 错误写入事件流，LLM 下一轮读到错误后自动调整策略
- **小而专注** — 一个 Agent 做一件事（3-20 步），不要做万能 Agent
- **XML 省 token** — 默认用 XML 序列化上下文，比 JSON 省约 40%
