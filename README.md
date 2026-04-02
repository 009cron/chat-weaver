# Chat Weaver

Frontend chat UI (Vite + React) with a local Node API server that streams OpenRouter responses.

## 1) Setup

```bash
npm install
```

Create `.env` in project root:

```bash
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxx
# optional: multiple keys (comma or newline separated)
# OPENROUTER_API_KEYS=sk-or-v1-key1,sk-or-v1-key2
OPENROUTER_MODEL=deepseek/deepseek-v3.2
OPENROUTER_STT_MODEL=openai/whisper-1
PORT=3001
OPENROUTER_REASONING_ENABLED=false
```

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
- Deploy frontend and API together (or set `VITE_API_URL` to your deployed API base URL).
- Required API routes implemented in this repo:
  - `GET /api/health`
  - `GET /api/conversations`
  - `GET /api/conversations/:id`
  - `DELETE /api/conversations/:id`
  - `POST /api/chat` (SSE streaming)
  - `POST /api/upload` (multipart file upload)
  - `POST /api/voice/transcribe` (audio-to-text via OpenRouter)
