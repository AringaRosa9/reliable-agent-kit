# reliable-agent-kit

**[中文](#中文) | [日本語](#日本語) | [English](#english)**

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Tests](https://img.shields.io/badge/Tests-36%20passed-brightgreen)](./tests)

---

<a id="中文"></a>

## 中文

**[中文](#中文) | [日本語](#日本語) | [English](#english)**

生产级 LLM Agent 构建套件，基于 [12-Factor Agents](https://github.com/humanlayer/12-factor-agents) 方法论。

不是框架，是工具箱。Agent 的每一行代码都由你掌控。

### 两种使用方式

#### 方式一：Claude Code Skill（推荐）

如果你使用 [Claude Code](https://claude.ai/claude-code)，将 `SKILL.md` 复制到 `~/.claude/skills/reliable-agent-kit/`，然后调用：

```
/reliable-agent-kit 构建一个带订单查询和退款审批的客服 Agent
```

Claude 会为你生成生产级代码，无需手写样板。

#### 方式二：npm 库

```bash
npm install reliable-agent-kit
```

导入模块，以编程方式构建你的 Agent。参见下方[快速开始](#快速开始)。

### 为什么选择这个

大多数 Agent 框架能让你快速达到 70-80%，然后在通往生产质量的路上卡住你。这个套件提供小型、可组合的模块，无锁定地嵌入你现有的 Node.js 应用。

灵感来自 12-Factor Agents 的洞察：最好的生产级 Agent 是将小型模块化概念融入现有产品，而非采用整体式框架。

### 模块

| 模块 | 12-Factor 原则 | 功能 |
|------|---------------|------|
| `agent-loop` | #4 工具即结构化输出, #8 掌控你的控制流 | 核心 while 循环，带工具分发、错误恢复、生命周期钩子 |
| `thread-state` | #3 掌控你的上下文窗口, #5 统一状态, #12 无状态 Reducer | 事件溯源 Thread，JSON/XML/Markdown 序列化，可插拔存储 |
| `human-in-loop` | #6 启动/暂停/恢复, #7 用工具调用联系人类 | 审批/回复工作流，Express 路由，Webhook 支持 |

### 快速开始

#### 1. 最小 Agent 循环

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
thread.addEvent({ type: "user_input", data: "3 + 4 等于多少？" });

const result = await loop.run(thread);
// result.exitReason: "paused" | "max_iterations" | "max_errors" | ...
// thread.events: 每一步的完整审计轨迹
```

#### 2. 带状态持久化

```typescript
import { Thread, MemoryStore } from "reliable-agent-kit";

const store = new MemoryStore();

// 创建并持久化
const thread = new Thread();
thread.addEvent({ type: "user_input", data: "你好" });
const threadId = store.create(thread.snapshot());

// 之后：恢复并继续
const snapshot = store.get(threadId);
const restored = Thread.fromSnapshot(snapshot);
restored.addEvent({ type: "human_response", data: "使用 JSON 格式" });
await loop.run(restored);
store.update(threadId, restored.snapshot());
```

文件系统持久化，将 `MemoryStore` 换成 `FileStore`：

```typescript
import { FileStore } from "reliable-agent-kit";
const store = new FileStore("./data/threads");
```

#### 3. 人工介入

```typescript
import { createHumanHandler } from "reliable-agent-kit";

const humanHandler = createHumanHandler({
  approvalIntents: ["deploy", "delete"],
  responseIntents: ["request_clarification"],

  onContactHuman: async (request) => {
    if (request.type === "approval") {
      await sendSlackMessage(`审批 "${request.intent}"？${request.message}`);
    } else {
      await sendEmail(request.message);
    }
  },

  formatForHuman: (intent, step) => {
    if (intent === "deploy") return `部署到 ${step.target}？`;
    return step.message;
  },
});

// Agent 暂停后：
await humanHandler.handlePause(threadId, thread);

// 人工回复时：
humanHandler.handleResponse(thread, {
  type: "approval",
  approved: true,
  comment: "发布吧",
});
```

#### 4. 完整 HTTP 服务

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
    console.log(`线程 ${threadId} 已完成`);
  },
});

app.use("/api", router);
app.listen(3000);
```

**创建的路由：**

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/thread` | 启动新的 Agent 线程 |
| `GET` | `/api/thread/:id` | 获取线程状态与事件 |
| `POST` | `/api/thread/:id/respond` | 人工回复（审批/澄清） |
| `POST` | `/api/webhook` | 外部 Webhook（邮件、Slack 等） |
| `DELETE` | `/api/thread/:id` | 删除线程 |

### API 参考

#### `createAgentLoop(config)`

创建核心 Agent 循环。

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `resolveNextStep` | `(context: string) => Promise<TStep>` | 必需 | 你的 LLM 调用 |
| `getIntent` | `(step: TStep) => string` | 必需 | 从 step 中提取 intent |
| `tools` | `Record<string, ToolHandler>` | 必需 | Intent -> 处理器映射 |
| `pauseIntents` | `string[]` | 必需 | 触发暂停的 intent |
| `maxIterations` | `number` | `50` | 安全上限 |
| `maxConsecutiveErrors` | `number` | `3` | 连续错误阈值 |
| `onError` | `(err, count, thread) => action` | — | 自定义错误处理（`"continue"` / `"pause"` / `"abort"`） |
| `beforeToolExec` | `(intent, step, thread) => boolean` | — | 执行前钩子，返回 `false` 跳过 |
| `afterToolExec` | `(intent, result, thread) => void` | — | 执行后钩子 |

返回 `AgentLoop`，包含 `.run(thread)` 方法：

```typescript
interface AgentLoopResult {
  thread: Thread;
  iterations: number;
  exitReason: "paused" | "max_iterations" | "max_errors" | "aborted" | "no_handler";
  lastIntent: string;
}
```

#### `Thread`

事件溯源状态容器。

```typescript
const thread = new Thread({
  events: [],                                      // 初始事件
  metadata: { userId: "u1" },                      // 自定义元数据
  humanPauseIntents: ["done_for_now"],             // 判定为"等待人工"的 intent
  approvalIntents: ["deploy"],                     // 判定为"等待审批"的 intent
  serializeFormat: { format: "xml" },              // 默认序列化格式
});

thread.addEvent({ type: "user_input", data: "你好" });
thread.lastEvent();                  // 最后一个事件或 undefined
thread.lastIntent();                 // 最后一个 tool_call intent 或 null
thread.eventsByType("error");        // 按类型过滤事件
thread.isAwaitingHuman();            // 最后事件是否为暂停 intent？
thread.isAwaitingApproval();         // 最后事件是否为审批 intent？
thread.consecutiveErrorCount();      // 尾部连续错误计数
thread.serialize();                  // 使用默认格式序列化
thread.serialize({ format: "xml" }); // 覆盖格式
thread.fork();                       // 深拷贝用于分支
thread.snapshot();                   // 可序列化快照，用于存储
thread.status(id);                   // 摘要对象

Thread.fromSnapshot(snapshot, opts); // 从快照恢复
```

#### 序列化格式

```typescript
// JSON — 冗长但便于调试
thread.serialize({ format: "json", pretty: true });

// XML（推荐）— 比 JSON 少约 40% token，适合 LLM 上下文
// <user_input>你好</user_input>
// <add>
//   a: 1
//   b: 2
// </add>
thread.serialize({ format: "xml" });

// Markdown — 人类可读
thread.serialize({ format: "markdown" });
```

#### 存储

```typescript
// 内存存储（开发/测试）
import { MemoryStore } from "reliable-agent-kit";
const store = new MemoryStore();

// 文件系统存储（简单持久化）
import { FileStore } from "reliable-agent-kit";
const store = new FileStore("./data/threads");

// 自定义存储 — 实现接口即可
interface ThreadStore {
  create(snapshot: ThreadSnapshot): string;
  get(id: string): ThreadSnapshot | undefined;
  update(id: string, snapshot: ThreadSnapshot): void;
  delete(id: string): boolean;
  list(): string[];
}
```

#### `createHumanHandler(config)`

创建人工介入工作流处理器。

| 选项 | 类型 | 说明 |
|------|------|------|
| `approvalIntents` | `string[]` | 需要人工审批后才执行的 intent |
| `responseIntents` | `string[]` | 需要人工文本回复的 intent |
| `onContactHuman` | `(request: HumanContactRequest) => Promise<void>` | 通知回调（Slack、邮件等） |
| `formatForHuman` | `(intent: string, step: any) => string` | 为人类格式化 step（可选） |

#### `createAgentRouter(config)`

创建带完整 Agent 生命周期端点的 Express Router。

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `store` | `ThreadStore` | 必需 | 线程持久化存储 |
| `loop` | `AgentLoop` | 必需 | Agent 循环实例 |
| `humanHandler` | `HumanHandler` | 必需 | 人工交互处理器 |
| `threadOptions` | `ThreadConstructorOptions` | — | 创建新 Thread 时传入的选项 |
| `async` | `boolean` | `false` | 非阻塞模式（立即返回 202） |
| `onComplete` | `(id, thread) => Promise<void>` | — | 完成回调 |

### 架构

```
用户输入
    |
    v
+------------------------------------------+
|  Agent 循环 (while loop)                 |
|  +------------------------------------+  |
|  | 1. 序列化 thread -> 上下文          |  |
|  | 2. 调用 LLM -> 结构化 step         |  |
|  | 3. 追加 tool_call 事件              |  |
|  | 4. 检查：暂停 intent？-> 返回       |  |
|  | 5. 执行工具处理器                    |  |
|  | 6. 追加 tool_response 事件          |  |
|  | 7. 回到步骤 1                       |  |
|  +------------------------------------+  |
+------------------+-----------------------+
                   | 暂停
                   v
+-------------------------------+
|  人工处理器                    |
|  - 为人类格式化请求            |
|  - 发送通知                    |
|  - 等待回复                    |
|  - 应用到 thread               |
|  - 恢复循环                    |
+-------------------------------+
                   |
                   v
+-------------------------------+
|  Thread 存储                   |
|  - 持久化快照                  |
|  - 恢复时还原                  |
|  - 内存 / 文件 / 自定义        |
+-------------------------------+
```

### Claude Code Skill

本项目包含 `SKILL.md`，可与 [Claude Code](https://claude.ai/claude-code) 集成。安装方式：

```bash
mkdir -p ~/.claude/skills/reliable-agent-kit
cp SKILL.md ~/.claude/skills/reliable-agent-kit/
```

然后在 Claude Code 中调用：

```
/reliable-agent-kit 构建一个搜索数据库并需要审批删除操作的 Agent
```

Skill 提供 6 个模板（A-F），涵盖基础循环、状态持久化、人工审批、HTTP 服务、完整生产部署和上下文序列化优化。

### 示例

参见 [`examples/`](./examples) 目录中的可运行代码：

| 文件 | 展示内容 |
|------|----------|
| `01-basic-loop.ts` | 最小 Agent 循环，使用模拟 LLM |
| `02-calculator.ts` | 多步工具执行，XML vs JSON 序列化 |
| `03-with-state.ts` | 使用 MemoryStore 的暂停/恢复 |
| `04-human-approval.ts` | 完整审批生命周期 |
| `05-full-server.ts` | 完整 Express 服务，带 Webhook |

### 项目结构

```
reliable-agent-kit/
├── src/
|   ├── index.ts                     # 公共 API — 所有导出
|   ├── agent-loop/
|   |   ├── types.ts                 # AgentLoopConfig, AgentLoopResult, ToolHandler
|   |   └── index.ts                 # createAgentLoop()
|   ├── thread-state/
|   |   ├── types.ts                 # ThreadEvent, ThreadStore, ThreadSnapshot
|   |   ├── thread.ts                # Thread 类（事件溯源、fork、序列化）
|   |   ├── serializer.ts            # JSON / XML / Markdown 序列化
|   |   └── stores/
|   |       ├── index.ts             # Store 导出
|   |       ├── memory-store.ts      # 内存存储（开发/测试）
|   |       └── file-store.ts        # 文件系统存储（简单持久化）
|   └── human-in-loop/
|       ├── types.ts                 # 审批/回复/Webhook 类型
|       ├── handler.ts               # createHumanHandler()
|       ├── router.ts                # createAgentRouter() — Express 端点
|       └── index.ts                 # 模块导出
├── examples/                        # 5 个渐进式示例
├── tests/                           # 36 个测试 (vitest)
├── SKILL.md                         # Claude Code skill 定义
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .gitignore
├── LICENSE
├── CONTRIBUTING.md
├── CHANGELOG.md
└── README.md
```

### 12-Factor 映射

| 因子 | 原则 | 本套件的实现方式 |
|------|------|------------------|
| #3 | 掌控你的上下文窗口 | `Thread.serialize()` 支持 JSON/XML/Markdown 格式 |
| #4 | 工具即结构化输出 | `tools` 映射 — LLM 输出 JSON，你的代码执行 |
| #5 | 统一状态 | `Thread.events` — 一切皆在单一事件日志中 |
| #6 | 启动/暂停/恢复 | `pauseIntents` + `ThreadStore` + `createAgentRouter` |
| #7 | 用工具调用联系人类 | `createHumanHandler` — 人类即结构化工具 |
| #8 | 掌控你的控制流 | 你写 `switch`；循环只负责分发 |
| #9 | 将错误压缩进上下文 | 错误变成事件；LLM 读取后自我修复 |
| #12 | 无状态 Reducer | `Thread` 是状态；`loop.run()` 是 reducer |

### 贡献

参见 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解开发设置和指南。

### 许可

MIT

---

<a id="日本語"></a>

## 日本語

**[中文](#中文) | [日本語](#日本語) | [English](#english)**

プロダクションレベルの LLM Agent 構築キット。[12-Factor Agents](https://github.com/humanlayer/12-factor-agents) 方法論に基づいています。

フレームワークではなく、ツールキットです。Agent のすべてのコードはあなたが管理します。

### 2つの使い方

#### 方法1：Claude Code Skill（推奨）

[Claude Code](https://claude.ai/claude-code) を使用している場合、`SKILL.md` を `~/.claude/skills/reliable-agent-kit/` にコピーして呼び出します：

```
/reliable-agent-kit 注文検索と返金承認付きのカスタマーサポート Agent を構築
```

Claude がプロダクションレベルのコードを生成します。ボイラープレートの手書きは不要です。

#### 方法2：npm ライブラリ

```bash
npm install reliable-agent-kit
```

モジュールをインポートして、プログラムで Agent を構築します。下記の[クイックスタート](#クイックスタート)を参照してください。

### なぜこのキットか

多くの Agent フレームワークは 70-80% まで素早く到達させますが、プロダクション品質への道を塞いでしまいます。このキットは小さく組み合わせ可能なモジュールを提供し、ロックインなしで既存の Node.js アプリケーションに組み込めます。

12-Factor Agents のインサイトに触発されました：最高のプロダクション Agent は、小さなモジュラーコンセプトを既存の製品に組み込むことで構築されます。モノリシックなフレームワークの採用ではありません。

### モジュール

| モジュール | 12-Factor 原則 | 機能 |
|-----------|---------------|------|
| `agent-loop` | #4 ツールは構造化出力, #8 制御フローを掌握 | コア while ループ、ツールディスパッチ、エラー回復、ライフサイクルフック |
| `thread-state` | #3 コンテキストウィンドウを掌握, #5 状態の統一, #12 ステートレス Reducer | イベントソーシング Thread、JSON/XML/Markdown シリアライズ、プラガブルストア |
| `human-in-loop` | #6 起動/一時停止/再開, #7 ツール呼び出しで人間に連絡 | 承認/応答ワークフロー、Express ルーター、Webhook サポート |

### クイックスタート

#### 1. 最小 Agent ループ

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
thread.addEvent({ type: "user_input", data: "3 + 4 はいくつ？" });

const result = await loop.run(thread);
// result.exitReason: "paused" | "max_iterations" | "max_errors" | ...
// thread.events: 全ステップの完全な監査証跡
```

#### 2. 状態の永続化

```typescript
import { Thread, MemoryStore } from "reliable-agent-kit";

const store = new MemoryStore();

// 作成して永続化
const thread = new Thread();
thread.addEvent({ type: "user_input", data: "こんにちは" });
const threadId = store.create(thread.snapshot());

// 後で：復元して再開
const snapshot = store.get(threadId);
const restored = Thread.fromSnapshot(snapshot);
restored.addEvent({ type: "human_response", data: "JSON形式を使用" });
await loop.run(restored);
store.update(threadId, restored.snapshot());
```

ファイルシステムの永続化には、`MemoryStore` を `FileStore` に置き換えます：

```typescript
import { FileStore } from "reliable-agent-kit";
const store = new FileStore("./data/threads");
```

#### 3. ヒューマン・イン・ザ・ループ

```typescript
import { createHumanHandler } from "reliable-agent-kit";

const humanHandler = createHumanHandler({
  approvalIntents: ["deploy", "delete"],
  responseIntents: ["request_clarification"],

  onContactHuman: async (request) => {
    if (request.type === "approval") {
      await sendSlackMessage(`"${request.intent}" を承認しますか？${request.message}`);
    } else {
      await sendEmail(request.message);
    }
  },

  formatForHuman: (intent, step) => {
    if (intent === "deploy") return `${step.target} にデプロイしますか？`;
    return step.message;
  },
});

// Agent 一時停止後：
await humanHandler.handlePause(threadId, thread);

// 人間が応答した時：
humanHandler.handleResponse(thread, {
  type: "approval",
  approved: true,
  comment: "リリースしてください",
});
```

#### 4. 完全な HTTP サーバー

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
    console.log(`スレッド ${threadId} が完了しました`);
  },
});

app.use("/api", router);
app.listen(3000);
```

**生成されるルート：**

| メソッド | パス | 説明 |
|---------|------|------|
| `POST` | `/api/thread` | 新しい Agent スレッドを開始 |
| `GET` | `/api/thread/:id` | スレッドの状態とイベントを取得 |
| `POST` | `/api/thread/:id/respond` | 人間が応答（承認/明確化） |
| `POST` | `/api/webhook` | 外部 Webhook（メール、Slack など） |
| `DELETE` | `/api/thread/:id` | スレッドを削除 |

### API リファレンス

#### `createAgentLoop(config)`

コア Agent ループを作成します。

| オプション | 型 | デフォルト | 説明 |
|-----------|-----|----------|------|
| `resolveNextStep` | `(context: string) => Promise<TStep>` | 必須 | LLM 呼び出し |
| `getIntent` | `(step: TStep) => string` | 必須 | step から intent を抽出 |
| `tools` | `Record<string, ToolHandler>` | 必須 | Intent -> ハンドラーマップ |
| `pauseIntents` | `string[]` | 必須 | ループを一時停止する intent |
| `maxIterations` | `number` | `50` | 安全上限 |
| `maxConsecutiveErrors` | `number` | `3` | 連続エラー閾値 |
| `onError` | `(err, count, thread) => action` | — | カスタムエラー処理（`"continue"` / `"pause"` / `"abort"`） |
| `beforeToolExec` | `(intent, step, thread) => boolean` | — | 実行前フック、`false` を返すとスキップ |
| `afterToolExec` | `(intent, result, thread) => void` | — | 実行後フック |

`.run(thread)` メソッドを持つ `AgentLoop` を返します：

```typescript
interface AgentLoopResult {
  thread: Thread;
  iterations: number;
  exitReason: "paused" | "max_iterations" | "max_errors" | "aborted" | "no_handler";
  lastIntent: string;
}
```

#### `Thread`

イベントソーシング状態コンテナ。

```typescript
const thread = new Thread({
  events: [],                                      // 初期イベント
  metadata: { userId: "u1" },                      // カスタムメタデータ
  humanPauseIntents: ["done_for_now"],             // 「人間待ち」と判定する intent
  approvalIntents: ["deploy"],                     // 「承認待ち」と判定する intent
  serializeFormat: { format: "xml" },              // デフォルトシリアライズ形式
});

thread.addEvent({ type: "user_input", data: "こんにちは" });
thread.lastEvent();                  // 最後のイベントまたは undefined
thread.lastIntent();                 // 最後の tool_call intent または null
thread.eventsByType("error");        // タイプでイベントをフィルタ
thread.isAwaitingHuman();            // 最後のイベントが一時停止 intent か？
thread.isAwaitingApproval();         // 最後のイベントが承認 intent か？
thread.consecutiveErrorCount();      // 末尾の連続エラー数
thread.serialize();                  // デフォルト形式でシリアライズ
thread.serialize({ format: "xml" }); // 形式をオーバーライド
thread.fork();                       // ブランチ用のディープコピー
thread.snapshot();                   // ストレージ用のシリアライズ可能なスナップショット
thread.status(id);                   // サマリーオブジェクト

Thread.fromSnapshot(snapshot, opts); // スナップショットから復元
```

#### シリアライズ形式

```typescript
// JSON — 冗長だがデバッグしやすい
thread.serialize({ format: "json", pretty: true });

// XML（推奨）— JSON より約 40% トークン削減、LLM コンテキストに最適
// <user_input>こんにちは</user_input>
// <add>
//   a: 1
//   b: 2
// </add>
thread.serialize({ format: "xml" });

// Markdown — 人間が読みやすい
thread.serialize({ format: "markdown" });
```

#### ストア

```typescript
// メモリストア（開発/テスト）
import { MemoryStore } from "reliable-agent-kit";
const store = new MemoryStore();

// ファイルシステムストア（シンプルな永続化）
import { FileStore } from "reliable-agent-kit";
const store = new FileStore("./data/threads");

// カスタムストア — インターフェースを実装
interface ThreadStore {
  create(snapshot: ThreadSnapshot): string;
  get(id: string): ThreadSnapshot | undefined;
  update(id: string, snapshot: ThreadSnapshot): void;
  delete(id: string): boolean;
  list(): string[];
}
```

#### `createHumanHandler(config)`

ヒューマン・イン・ザ・ループワークフローのハンドラーを作成します。

| オプション | 型 | 説明 |
|-----------|-----|------|
| `approvalIntents` | `string[]` | 実行前に人間の承認が必要な intent |
| `responseIntents` | `string[]` | 人間のテキスト応答を期待する intent |
| `onContactHuman` | `(request: HumanContactRequest) => Promise<void>` | 通知コールバック（Slack、メールなど） |
| `formatForHuman` | `(intent: string, step: any) => string` | 人間向けに step をフォーマット（任意） |

#### `createAgentRouter(config)`

完全な Agent ライフサイクルエンドポイントを持つ Express Router を作成します。

| オプション | 型 | デフォルト | 説明 |
|-----------|-----|----------|------|
| `store` | `ThreadStore` | 必須 | スレッド永続化ストア |
| `loop` | `AgentLoop` | 必須 | Agent ループインスタンス |
| `humanHandler` | `HumanHandler` | 必須 | 人間インタラクションハンドラー |
| `threadOptions` | `ThreadConstructorOptions` | — | 新しい Thread 作成時に渡すオプション |
| `async` | `boolean` | `false` | ノンブロッキングモード（即座に 202 を返す） |
| `onComplete` | `(id, thread) => Promise<void>` | — | 完了コールバック |

### アーキテクチャ

```
ユーザー入力
    |
    v
+------------------------------------------+
|  Agent ループ (while loop)               |
|  +------------------------------------+  |
|  | 1. thread をシリアライズ -> コンテキスト |  |
|  | 2. LLM を呼び出し -> 構造化 step    |  |
|  | 3. tool_call イベントを追加          |  |
|  | 4. チェック：一時停止 intent？-> 返却 |  |
|  | 5. ツールハンドラーを実行             |  |
|  | 6. tool_response イベントを追加       |  |
|  | 7. ステップ 1 に戻る                 |  |
|  +------------------------------------+  |
+------------------+-----------------------+
                   | 一時停止
                   v
+-------------------------------+
|  ヒューマンハンドラー           |
|  - 人間向けにリクエストをフォーマット |
|  - 通知を送信                  |
|  - 応答を待つ                  |
|  - thread に適用               |
|  - ループを再開                |
+-------------------------------+
                   |
                   v
+-------------------------------+
|  Thread ストア                 |
|  - スナップショットを永続化     |
|  - 再開時に復元                |
|  - メモリ / ファイル / カスタム  |
+-------------------------------+
```

### Claude Code Skill

このプロジェクトには [Claude Code](https://claude.ai/claude-code) と統合する `SKILL.md` が含まれています。インストール方法：

```bash
mkdir -p ~/.claude/skills/reliable-agent-kit
cp SKILL.md ~/.claude/skills/reliable-agent-kit/
```

Claude Code で呼び出します：

```
/reliable-agent-kit データベースを検索し、削除操作に承認が必要な Agent を構築
```

Skill は 6 つのテンプレート（A-F）を提供し、基本ループ、状態永続化、人間承認、HTTP サーバー、完全なプロダクション構成、コンテキストシリアライズ最適化をカバーします。

### サンプル

実行可能なコードは [`examples/`](./examples) ディレクトリを参照してください：

| ファイル | 内容 |
|---------|------|
| `01-basic-loop.ts` | 最小 Agent ループ、モック LLM 使用 |
| `02-calculator.ts` | マルチステップツール実行、XML vs JSON シリアライズ |
| `03-with-state.ts` | MemoryStore によるパウズ/レジューム |
| `04-human-approval.ts` | 完全な承認ライフサイクル |
| `05-full-server.ts` | 完全な Express サーバー、Webhook 付き |

### プロジェクト構成

```
reliable-agent-kit/
├── src/
|   ├── index.ts                     # パブリック API — 全エクスポート
|   ├── agent-loop/
|   |   ├── types.ts                 # AgentLoopConfig, AgentLoopResult, ToolHandler
|   |   └── index.ts                 # createAgentLoop()
|   ├── thread-state/
|   |   ├── types.ts                 # ThreadEvent, ThreadStore, ThreadSnapshot
|   |   ├── thread.ts                # Thread クラス（イベントソーシング、fork、シリアライズ）
|   |   ├── serializer.ts            # JSON / XML / Markdown シリアライズ
|   |   └── stores/
|   |       ├── index.ts             # Store エクスポート
|   |       ├── memory-store.ts      # メモリストア（開発/テスト）
|   |       └── file-store.ts        # ファイルシステムストア（シンプルな永続化）
|   └── human-in-loop/
|       ├── types.ts                 # 承認/応答/Webhook 型
|       ├── handler.ts               # createHumanHandler()
|       ├── router.ts                # createAgentRouter() — Express エンドポイント
|       └── index.ts                 # モジュールエクスポート
├── examples/                        # 5 つの段階的サンプル
├── tests/                           # 36 テスト (vitest)
├── SKILL.md                         # Claude Code skill 定義
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .gitignore
├── LICENSE
├── CONTRIBUTING.md
├── CHANGELOG.md
└── README.md
```

### 12-Factor マッピング

| ファクター | 原則 | このキットでの実装 |
|-----------|------|-------------------|
| #3 | コンテキストウィンドウを掌握 | `Thread.serialize()` で JSON/XML/Markdown 形式をサポート |
| #4 | ツールは構造化出力 | `tools` マップ — LLM が JSON を出力、コードが実行 |
| #5 | 状態の統一 | `Thread.events` — すべてが単一イベントログに |
| #6 | 起動/一時停止/再開 | `pauseIntents` + `ThreadStore` + `createAgentRouter` |
| #7 | ツール呼び出しで人間に連絡 | `createHumanHandler` — 人間を構造化ツールとして扱う |
| #8 | 制御フローを掌握 | あなたが `switch` を書く；ループはディスパッチするだけ |
| #9 | エラーをコンテキストに圧縮 | エラーがイベントになり、LLM が読んで自己修復 |
| #12 | ステートレス Reducer | `Thread` が状態；`loop.run()` が reducer |

### コントリビュート

開発環境の構築とガイドラインは [CONTRIBUTING.md](./CONTRIBUTING.md) を参照してください。

### ライセンス

MIT

---

<a id="english"></a>

## English

**[中文](#中文) | [日本語](#日本語) | [English](#english)**

Production-grade building blocks for LLM agents, based on the [12-Factor Agents](https://github.com/humanlayer/12-factor-agents) methodology.

Not a framework — a toolkit. You own every line of your agent's code.

### Two Ways to Use

#### Way 1: Claude Code Skill (Recommended)

If you use [Claude Code](https://claude.ai/claude-code), copy `SKILL.md` into `~/.claude/skills/reliable-agent-kit/` and invoke:

```
/reliable-agent-kit Build a customer support agent with order lookup and refund approval
```

Claude generates production-ready code for you — no boilerplate to write by hand.

#### Way 2: npm Library

```bash
npm install reliable-agent-kit
```

Import the modules and build your agent programmatically. See [Quick Start](#quick-start) below.

### Why

Most agent frameworks get you to 70-80% fast, then block you from reaching production quality. This kit gives you small, composable modules that slot into your existing Node.js application without lock-in.

Inspired by the insight from 12-Factor Agents: the best production agents are built by taking small, modular concepts and incorporating them into existing products — not by adopting monolithic frameworks.

### Modules

| Module | 12-Factor Principles | What it does |
|--------|---------------------|--------------|
| `agent-loop` | #4 Tools Are Structured Outputs, #8 Own Your Control Flow | Core while-loop with tool dispatch, error recovery, lifecycle hooks |
| `thread-state` | #3 Own Your Context Window, #5 Unify State, #12 Stateless Reducer | Event-sourced Thread, JSON/XML/Markdown serialization, pluggable stores |
| `human-in-loop` | #6 Launch/Pause/Resume, #7 Contact Humans with Tool Calls | Approval/response workflows, Express router, webhook support |

### Quick Start

#### 1. Minimal Agent Loop

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

#### 2. With State Persistence

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

#### 3. Human-in-the-Loop

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

#### 4. Full HTTP Server

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

### API Reference

#### `createAgentLoop(config)`

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

#### `Thread`

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

#### Serialization Formats

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

#### Stores

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

#### `createHumanHandler(config)`

Creates handlers for human-in-the-loop workflows.

| Option | Type | Description |
|--------|------|-------------|
| `approvalIntents` | `string[]` | Intents requiring human approval before execution |
| `responseIntents` | `string[]` | Intents expecting human text response |
| `onContactHuman` | `(request: HumanContactRequest) => Promise<void>` | Notification callback (Slack, email, etc.) |
| `formatForHuman` | `(intent: string, step: any) => string` | Format step for humans (optional) |

#### `createAgentRouter(config)`

Creates an Express Router with full agent lifecycle endpoints.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `store` | `ThreadStore` | required | Where to persist threads |
| `loop` | `AgentLoop` | required | The agent loop instance |
| `humanHandler` | `HumanHandler` | required | Human interaction handler |
| `threadOptions` | `ThreadConstructorOptions` | — | Options passed when creating new Thread instances |
| `async` | `boolean` | `false` | Non-blocking mode (returns 202 immediately) |
| `onComplete` | `(id, thread) => Promise<void>` | — | Completion callback |

### Architecture

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

### Claude Code Skill

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

### Examples

See the [`examples/`](./examples) directory for runnable code:

| File | What it shows |
|------|---------------|
| `01-basic-loop.ts` | Minimal agent loop with mock LLM |
| `02-calculator.ts` | Multi-step tool execution, XML vs JSON serialization |
| `03-with-state.ts` | Pause/resume with MemoryStore |
| `04-human-approval.ts` | Full approval lifecycle |
| `05-full-server.ts` | Complete Express server with webhooks |

### Project Structure

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

### 12-Factor Mapping

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

### Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

### License

MIT
