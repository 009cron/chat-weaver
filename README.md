# Chat Weaver

Frontend chat UI (Vite + React) with a local Node API server that streams OpenRouter responses.

## 1) Setup

```bash
npm install
cp .env.example .env
```

Create `.env` in project root (or edit the generated file):

```bash
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxx
# optional: multiple keys (comma or newline separated)
# OPENROUTER_API_KEYS=sk-or-v1-key1,sk-or-v1-key2

PORT=3001
OPENROUTER_UPSTREAM_STREAM=false
OPENROUTER_REASONING_ENABLED=false
OPENROUTER_STT_MODEL=openai/whisper-1
OPENROUTER_REFERER=
OPENROUTER_TITLE=
WORKSPACE_DIR=./workspace

# Global fallback if agent-specific model is missing
OPENROUTER_MODEL=qwen/qwen3.6-plus-preview:free

# Free profile (coder upgraded)
AGENT_GENERAL_MODEL=qwen/qwen3.6-plus-preview:free
AGENT_CODER_MODEL=qwen/qwen3-next-80b-a3b-instruct:free
AGENT_RESEARCH_MODEL=qwen/qwen3.6-plus-preview:free
AGENT_DESIGNER_MODEL=qwen/qwen3.6-plus-preview:free
AGENT_BUILDER_MODEL=qwen/qwen3.6-plus-preview:free
AGENT_REVIEWER_MODEL=qwen/qwen3.6-plus-preview:free
AGENT_TESTER_MODEL=qwen/qwen3.6-plus-preview:free
AGENT_PLANNER_MODEL=qwen/qwen3.6-plus-preview:free
AGENT_DOCS_MODEL=qwen/qwen3.6-plus-preview:free
AGENT_ANALYST_MODEL=qwen/qwen3.6-plus-preview:free
AGENT_DEBUGGER_MODEL=qwen/qwen3.6-plus-preview:free
```

### Suggested final profiles

- **Qwen free baseline + stronger coder:** default stays free Qwen for all agents, with `AGENT_CODER_MODEL` set to `qwen/qwen3-next-80b-a3b-instruct:free` for better coding output.
- **Override mode:** you can still set any `AGENT_*_MODEL` manually later if you want paid/stable options.

## 2) Run locally

Run API server + frontend together:

```bash
npm run dev:full
```

- Frontend: `http://localhost:8080` (Vite)
- API: `http://localhost:3001/api/*`
- Uploaded files are served at `http://localhost:3001/uploads/*`

The frontend uses `VITE_API_URL` if set, otherwise defaults to `/api`.

## 3) Persisted data

The API now persists conversations + uploaded file metadata to:

- `data/chat-db.json`

Uploaded files are written to:

- `uploads/`

So chats and attachment history survive server restarts.

## 4) Deploy notes

- Keep `OPENROUTER_API_KEY` only in server environment variables (never commit).
- On Vercel, set `OPENROUTER_API_KEY` (or `OPENROUTER_API_KEYS`) in Project Settings → Environment Variables.
- You do **not** need separate Anthropic/OpenAI/DeepSeek keys when routing via OpenRouter.
- On Vercel we recommend `OPENROUTER_UPSTREAM_STREAM=false` for stability (frontend still receives SSE events).
- Deploy frontend and API together (or set `VITE_API_URL` to your deployed API base URL).
- Required API routes implemented in this repo:
  - `GET /api/health`
  - `GET /api/agents`
  - `GET /api/workspace/tree`
  - `GET /api/workspace/file?path=...`
  - `GET /api/conversations`
  - `GET /api/conversations/:id`
  - `DELETE /api/conversations/:id`
  - `POST /api/chat` (SSE streaming)
  - `POST /api/upload` (multipart file upload)
  - `POST /api/voice/transcribe` (audio-to-text via OpenRouter)


## 5) File parsing behavior

- Upload route accepts any extension (`*/*` from UI).
- Backend attempts text extraction for text-like formats (`.txt`, `.md`, `.csv`, `.json`, `.js`, `.ts`, `.py`, etc.).
- Parsed text is chunked and injected into chat context so agents can answer based on file contents.
- Unsupported/binary formats are still stored as attachments but not parsed automatically.



## 6) Workspace references in chat

You can reference workspace files directly in a prompt:

- `@file:path/to/file.ext`

The backend will read and inject file content (truncated) into the model context.

## 7) Focus lock + code improvement sweep

`POST /api/chat` now includes two guardrails for execution-focused workflows:

- **Stay-on-topic until resolved:** the server tracks an active goal per conversation and blocks likely topic switches until the user explicitly marks completion (e.g. `resolved`, `done`, `selesai`).
- **Auto code-improvement sweep:** for coding/debugging flows, the server scans `WORKSPACE_DIR` for `TODO/FIXME/HACK/BUG/...` markers and injects top findings (`file:line:match`) into chat context.

This helps the assistant keep momentum on one objective while still catching missed code issues across files.

### Human controls (chat commands)

- `/goal set:<text>` → set/replace current active goal explicitly.
- `/goal resolve` or `/resolve` → mark active goal resolved.
- `/goal switch` or `/switch` → intentionally bypass topic lock and switch topics.
- `/sweep on|off|once` → control auto code-improvement sweep behavior.

Performance note: sweep results are cached briefly and hard-timeboxed to avoid chat latency spikes.

## 8) Agentic Builder HTML prototype

A standalone UI shell is available at:

- `examples/agentic-builder-api-enabled.html`

Open it directly in the browser for a quick static prototype preview. Wire its message action to `/api/chat` for live backend responses.

## 9) Execution mode in API chat

The API supports an optional structured execution mode in conversations:

- `GET /api/gsd/templates` to fetch XML task schema + default execution prompt
- `GET /api/gsd/state/:conversationId` to inspect active execution state
- `POST /api/gsd/verify` to validate task XML contract
- chat controls:
  - `/gsd on`
  - `/gsd off`
  - `/gsd phase:<name>`

When enabled, chat context injects current phase state and requests XML task output for planning/execution flows. If a task-style response misses required XML tags, backend appends a safe default task block.
