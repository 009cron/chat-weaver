import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3001);
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "moonshotai/kimi-k2.5";

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const sessions = new Map();

function getSessionStore(sessionId) {
  const key = sessionId || "default";
  if (!sessions.has(key)) {
    sessions.set(key, {
      conversations: new Map(),
    });
  }
  return sessions.get(key);
}

function getConversation(store, conversationId) {
  if (!conversationId || !store.conversations.has(conversationId)) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const conv = {
      id,
      title: "New chat",
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    store.conversations.set(id, conv);
    return conv;
  }
  return store.conversations.get(conversationId);
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
  res.json({ ok: true, hasApiKey: Boolean(OPENROUTER_API_KEY) });
});

app.get("/api/conversations", (req, res) => {
  const store = getSessionStore(req.header("X-Session-ID"));
  const conversations = Array.from(store.conversations.values())
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .map(toConversationSummary);

  res.json({ conversations });
});

app.get("/api/conversations/:id", (req, res) => {
  const store = getSessionStore(req.header("X-Session-ID"));
  const conv = store.conversations.get(req.params.id);
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
  store.conversations.delete(req.params.id);
  res.status(204).send();
});

app.post("/api/upload", (_req, res) => {
  res.status(501).json({ error: "Upload endpoint is not configured yet." });
});

app.post("/api/voice/transcribe", (_req, res) => {
  res.status(501).json({ error: "Voice transcription endpoint is not configured yet." });
});

app.post("/api/chat", async (req, res) => {
  const sessionId = req.header("X-Session-ID") || req.body.sessionId;
  const { message, conversationId } = req.body || {};

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "message is required" });
  }

  if (!OPENROUTER_API_KEY) {
    return res.status(500).json({ error: "OPENROUTER_API_KEY is missing on server" });
  }

  const store = getSessionStore(sessionId);
  const conversation = getConversation(store, conversationId);

  if (conversation.messages.length === 0) {
    conversation.title = message.slice(0, 40);
  }

  const userMessageId = crypto.randomUUID();
  conversation.messages.push({
    id: userMessageId,
    role: "user",
    content: message,
    createdAt: new Date().toISOString(),
    attachments: [],
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

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  res.write(
    `data: ${JSON.stringify({ type: "meta", conversationId: conversation.id, messageId: assistantMessageId })}\n\n`
  );

  const history = conversation.messages
    .filter((m) => m.id !== assistantMessageId)
    .map((m) => ({ role: m.role, content: m.content }));

  try {
    const orResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: history,
        stream: true,
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
