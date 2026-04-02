import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { OpenRouter } from "@openrouter/sdk";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data");
const UPLOAD_DIR = path.join(ROOT_DIR, "uploads");
const DB_FILE = path.join(DATA_DIR, "chat-db.json");
const WORKSPACE_DIR = path.resolve(process.env.WORKSPACE_DIR || path.join(ROOT_DIR, "workspace"));

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

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
const OPENROUTER_REFERER = process.env.OPENROUTER_REFERER || "";
const OPENROUTER_TITLE = process.env.OPENROUTER_TITLE || "";
const OPENROUTER_UPSTREAM_STREAM =
  process.env.OPENROUTER_UPSTREAM_STREAM === "true" ||
  (!process.env.VERCEL && process.env.OPENROUTER_UPSTREAM_STREAM !== "false");

function getOpenRouterClient(apiKey) {
  const defaultHeaders = {};
  if (OPENROUTER_REFERER) defaultHeaders["HTTP-Referer"] = OPENROUTER_REFERER;
  if (OPENROUTER_TITLE) defaultHeaders["X-OpenRouter-Title"] = OPENROUTER_TITLE;
  return new OpenRouter({
    apiKey,
    ...(Object.keys(defaultHeaders).length > 0 ? { defaultHeaders } : {}),
  });
}


const AGENTS = {
  general: {
    label: "General",
    model: process.env.AGENT_GENERAL_MODEL || OPENROUTER_MODEL,
    systemPrompt: "You are a helpful general assistant.",
  },
  coder: {
    label: "Coder",
    model: process.env.AGENT_CODER_MODEL || OPENROUTER_MODEL,
    systemPrompt: "You are an expert software engineer. Provide concise, practical coding help.",
  },
  research: {
    label: "Research",
    model: process.env.AGENT_RESEARCH_MODEL || OPENROUTER_MODEL,
    systemPrompt: "You are a meticulous research assistant. Structure findings clearly and mention uncertainty.",
  },
  designer: {
    label: "Designer",
    model: process.env.AGENT_DESIGNER_MODEL || OPENROUTER_MODEL,
    systemPrompt: "You are a product and UI/UX design assistant. Prioritize clarity and user experience.",
  },
  builder: {
    label: "Builder",
    model: process.env.AGENT_BUILDER_MODEL || OPENROUTER_MODEL,
    systemPrompt: "You are a builder focused on execution, implementation plans, and actionable steps.",
  },

  reviewer: {
    label: "Reviewer",
    model: process.env.AGENT_REVIEWER_MODEL || OPENROUTER_MODEL,
    systemPrompt: "You are a senior code reviewer. Find risks, bugs, security issues, and suggest concrete fixes.",
  },
  tester: {
    label: "Tester",
    model: process.env.AGENT_TESTER_MODEL || OPENROUTER_MODEL,
    systemPrompt: "You are a QA/testing expert. Generate test cases, edge cases, and regression checks.",
  },
  planner: {
    label: "Planner",
    model: process.env.AGENT_PLANNER_MODEL || OPENROUTER_MODEL,
    systemPrompt: "You are a product planner. Break goals into milestones, priorities, and execution plans.",
  },
  docs: {
    label: "Docs",
    model: process.env.AGENT_DOCS_MODEL || OPENROUTER_MODEL,
    systemPrompt: "You are a technical writer. Produce clear docs, READMEs, and onboarding instructions.",
  },
  analyst: {
    label: "Analyst",
    model: process.env.AGENT_ANALYST_MODEL || OPENROUTER_MODEL,
    systemPrompt: "You are a data analyst. Summarize data, extract insights, and explain trends clearly.",
  },
  debugger: {
    label: "Debugger",
    model: process.env.AGENT_DEBUGGER_MODEL || OPENROUTER_MODEL,
    systemPrompt: "You are a debugging specialist. Do root-cause analysis and propose minimal, reliable fixes.",
  },
};

function normalizeAgentId(agentId) {
  return AGENTS[agentId] ? agentId : "general";
}

const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".csv",
  ".json",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".py",
  ".html",
  ".css",
  ".xml",
  ".yml",
  ".yaml",
  ".sql",
  ".log",
]);

function chunkText(text, chunkSize = 1500, maxChunks = 6) {
  const chunks = [];
  for (let i = 0; i < text.length && chunks.length < maxChunks; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

function extractFileText(file) {
  const ext = path.extname(file.originalname || "").toLowerCase();
  const mime = (file.mimetype || "").toLowerCase();

  const canReadAsText = mime.startsWith("text/") || TEXT_EXTENSIONS.has(ext);
  if (!canReadAsText) {
    return {
      parseStatus: "unsupported",
      extractedText: null,
      extractedChunks: [],
    };
  }

  try {
    let text = file.buffer.toString("utf8");
    if (ext === ".json") {
      const parsed = JSON.parse(text);
      text = JSON.stringify(parsed, null, 2);
    }

    const normalized = text.replace(/\u0000/g, "").trim();
    if (!normalized) {
      return {
        parseStatus: "empty",
        extractedText: null,
        extractedChunks: [],
      };
    }

    const limited = normalized.slice(0, 24000);
    return {
      parseStatus: "parsed",
      extractedText: limited,
      extractedChunks: chunkText(limited),
    };
  } catch {
    return {
      parseStatus: "failed",
      extractedText: null,
      extractedChunks: [],
    };
  }
}


function safeWorkspacePath(relativePath = "") {
  const normalized = relativePath.replace(/^\/+/, "");
  const fullPath = path.resolve(WORKSPACE_DIR, normalized);
  if (!fullPath.startsWith(WORKSPACE_DIR)) {
    throw new Error("Invalid workspace path");
  }
  return fullPath;
}

function listWorkspaceTree(dir, base = "", depth = 0, maxDepth = 3) {
  if (depth > maxDepth) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const nodes = [];
  for (const entry of entries) {
    const rel = path.posix.join(base, entry.name);
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      nodes.push({ path: rel, type: "dir" });
      nodes.push(...listWorkspaceTree(full, rel, depth + 1, maxDepth));
    } else {
      nodes.push({ path: rel, type: "file" });
    }
  }
  return nodes;
}

function expandFileReferences(message) {
  const refs = [...message.matchAll(/@file:([^\s]+)/g)].map((m) => m[1]);
  if (refs.length === 0) {
    return { enriched: message, references: [] };
  }

  const chunks = [];
  for (const ref of refs.slice(0, 5)) {
    try {
      const full = safeWorkspacePath(ref);
      const stat = fs.statSync(full);
      if (!stat.isFile()) continue;
      const raw = fs.readFileSync(full, "utf8").slice(0, 4000);
      chunks.push(`File: ${ref}\n${raw}`);
    } catch {
      // ignore invalid/unreadable references
    }
  }

  if (chunks.length === 0) {
    return { enriched: message, references: [] };
  }

  return {
    enriched: `${message}\n\nReferenced workspace files:\n\n${chunks.join("\n\n---\n\n")}`,
    references: refs,
  };
}

const TOPIC_SWITCH_HINTS = [
  "new topic",
  "another topic",
  "different topic",
  "switch topic",
  "topik baru",
  "ganti topik",
  "btw",
  "by the way",
  "sekarang",
  "next question",
  "pertanyaan baru",
];

const RESOLVED_HINTS = [
  "resolved",
  "done",
  "fixed",
  "completed",
  "selesai",
  "beres",
  "sudah beres",
  "sudah selesai",
  "clear now",
];

function normalizeText(input = "") {
  return input.toLowerCase().replace(/[^a-z0-9\s]/gi, " ").replace(/\s+/g, " ").trim();
}

function isGoalResolvedMessage(message = "") {
  const text = normalizeText(message);
  return RESOLVED_HINTS.some((hint) => text.includes(hint));
}

function looksLikeTopicSwitch(message = "") {
  const text = normalizeText(message);
  return TOPIC_SWITCH_HINTS.some((hint) => text.includes(hint));
}

function shouldBlockTopicSwitch(conversation, userMessage, forceSwitch) {
  const activeGoal = conversation?.goalTracking?.activeGoal;
  if (!activeGoal) return false;
  if (forceSwitch) return false;
  if (isGoalResolvedMessage(userMessage)) return false;
  return looksLikeTopicSwitch(userMessage);
}

function maybeUpdateGoalTracking(conversation, userMessage, controls) {
  if (!conversation.goalTracking) {
    conversation.goalTracking = {
      activeGoal: "",
      startedAt: new Date().toISOString(),
      resolvedAt: null,
    };
  }

  if (controls.forceResolve) {
    conversation.goalTracking.resolvedAt = new Date().toISOString();
    return;
  }

  if (controls.goalText) {
    conversation.goalTracking.activeGoal = controls.goalText.slice(0, 300);
    conversation.goalTracking.startedAt = new Date().toISOString();
    conversation.goalTracking.resolvedAt = null;
    return;
  }

  if (isGoalResolvedMessage(userMessage)) {
    conversation.goalTracking.resolvedAt = new Date().toISOString();
    return;
  }

  if (!conversation.goalTracking.activeGoal || conversation.goalTracking.resolvedAt) {
    conversation.goalTracking.activeGoal = userMessage.slice(0, 300);
    conversation.goalTracking.startedAt = new Date().toISOString();
    conversation.goalTracking.resolvedAt = null;
  }
}

const SWEEP_CACHE_TTL_MS = 30_000;
let sweepCache = { at: 0, text: "" };

function getCodeSweepContext() {
  if (Date.now() - sweepCache.at < SWEEP_CACHE_TTL_MS) {
    return sweepCache.text;
  }

  const command = `rg -n --hidden --glob '!node_modules' --glob '!.git' --glob '!dist' --glob '!build' --glob '!coverage' "(TODO|FIXME|HACK|BUG|XXX|REFACTOR|@ts-ignore|eslint-disable)" "${WORKSPACE_DIR}"`;
  try {
    const raw = execSync(command, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 512 * 1024,
      timeout: 120,
    });
    const lines = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 20);
    const text = lines.length > 0
      ? `Auto code-improvement sweep findings (file:line:match):\n${lines.join("\n")}`
      : "";
    sweepCache = { at: Date.now(), text };
    return text;
  } catch {
    return "";
  }
}

function parseHumanControls(message = "") {
  const trimmed = message.trim();
  const controls = {
    forceResolve: false,
    forceSwitch: false,
    goalText: "",
    sweepMode: "",
  };

  if (/^\/goal\s+resolve$/i.test(trimmed) || /^\/resolve$/i.test(trimmed)) {
    controls.forceResolve = true;
  }
  if (/^\/goal\s+switch$/i.test(trimmed) || /^\/switch$/i.test(trimmed)) {
    controls.forceSwitch = true;
  }
  const goalMatch = trimmed.match(/^\/goal\s+set:(.+)$/i);
  if (goalMatch?.[1]) {
    controls.goalText = goalMatch[1].trim();
  }
  const sweepMatch = trimmed.match(/^\/sweep\s+(on|off|once)$/i);
  if (sweepMatch?.[1]) {
    controls.sweepMode = sweepMatch[1].toLowerCase();
  }

  return controls;
}

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
      agentId: "general",
      goalTracking: {
        activeGoal: "",
        startedAt: now,
        resolvedAt: null,
      },
      userControls: {
        autoSweep: true,
      },
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
    agentId: conv.agentId || "general",
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, keyCount: OPENROUTER_KEYS.length, model: OPENROUTER_MODEL, upstreamStream: OPENROUTER_UPSTREAM_STREAM, dbFile: DB_FILE, workspaceDir: WORKSPACE_DIR });
});

app.get("/api/agents", (_req, res) => {
  const agents = Object.entries(AGENTS).map(([id, cfg]) => ({ id, label: cfg.label, model: cfg.model }));
  res.json({ agents });
});

app.get("/api/workspace/tree", (_req, res) => {
  try {
    const tree = listWorkspaceTree(WORKSPACE_DIR);
    return res.json({ root: WORKSPACE_DIR, items: tree });
  } catch {
    return res.status(500).json({ error: "Failed to read workspace tree" });
  }
});

app.get("/api/workspace/file", (req, res) => {
  const relPath = String(req.query.path || "");
  if (!relPath) return res.status(400).json({ error: "path is required" });
  try {
    const fullPath = safeWorkspacePath(relPath);
    const content = fs.readFileSync(fullPath, "utf8");
    return res.json({ path: relPath, content });
  } catch {
    return res.status(404).json({ error: "File not found" });
  }
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
    agentId: conv.agentId || "general",
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
      ...extractFileText(file),
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
        ...(OPENROUTER_REFERER ? { "HTTP-Referer": OPENROUTER_REFERER } : {}),
        ...(OPENROUTER_TITLE ? { "X-OpenRouter-Title": OPENROUTER_TITLE } : {}),
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
  const { message, conversationId, attachmentIds = [], agentId = "general" } = req.body || {};

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

  conversation.agentId = normalizeAgentId(agentId || conversation.agentId || "general");
  const agentConfig = AGENTS[conversation.agentId] || AGENTS.general;
  const controls = parseHumanControls(message);
  if (!conversation.userControls) {
    conversation.userControls = { autoSweep: true };
  }
  if (controls.sweepMode === "on") conversation.userControls.autoSweep = true;
  if (controls.sweepMode === "off") conversation.userControls.autoSweep = false;

  maybeUpdateGoalTracking(conversation, message, controls);

  if (shouldBlockTopicSwitch(conversation, message, controls.forceSwitch)) {
    const reminderMessageId = crypto.randomUUID();
    const reminder = `Let's finish your current goal first: "${conversation.goalTracking.activeGoal.slice(0, 180)}". Reply with "/goal resolve" (or "resolved"/"selesai"), or use "/goal switch" to intentionally switch topic.`;
    conversation.messages.push({
      id: reminderMessageId,
      role: "assistant",
      content: reminder,
      createdAt: new Date().toISOString(),
      attachments: [],
    });
    conversation.updatedAt = new Date().toISOString();
    saveDb();

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    res.write(
      `data: ${JSON.stringify({ type: "meta", conversationId: conversation.id, messageId: reminderMessageId })}\n\n`
    );
    res.write(`data: ${JSON.stringify({ type: "delta", text: reminder })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: "done", assistantMessageId: reminderMessageId })}\n\n`);
    res.end();
    return;
  }

  const attachments = Array.isArray(attachmentIds)
    ? attachmentIds.map((id) => store.attachments[id]).filter(Boolean)
    : [];

  const { enriched: enrichedMessage } = expandFileReferences(message);
  const runCodeSweep = (conversation.userControls.autoSweep || controls.sweepMode === "once")
    && (["coder", "reviewer", "debugger", "builder"].includes(conversation.agentId)
    || /\b(code|bug|refactor|fix|typescript|javascript|react|backend|frontend)\b/i.test(message));
  const codeSweepContext = runCodeSweep ? getCodeSweepContext() : "";
  const messageWithContext = codeSweepContext ? `${enrichedMessage}\n\n${codeSweepContext}` : enrichedMessage;

  const userMessageId = crypto.randomUUID();
  conversation.messages.push({
    id: userMessageId,
    role: "user",
    content: messageWithContext,
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

  const history = [
    {
      role: "system",
      content: `${agentConfig.systemPrompt}

Keep the conversation on the active goal until user explicitly marks it resolved with words like "resolved", "done", or "selesai".
Current goal status:
- Active goal: ${conversation.goalTracking?.activeGoal || "none"}
- Resolved at: ${conversation.goalTracking?.resolvedAt || "unresolved"}
If user shifts topics before resolution, remind them to finish/resolve the active goal first.`,
    },
    ...conversation.messages
      .filter((m) => m.id !== assistantMessageId)
      .map((m) => {
      if (m.role !== "user" || !m.attachments || m.attachments.length === 0) {
        return { role: m.role, content: m.content };
      }

      const fileList = m.attachments.map((a) => `${a.originalName} (${a.mimeType})`).join(", ");
      const extracted = m.attachments
        .filter((a) => Array.isArray(a.extractedChunks) && a.extractedChunks.length > 0)
        .map((a) => `File: ${a.originalName}\n${a.extractedChunks.join("\n---\n")}`)
        .join("\n\n");
      return {
        role: "user",
        content: `${m.content}\n\nAttached files: ${fileList}${extracted ? `\n\nParsed file content:\n${extracted}` : ""}`.slice(0, 12000),
      };
    }),
  ];

  try {
    if (!OPENROUTER_UPSTREAM_STREAM) {
      let text = "";
      try {
        const openRouter = getOpenRouterClient(openRouterKey);
        const completion = await openRouter.chat.send({
          model: agentConfig.model,
          messages: history,
          stream: false,
          ...(OPENROUTER_REASONING_ENABLED ? { reasoning: { enabled: true } } : {}),
        });
        text = completion?.choices?.[0]?.message?.content || "";
      } catch {
        // SDK fallback path: keep responses flowing even if SDK request format changes.
        const completionResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openRouterKey}`,
            "Content-Type": "application/json",
            ...(OPENROUTER_REFERER ? { "HTTP-Referer": OPENROUTER_REFERER } : {}),
            ...(OPENROUTER_TITLE ? { "X-OpenRouter-Title": OPENROUTER_TITLE } : {}),
          },
          body: JSON.stringify({
            model: agentConfig.model,
            messages: history,
            ...(OPENROUTER_REASONING_ENABLED ? { reasoning: { enabled: true } } : {}),
          }),
        });
        const payload = await completionResponse.json().catch(() => ({}));
        if (!completionResponse.ok) {
          const errorMessage = payload?.error?.message || payload?.error || "OpenRouter request failed";
          throw new Error(errorMessage);
        }
        text = payload?.choices?.[0]?.message?.content || "";
      }

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
        ...(OPENROUTER_REFERER ? { "HTTP-Referer": OPENROUTER_REFERER } : {}),
        ...(OPENROUTER_TITLE ? { "X-OpenRouter-Title": OPENROUTER_TITLE } : {}),
      },
      body: JSON.stringify({
        model: agentConfig.model,
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
