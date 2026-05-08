# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-05-08

### Added

- **agent-loop** module: core while-loop with tool dispatch, error recovery, lifecycle hooks (`beforeToolExec`, `afterToolExec`, `onError`)
- **thread-state** module: `Thread` class with event sourcing, JSON/XML/Markdown serialization, `MemoryStore` and `FileStore`
- **human-in-loop** module: `createHumanHandler()` for approval/response workflows, `createAgentRouter()` for Express HTTP endpoints with webhook support
- 5 progressive examples (basic loop → calculator → state → approval → full server)
- 36 test cases covering all three modules
- Full TypeScript type definitions with generics support
