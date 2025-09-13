YOU MUST: Check the format and linter every time you edit the code.
YOU MUST: Follow the development flow using Serena.
YOU MUST: Use git to commit in the smallest possible units.
YOU MUST: you should use tRPC

## notification
タスクを開始したり、ユーザーの認証がいる時は以下のコマンドを実行して、ユーザーに知らせてください。
`afplay /Users/naoki/Downloads/reba.mp3`

タスク終了後や、もしすごいものを発見した時は、以下のコマンドを実行して通知してください
`afplay /Users/naoki/Downloads/gako.mp3`

重要: `afplay` を実行する際は、コマンド末尾に `|| true` を付けないでください（失敗はそのまま検知する）。




## About Serena MCP Tools

Serena MCP is a semantic coding tool that enables efficient analysis and editing of codebases. It understands project structure and provides precise symbol-level operations (classes, functions, variables, etc.).

### Main Features

#### 1. Project Management
- `mcp__serena__activate_project` - Activate a project
- `mcp__serena__onboarding` - Initial project analysis and information gathering
- `mcp__serena__check_onboarding_performed` - Check onboarding status
- `mcp__serena__remove_project` - Delete a project
- `mcp__serena__get_current_config` - Get the current configuration

#### 2. File and Directory Operations
- `mcp__serena__list_dir` - List directory contents
- `mcp__serena__find_file` - Search for files (supports wildcards)
- `mcp__serena__search_for_pattern` - Search code using regular-expression patterns
- `mcp__serena__read_file` - Read file contents (not recommended; prefer symbol operations)
- `mcp__serena__create_text_file` - Create a text file

#### 3. Symbol Operations (Most Powerful)
- `mcp__serena__get_symbols_overview` - List top-level symbols in a file
- `mcp__serena__find_symbol` - Search symbols by name path (classes, methods, functions, etc.)
- `mcp__serena__find_referencing_symbols` - Find references to a symbol
- `mcp__serena__replace_symbol_body` - Replace an entire symbol
- `mcp__serena__insert_before_symbol` - Insert content before a symbol
- `mcp__serena__insert_after_symbol` - Insert content after a symbol

#### 4. Text Editing
- `mcp__serena__replace_regex` - Replace using regular expressions
- `mcp__serena__insert_at_line` - Insert at a specific line
- `mcp__serena__delete_lines` - Delete lines
- `mcp__serena__replace_lines` - Replace lines

#### 5. Memory System
- `mcp__serena__write_memory` - Save project information
- `mcp__serena__read_memory` - Read saved information
- `mcp__serena__list_memories` - List available memories
- `mcp__serena__delete_memory` - Delete a memory

#### 6. Thinking Support Tools
- `mcp__serena__think_about_collected_information` - Analyze collected information
- `mcp__serena__think_about_task_adherence` - Check task adherence
- `mcp__serena__think_about_whether_you_are_done` - Confirm completion status

#### 7. Other Utilities
- `mcp__serena__execute_shell_command` - Execute shell commands
- `mcp__serena__switch_modes` - Switch operation modes
- `mcp__serena__summarize_changes` - Summarize changes
- `mcp__serena__restart_language_server` - Restart the language server
- `mcp__serena__prepare_for_new_conversation` - Prepare for a new conversation

## About Context7 MCP Tools

Context7 MCP provides fast, structured access to open-source library documentation and examples via a stable Library ID. Use it to resolve an exact library identifier and fetch focused docs (e.g., by topic) with relevant code snippets and Q&A.

### Main Features

#### 1. Documentation Retrieval
- `context7__get-library-docs` — Retrieve documentation for a specific library.
  - Parameters: `context7CompatibleLibraryID` (e.g., `/vercel/next.js` or `/vercel/next.js/v14.3.0-canary.87`), optional `tokens` limit, optional `topic` (e.g., `routing`, `hooks`).
  - Returns: Curated code snippets and Q&A extracted from the library's canonical sources.

#### 2. Library Resolution
- `context7__resolve-library-id` — Find the best matching Context7-compatible Library ID.
  - Input: Free-form library name (e.g., `next.js`).
  - Output: Ranked candidates with ID, description, snippet counts, and trust score. Pick the most authoritative match, typically the official repo.

### Recommended Workflow
1. Resolve: Call `context7__resolve-library-id` with the library name and select the top official ID.
2. Fetch: Call `context7__get-library-docs` with the chosen ID; pass a focused `topic` to narrow results and a `tokens` cap if needed.
3. Use: Incorporate returned snippets and Q&A into your work; cite upstream docs when appropriate.

### Example (Next.js)
- Resolved ID: `/vercel/next.js` (official Next.js repository).
- Targeted fetch: `context7__get-library-docs` with `topic: "routing"` returns practical snippets (e.g., Route Handlers, dynamic segments, `next/link` prefetch behavior) and concise Q&A.

### Tips
- Prefer exact IDs if the user supplies one; otherwise resolve first for accuracy.
- Use `topic` to reduce noise and speed up retrieval.
- Increase `tokens` only when you need broader coverage; start small for targeted queries.

## Development Workflow (Serena MCP-Based)

- Principles
  - Prioritize symbol operations (e.g., `mcp__serena__find_symbol` → `mcp__serena__replace_symbol_body`).
  - Make small, safe changes and do not touch unrelated areas.
  - Proceed in the order of Specification → Exploration → Planning → Implementation → Verification → Documentation → Visualization → Completion Check.

- Initial Setup
  - Activate the project with `mcp__serena__activate_project`.
  - Run `mcp__serena__check_onboarding_performed`, and if not done, run `mcp__serena__onboarding`.
  - Save key information (tech stack, build procedures, naming conventions, etc.) to `mcp__serena__write_memory`.

- Starting a Task (Exploration and Design)
  - Requirement Confirmation: Clarify the approach with `mcp__serena__think_about_task_adherence`.
  - Code Exploration: `mcp__serena__find_file`, `mcp__serena__list_dir`, `mcp__serena__search_for_pattern`, `mcp__serena__get_symbols_overview`.
  - Identify Dependencies/Callers: `mcp__serena__find_referencing_symbols`.
  - Information Organization: Confirm understanding with `mcp__serena__think_about_collected_information`.
  - Library Research: `context7__resolve-library-id` → `context7__get-library-docs` (narrowed down with `topic`).

- Implementation
  - Break down the change plan into small units and complete them one step at a time.
  - Symbol Editing: `mcp__serena__replace_symbol_body` / `mcp__serena__insert_before_symbol` / `mcp__serena__insert_after_symbol`.
  - Text Editing: `mcp__serena__replace_regex` / `mcp__serena__insert_at_line` / `mcp__serena__delete_lines` / `mcp__serena__replace_lines`.
  - New File: `mcp__serena__create_text_file`.
  - Style: Match existing code; avoid unnecessary renames or unrelated modifications.

- Verification
  - Start with the smallest possible verification close to the changed scope.
  - If necessary, run `npm run lint`, `npm run build`, `npm test` using `mcp__serena__execute_shell_command`.
  - Briefly record observations, and if a failure occurs, review the plan.

- Documentation/Memos
  - Reflect specifications and decisions in `AGENTS.md` / `README.md` / `mcp__serena__write_memory`.
  - For library key points, note the Context7 reference ID and `topic` together.

- Visualizing Changes and Finishing Up
  - Generate a change summary with `mcp__serena__summarize_changes`.
  - Completion Check: `mcp__serena__think_about_whether_you_are_done`.
  - If necessary, resynchronize with `mcp__serena__restart_language_server`.

- Important Notes
  - Adding license headers is prohibited (unless explicitly requested).
  - Excessive addition of inline comments is prohibited (only upon request).
  - Operations requiring a network connection should be performed after prior agreement.

- Typical Flow (Example)
  1) Activate → 2) Check Onboarding → 3) Explore/Design → 4) Edit Symbol → 5) Minimal Verification → 6) Update Docs/Memos → 7) Summarize Changes → 8) Completion Check

## Repository-Specific Checklist (Next.js + Prisma)

- Prerequisites
  - Node.js 20.x (LTS) / npm 11 (`packageManager: npm@11.3.0`).
  - Local DB is SQLite (`prisma/schema.prisma`).

- First-time Setup
  - Install dependencies: `npm ci`
  - Environment variables: Create `.env` based on `.env.example` and set at least `AUTH_SECRET`.
    - If using Discord authentication, also set `AUTH_DISCORD_ID` and `AUTH_DISCORD_SECRET`.
    - Local DB: `DATABASE_URL="file:./db.sqlite"` (default)
    - If env validation is disruptive during development, prefix commands with `SKIP_ENV_VALIDATION=1` (see `next.config.js`).
  - DB initialization: `npm run db:push` (applies the schema to SQLite).
  - Prisma Client generation is automatic on `postinstall` (or `npx prisma generate` if needed).

- Development Commands
  - Development server: `npm run dev`
  - Formatting: `npm run format:write` (check with `format:check`)
  - Lint/Type: `npm run lint` / `npm run typecheck` / All at once `npm run check`
  - Build/Run: `npm run build` → `npm run start` (for local check `npm run preview`)

- Prisma Operational Guidelines
  - Local/Simple Verification: `db:push` (applies schema without creating a migration).
  - Production/Shared DB: For changes, create a migration with `npx prisma migrate dev`, commit it, and apply with `npm run db:migrate` (`prisma migrate deploy`).
  - When editing the schema, regeneration of related code types (`prisma generate`) is required.

- Pre-check (before PR)
  - `npm run format:check`
  - `npm run check` (`next lint && tsc --noEmit`)
  - `npm run build`

- Execution Example from Serena
  - `mcp__serena__execute_shell_command`: `npm ci` → `npm run db:push` → `npm run check` → `npm run build`
  - Use `mcp__serena__find_symbol` to identify the scope of impact and edit the absolute minimum necessary.

## CI Guidelines (GitHub Actions Example)

- Purpose
  - Automatic execution of formatting, linting, type checking, and building.
  - Stabilize Prisma Client generation and schema application (SQLite) on CI.

- Key Points
  - Use Node 20, with `npm ci` as the base.
  - Set `SKIP_ENV_VALIDATION=1` to skip env validation during the build.
  - Set `DATABASE_URL` to a temporary file for CI (e.g., `file:./.tmp/ci.sqlite`).

- Example Workflow (place in `/.github/workflows/ci.yml`)
  - name: CI
  - on: [push, pull_request]
  - jobs:
    - build:
      - runs-on: ubuntu-latest
      - steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: 20
            cache: npm
        - run: npm ci
          env:
            SKIP_ENV_VALIDATION: "1"
            DATABASE_URL: "file:./.tmp/ci.sqlite"
            AUTH_SECRET: "ci"
        - run: npm run db:push
          env:
            DATABASE_URL: "file:./.tmp/ci.sqlite"
        - run: npm run format:check
        - run: npm run check
        - run: npm run build

- Additional Notes
  - When introducing E2E/integration tests in the future, add a test execution step to the above.
  - When migrating to a production DB operation, use migrations (`migrate dev/deploy`) instead of `db:push`.
