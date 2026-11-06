# AGENTS.md — Developer & AI Agent Guidelines

This document provides architectural rules, module maps, and engineering guidelines for AI agents and human developers maintaining and extending **Bot Pega Mitra** (`bot-pega-mitra`).

---

## 🧭 Project Context & Core Philosophy

**Bot Pega Mitra** is a high-performance CLI tool that automates menial activity uploads to the Mitra PayrollQ platform ([hcq.payrollq.id](https://hcq.payrollq.id)).

### Evolution & Major Changes (v3.0.0)

1. **Browserless Architecture**: Migrated completely from Puppeteer/Chromium automation to direct, typed HTTP API calls (`UniportApiClient`), slashing memory usage from ~500MB to ~30MB.
2. **Bun Native Stack**: Built entirely on [Bun](https://bun.sh) (`>= 1.4.4`). Uses native `Bun.file().image()` for in-memory image processing (no Sharp/libvips wasm), `bun test` for testing, and `bun build --compile` for Windows x64 binary generation.
3. **Uniport OAuth & DPoP**: Implements upstream's 5-step authentication handshake with RFC 9449 DPoP (ECDSA P-256) cryptographic tokens.
4. **Auth Token Reuse**: Integrates with PocketBase (`mitrabot_sessions`) to cache tokens and session cookies across runs, enabling instant passwordless auto-login with automatic fallback on token expiry.
5. **Batch Telemetry**: Dispatches job completion metrics to PocketBase (`mitrabot_tracing`) per user and activity batch.
6. **Robust Interactive UX**: Uses `@clack/prompts` with forward-only prompts, preventing duplicate terminal redraw loops on login errors.

---

## 🗂️ Codebase Architecture & File Mapping

```
PegaUploaderBot/
├── src/
│   ├── index.ts        # CLI entrypoint and global process error listeners
│   ├── bot.ts          # MainBot controller orchestrating CLI steps and batch loops
│   ├── api.ts          # UniportApiClient (OAuth, DPoP handshake, context, activities, uploads)
│   ├── license.ts      # LicenseManager, PocketBase session caching, and telemetry
│   ├── dpop.ts         # RFC 9449 DPoP proof generation using Web Crypto (ECDSA P-256)
│   ├── headers.ts      # Browser header emulation (Chrome 134 Windows) and browserFetch
│   ├── files.ts        # Directory synchronization, image filtering, in-memory compression, trash
│   ├── error.ts        # ApiError class, verbose flag detection, formatters, and error.log
│   └── color.ts        # Terminal color utilities powered by Bun.color
├── test/               # Bun test suites mirroring src/
│   ├── api.test.ts
│   ├── bot.test.ts
│   ├── color.test.ts
│   ├── dpop.test.ts
│   ├── error.test.ts
│   ├── files.test.ts
│   ├── headers.test.ts
│   └── license.test.ts
├── openspec/           # Specifications and change logs
│   ├── config.yaml
│   └── specs/          # Main specs: cli-workflow, uniport-auth, mitra-activity-upload
├── build.ts            # Standalone Windows x64 compiler script
├── package.json        # Package configuration and dependencies
└── tsconfig.json       # TypeScript configuration (strict mode)
```

---

## ⚙️ Key Invariants & Architectural Rules

### 1. Bun-First Dependency Policy

- **Never add external dependencies** when Bun or standard Web APIs provide the capability.
- Use `Bun.file(path).image()` for image decoding, resizing, and compression.
- Use `crypto.subtle` (Web Cryptography API) for cryptographic operations (ECDSA P-256, SHA-256).
- Use `Bun.color` for terminal color formatting.
- Use `Bun.spawn` for process execution.

### 2. Authentication & Session Cache Invariants

- **5-Step Uniport Flow**:
  1. `POST /api/uniport/create-session` -> `sessionId`
  2. `GET /api/uniport/check-session?sessionId=...` -> session verification
  3. `POST /api/uniport/login-password` -> password verification
  4. `POST /api/uniport/consume-session` (with DPoP proof) -> `identityToken` (handoff)
  5. `POST /api/uniport/handoff-token` (with DPoP proof + `ath` hash) -> Mitra `identityToken`
- **Session Caching (`mitrabot_sessions`)**:
  - Saved fields: `email`, `token`, `cookies` (JSON map), `expires_at` (ISO 8601).
  - List view on PocketBase is restricted to admin-only. Session lookups are executed either by email filter query or single record ID.
  - Expiry is decoded from the JWT's `exp` claim via `getTokenExpiry()`, with a default fallback TTL.
  - Validation requires a 60-second safety buffer (`isSessionValid`).
  - When a cached token encounters a `401 Unauthorized` during `getUserContext()`, the bot **must fallback to prompting the password**, re-authenticating, and updating PocketBase.
  - The `onSessionUpdate` hook on `UniportApiClient` automatically pushes newly acquired or refreshed tokens to PocketBase.

### 3. Network & Browser Emulation Invariants

- Upstream endpoints inspect user agents and browser headers.
- Always utilize `createBrowserHeaders()` or `browserFetch()` to ensure requests look like genuine Chrome 134 on Windows (matching `sec-ch-ua`, `sec-fetch-dest`, `sec-fetch-mode`, `sec-fetch-site`, and referrer chains).
- In network checks (`checkNetwork`), use `mode: 'navigate'` to emulate standard document navigation.

### 4. File System & Image Pipeline Invariants

- **Zero Temporary Disk Files**: Images must be processed entirely in memory.
- **Resize Policy**:
  - `width > 1920`: Resize width to `Math.round(width / 4)` and encode as JPEG at quality `75`.
  - `width <= 1920`: Keep original dimensions and encode as JPEG at quality `60`.
- **Trash Safety**:
  - Only move files to `images/trash/` **after** both `/mulai` and `/selesai` have succeeded.
  - Handle cross-device file moves (`EXDEV` error code) safely via copy + unlink.
  - **Never delete or trash files that failed upload**; leave them in place so the user can re-run the batch.

### 5. Error Handling & Privacy

- Never display verbose API payload errors or stack traces in the default CLI view.
- Wrap API errors in `ApiError` (`error.ts`).
- Show detailed payloads only when `--verbose`, `-v`, or `process.env.VERBOSE="true"` is detected.
- Append all unexpected errors, batch upload errors, and failed telemetry dispatches to `error.log`.

### 6. Batch Completion Telemetry

- Telemetry dispatch is non-fatal: errors during telemetry must be logged to `error.log` and must **never** abort user workflow or crash the program.
- Dispatched payload to `${LICENSE_URL}/api/collections/mitrabot_tracing/records`:
  ```json
  {
    "user": "<user_email>",
    "job_name": "<activity_name>",
    "job_count": <successCount>
  }
  ```
- Requires `Authorization: Bearer <token>` from `LicenseAuthResponse`.

---

## 📐 OpenSpec System

This project tracks features and requirements using [OpenSpec](./openspec/):

- **Main Specs**:
  - [`openspec/specs/cli-workflow/spec.md`](./openspec/specs/cli-workflow/spec.md): Interactive prompts, credential fallback, activity selection, keterangan modes, multi-batch loop.
  - [`openspec/specs/uniport-auth/spec.md`](./openspec/specs/uniport-auth/spec.md): 5-step OAuth, DPoP token generation, PocketBase session caching, 401 session recovery.
  - [`openspec/specs/mitra-activity-upload/spec.md`](./openspec/specs/mitra-activity-upload/spec.md): Directory sync, in-memory compression, two-step API submission (`/mulai` -> `/selesai`), trash archiving, and telemetry.

### Guidelines for Agents Modifying Functionality

1. Before altering authentication, uploads, or CLI behaviors, consult the corresponding specification in `openspec/specs/`.
2. Follow the standard OpenSpec proposal -> apply -> sync -> archive workflow for non-trivial architectural changes.

---

## 🧪 Testing & Verification Protocol

Agents MUST run and pass all test suites before concluding any modifications:

```bash
# Run all tests
bun test

# Type check
bun x tsc --noEmit
```

### Mocking Strategy in Tests

- `UniportApiClient`, `MainBot`, and `LicenseManager` support dependency injection (`fetchFn`, `prompts`, `env`, etc.).
- Never perform real network requests in automated tests. Inject mocked `fetchFn` handlers.
- When adding new functionality, write matching test cases in `test/<module>.test.ts`.

---

## 🔨 Build & Compilation

To generate the standalone production executable:

```bash
bun run build
```

This invokes `build.ts`, which compiles `src/index.ts` with `--bytecode`, `--minify`, `--target=bun-windows-x64`, and defines compile-time variables for `LICENSE_URL` and `LICENSE_TOKEN`.
