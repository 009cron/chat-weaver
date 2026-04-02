import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data");
const UPLOAD_DIR = path.join(ROOT_DIR, "uploads");
const DB_FILE = path.join(DATA_DIR, "chat-db.json");

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 10 },
});

const PORT = Number(process.env.PORT || 3001);
const OPENROUTER_KEYS_RAW = process.env.OPENROUTER_API_KEYS || process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_KEYS = OPENROUTER_KEYS_RAW
  .split(/[\n,]/)
  .map((k) => k.trim())
  .filter(Boolean);
let openRouterKeyIndex = 0;

function getOpenRouterKey() {
  if (OPENROUTER_KEYS.length === 0) return null;
  const key = OPENROUTER_KEYS[openRouterKeyIndex % OPENROUTER_KEYS.length];
  openRouterKeyIndex += 1;
  return key;
}

const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "deepseek/deepseek-v3.2";
const OPENROUTER_REASONING_ENABLED = process.env.OPENROUTER_REASONING_ENABLED === "true";
const OPENROUTER_STT_MODEL = process.env.OPENROUTER_STT_MODEL || "openai/whisper-1";
const OPENROUTER_UPSTREAM_STREAM =
  process.env.OPENROUTER_UPSTREAM_STREAM === "true" ||
  (!process.env.VERCEL && process.env.OPENROUTER_UPSTREAM_STREAM !== "false");

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(UPLOAD_DIR));

function loadDb() {
  if (!fs.existsSync(DB_FILE)) {
    return { sessions: {} };
  }

  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return { sessions: parsed.sessions || {} };
  } catch {
    return { sessions: {} };
  }
}

function saveDb() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

const db = loadDb();

function getSessionStore(sessionId) {
  const key = sessionId || "default";
  if (!db.sessions[key]) {
    db.sessions[key] = {
      conversations: {},
      attachments: {},
    };
    saveDb();
  }
  return db.sessions[key];
}

function getConversation(store, conversationId) {
  if (!conversationId || !store.conversations[conversationId]) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const conv = {
      id,
      title: "New chat",
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    store.conversations[id] = conv;
    saveDb();
    return conv;
  }
  return store.conversations[conversationId];
}

function toConversationSummary(conv) {
  const lastMessage = conv.messages[conv.messages.length - 1] || null;
  return {
    id: conv.id,
    title: conv.title,
    messageCount: conv.messages.length,
    lastMessage: lastMessage
      ? {
          content: lastMessage.content,
          role: lastMessage.role,
          createdAt: lastMessage.createdAt,
        }
      : null,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, keyCount: OPENROUTER_KEYS.length, model: OPENROUTER_MODEL, upstreamStream: OPENROUTER_UPSTREAM_STREAM, dbFile: DB_FILE });
});

app.get("/api/conversations", (req, res) => {
  const store = getSessionStore(req.header("X-Session-ID"));
  const conversations = Object.values(store.conversations)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .map(toConversationSummary);

  res.json({ conversations });
});

app.get("/api/conversations/:id", (req, res) => {
  const store = getSessionStore(req.header("X-Session-ID"));
  const conv = store.conversations[req.params.id];
  if (!conv) {
    return res.status(404).json({ error: "Conversation not found" });
  }
  return res.json({
    id: conv.id,
    title: conv.title,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
    messages: conv.messages,
  });
});

app.delete("/api/conversations/:id", (req, res) => {
  const store = getSessionStore(req.header("X-Session-ID"));
  delete store.conversations[req.params.id];
  saveDb();
  res.status(204).send();
});

app.post("/api/upload", upload.array("files"), (req, res) => {
  const files = req.files || [];
  if (!Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: "No files uploaded" });
  }

  const store = getSessionStore(req.header("X-Session-ID"));
  const attachments = files.map((file) => {
    const id = crypto.randomUUID();
    const safeOriginalName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const diskName = `${id}-${safeOriginalName}`;
    const diskPath = path.join(UPLOAD_DIR, diskName);

    fs.writeFileSync(diskPath, file.buffer);

    const attachment = {
      id,
      filename: diskName,
      originalName: file.originalname,
      mimeType: file.mimetype || "application/octet-stream",
      size: file.size,
      url: `/uploads/${diskName}`,
      isImage: (file.mimetype || "").startsWith("image/"),
      createdAt: new Date().toISOString(),
    };

    store.attachments[id] = attachment;
    return attachment;
  });

  saveDb();
  return res.json({ attachments });
});

app.post("/api/voice/transcribe", upload.single("audio"), async (req, res) => {
  const openRouterKey = getOpenRouterKey();
  if (!openRouterKey) {
    return res.status(500).json({
      error: "Missing OPENROUTER_API_KEY (or OPENROUTER_API_KEYS) on server. On Vercel, set one OpenRouter key that can access your models.",
    });
  }

  if (!req.file) {
    return res.status(400).json({ error: "audio file is required" });
  }

  try {
    const form = new FormData();
    form.append("model", OPENROUTER_STT_MODEL);
    form.append(
      "file",
      new Blob([req.file.buffer], { type: req.file.mimetype || "audio/webm" }),
      req.file.originalname || "recording.webm"
    );

    const sttResponse = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openRouterKey}`,
      },
      body: form,
    });

    const payload = await sttResponse.json().catch(() => ({}));
    if (!sttResponse.ok) {
      const errorMessage = payload?.error?.message || payload?.error || "Transcription failed";
      return res.status(sttResponse.status).json({ error: errorMessage });
    }

    const text = payload.text || "";
    return res.json({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transcription request failed";
    return res.status(500).json({ error: message });
  }
});

app.post("/api/chat", async (req, res) => {
  const sessionId = req.header("X-Session-ID") || req.body.sessionId;
  const { message, conversationId, attachmentIds = [] } = req.body || {};

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "message is required" });
  }

  const openRouterKey = getOpenRouterKey();
  if (!openRouterKey) {
    return res.status(500).json({
      error: "Missing OPENROUTER_API_KEY (or OPENROUTER_API_KEYS) on server. On Vercel, set one OpenRouter key that can access your models.",
    });
  }

  const store = getSessionStore(sessionId);
  const conversation = getConversation(store, conversationId);

  if (conversation.messages.length === 0) {
    conversation.title = message.slice(0, 40);
  }

  const attachments = Array.isArray(attachmentIds)
    ? attachmentIds.map((id) => store.attachments[id]).filter(Boolean)
    : [];

  const userMessageId = crypto.randomUUID();
  conversation.messages.push({
    id: userMessageId,
    role: "user",
    content: message,
    createdAt: new Date().toISOString(),
    attachments,
  });

  const assistantMessageId = crypto.randomUUID();
  const assistantMessage = {
    id: assistantMessageId,
    role: "assistant",
    content: "",
    createdAt: new Date().toISOString(),
    attachments: [],
  };

  conversation.messages.push(assistantMessage);
  conversation.updatedAt = new Date().toISOString();
  saveDb();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  res.write(
    `data: ${JSON.stringify({ type: "meta", conversationId: conversation.id, messageId: assistantMessageId })}\n\n`
  );

  const history = conversation.messages
    .filter((m) => m.id !== assistantMessageId)
    .map((m) => {
      if (m.role !== "user" || !m.attachments || m.attachments.length === 0) {
        return { role: m.role, content: m.content };
      }

      const fileList = m.attachments.map((a) => `${a.originalName} (${a.mimeType})`).join(", ");
      return {
        role: "user",
        content: `${m.content}\n\nAttached files: ${fileList}`,
      };
    });

  try {
    if (!OPENROUTER_UPSTREAM_STREAM) {
      const completionResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openRouterKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          messages: history,
          ...(OPENROUTER_REASONING_ENABLED ? { reasoning: { enabled: true } } : {}),
        }),
      });

      const payload = await completionResponse.json().catch(() => ({}));
      if (!completionResponse.ok) {
        const errorMessage = payload?.error?.message || payload?.error || "OpenRouter request failed";
        throw new Error(errorMessage);
      }

      const text = payload?.choices?.[0]?.message?.content || "";
      assistantMessage.content = text;
      conversation.updatedAt = new Date().toISOString();
      saveDb();

      if (text) {
        res.write(`data: ${JSON.stringify({ type: "delta", text })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ type: "done", assistantMessageId })}\n\n`);
      res.end();
      return;
    }

    const orResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openRouterKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: history,
        stream: true,
        ...(OPENROUTER_REASONING_ENABLED ? { reasoning: { enabled: true } } : {}),
      }),
    });

    if (!orResponse.ok || !orResponse.body) {
      const errorText = await orResponse.text();
      throw new Error(errorText || `OpenRouter HTTP ${orResponse.status}`);
    }

    const reader = orResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) continue;

        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;

        const parsed = JSON.parse(payload);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          assistantMessage.content += delta;
          res.write(`data: ${JSON.stringify({ type: "delta", text: delta })}\n\n`);
        }
      }
    }

    conversation.updatedAt = new Date().toISOString();
    saveDb();
    res.write(`data: ${JSON.stringify({ type: "done", assistantMessageId })}\n\n`);
    res.end();
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Unknown server error";
    res.write(`data: ${JSON.stringify({ type: "error", message: messageText })}\n\n`);
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
