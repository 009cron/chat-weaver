import { v4 as uuidv4 } from "uuid";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

// ─── Session ID (persisted per browser) ─────────────────────────────────────

export function getSessionId(): string {
  let id = localStorage.getItem("bb-session-id");
  if (!id) {
    id = uuidv4();
    localStorage.setItem("bb-session-id", id);
  }
  return id;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ApiAttachment {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  isImage: boolean;
}

export interface ApiMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  attachments?: ApiAttachment[];
  isStreaming?: boolean;
  isError?: boolean;
}

export interface ApiConversation {
  id: string;
  title: string;
  messageCount: number;
  lastMessage: { content: string; role: string; createdAt: string } | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Chat (SSE streaming) ───────────────────────────────────────────────────

export async function streamChat(params: {
  message: string;
  conversationId?: string;
  attachmentIds?: string[];
  onMeta: (data: { conversationId: string; messageId: string }) => void;
  onDelta: (text: string) => void;
  onDone: (assistantMessageId: string) => void;
  onError: (msg: string) => void;
}): Promise<void> {
  const sessionId = getSessionId();

  const response = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-ID": sessionId,
    },
    body: JSON.stringify({
      message: params.message,
      conversationId: params.conversationId,
      sessionId,
      attachmentIds: params.attachmentIds || [],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    params.onError(err.error || "Request failed");
    return;
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop()!;

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const data = JSON.parse(line.slice(6));
        if (data.type === "meta") params.onMeta(data);
        else if (data.type === "delta") params.onDelta(data.text);
        else if (data.type === "done") params.onDone(data.assistantMessageId);
        else if (data.type === "error") params.onError(data.message);
      } catch {
        // ignore malformed SSE lines
      }
    }
  }
}

// ─── Voice transcription ────────────────────────────────────────────────────

export async function transcribeAudio(blob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append("audio", blob, "recording.webm");

  const res = await fetch(`${API_BASE}/voice/transcribe`, {
    method: "POST",
    headers: { "X-Session-ID": getSessionId() },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Transcription failed");
  }

  const data = await res.json();
  return data.text;
}

// ─── File upload ────────────────────────────────────────────────────────────

export async function uploadFiles(files: File[]): Promise<ApiAttachment[]> {
  const formData = new FormData();
  files.forEach((f) => formData.append("files", f));

  const res = await fetch(`${API_BASE}/upload`, {
    method: "POST",
    headers: { "X-Session-ID": getSessionId() },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Upload failed");
  }

  const data = await res.json();
  return data.attachments;
}

// ─── Conversations ──────────────────────────────────────────────────────────

export async function listConversations(): Promise<ApiConversation[]> {
  const res = await fetch(`${API_BASE}/conversations`, {
    headers: { "X-Session-ID": getSessionId() },
  });
  if (!res.ok) throw new Error("Failed to load conversations");
  const data = await res.json();
  return data.conversations;
}

export async function getConversation(id: string) {
  const res = await fetch(`${API_BASE}/conversations/${id}`, {
    headers: { "X-Session-ID": getSessionId() },
  });
  if (!res.ok) throw new Error("Failed to load conversation");
  return res.json();
}

export async function deleteConversation(id: string): Promise<void> {
  await fetch(`${API_BASE}/conversations/${id}`, {
    method: "DELETE",
    headers: { "X-Session-ID": getSessionId() },
  });
}

// ─── Health ─────────────────────────────────────────────────────────────────

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
