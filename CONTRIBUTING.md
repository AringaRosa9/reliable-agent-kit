# Contributing to reliable-agent-kit

Thanks for your interest in contributing!

## Development Setup

```bash
git clone https://github.com/AringaRosa9/reliable-agent-kit.git
cd reliable-agent-kit
npm install
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run dev` | Watch mode compilation |
| `npm test` | Run all tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Lint source files |

## Project Structure

```
src/
├── index.ts                 # Public API — all exports
├── agent-loop/              # Core agent loop module
│   ├── types.ts             # AgentLoopConfig, AgentLoopResult
│   └── index.ts             # createAgentLoop()
├── thread-state/            # Event-sourced state management
│   ├── types.ts             # ThreadEvent, ThreadStore, etc.
│   ├── thread.ts            # Thread class
│   ├── serializer.ts        # JSON / XML / Markdown serialization
│   └── stores/
│       ├── memory-store.ts  # In-memory (dev/test)
│       └── file-store.ts    # Filesystem persistence
└── human-in-loop/           # Human-in-the-loop workflows
    ├── types.ts             # Approval/Response types
    ├── handler.ts           # createHumanHandler()
    └── router.ts            # createAgentRouter() (Express)
```

## Pull Request Guidelines

1. **Fork** the repo and create a feature branch from `main`
2. **Write tests** for any new functionality
3. **Run** `npm test` and `npm run build` before submitting
4. **Keep PRs focused** — one feature or fix per PR
5. **Follow existing code style** — no extra comments, no unnecessary abstractions

## Reporting Issues

Open an issue with:
- A clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Node.js version and OS
