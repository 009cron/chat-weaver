# Chat Weaver

Frontend chat UI (Vite + React) with a local Node API server that streams OpenRouter responses.

## 1) Setup

```bash
npm install
```

Create `.env` in project root:

```bash
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxx
# optional
OPENROUTER_MODEL=deepseek/deepseek-v3.2
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

The frontend uses `VITE_API_URL` if set, otherwise defaults to `/api`.

## 3) Deploy notes

- Keep `OPENROUTER_API_KEY` only in server environment variables (never commit).
- Deploy frontend and API together (or set `VITE_API_URL` to your deployed API base URL).
- Required API routes implemented in this repo:
  - `GET /api/health`
  - `GET /api/conversations`
  - `GET /api/conversations/:id`
  - `DELETE /api/conversations/:id`
  - `POST /api/chat` (SSE streaming)
