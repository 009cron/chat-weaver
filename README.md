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
OPENROUTER_MODEL=deepseek/deepseek-v3.2

# Final preset (personal + cost-aware)
AGENT_GENERAL_MODEL=deepseek/deepseek-v3.2
AGENT_CODER_MODEL=qwen/qwen3-coder-30b-a3b-instruct
AGENT_RESEARCH_MODEL=anthropic/claude-sonnet-4.6
AGENT_DESIGNER_MODEL=anthropic/claude-sonnet-4.6
AGENT_BUILDER_MODEL=deepseek/deepseek-v3.2
AGENT_REVIEWER_MODEL=deepseek/deepseek-v3.2
AGENT_TESTER_MODEL=deepseek/deepseek-v3.2
AGENT_PLANNER_MODEL=deepseek/deepseek-v3.2
AGENT_DOCS_MODEL=deepseek/deepseek-v3.2
AGENT_ANALYST_MODEL=deepseek/deepseek-v3.2
AGENT_DEBUGGER_MODEL=deepseek/deepseek-v3.2
```

### Suggested final profiles

- **Cost-aware (recommended personal):** use the default `.env.example` values above.
- **Budget mode:** set all `AGENT_*_MODEL` to `deepseek/deepseek-v3.2`.
- **Quality mode:** keep `coder=qwen3-coder`, `research/designer=claude-sonnet-4.6`.

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

