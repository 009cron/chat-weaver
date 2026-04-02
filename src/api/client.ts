const API_BASE = import.meta.env.VITE_API_URL || "/api";

// ─── Session ID (persisted per browser) ─────────────────────────────────────

export function getSessionId(): string {
  let id = localStorage.getItem("bb-session-id");
  if (!id) {
    id = crypto.randomUUID();
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
  agentId?: string;
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
  agentId?: string;
  onMeta: (data: { conversationId: string; messageId: string }) => void;
  onDelta: (text: string) => void;
  onDone: (assistantMessageId: string) => void;
  onError: (msg: string) => void;
}): Promise<void> {
  const sessionId = getSessionId();
  const controller = new AbortController();
  const timeoutMs = 45_000;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const resetTimeout = () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      controller.abort("stream_timeout");
    }, timeoutMs);
  };

  try {
    resetTimeout();

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
        agentId: params.agentId || "general",
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      params.onError(err.error || "Request failed");
      return;
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let metaMessageId = "";
    let didFinish = false;

    const handleLine = (line: string) => {
      if (!line.startsWith("data: ")) return;
      try {
        const data = JSON.parse(line.slice(6));
        if (data.type === "meta") {
          metaMessageId = data.messageId || metaMessageId;
          params.onMeta(data);
        } else if (data.type === "delta") {
          params.onDelta(data.text);
        } else if (data.type === "done") {
          didFinish = true;
          params.onDone(data.assistantMessageId || metaMessageId);
        } else if (data.type === "error") {
          didFinish = true;
          params.onError(data.message || "Streaming failed");
        }
      } catch {
        // ignore malformed SSE lines
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      resetTimeout();

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        handleLine(line);
      }
    }

    // Process any final buffered line if stream closed without trailing newline.
    if (buffer.trim()) {
      handleLine(buffer.trim());
    }

    // Safety: some hosts/proxies may close stream without explicit done/error event.
    if (!didFinish) {
      params.onDone(metaMessageId);
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      params.onError("Request timeout. Coba kirim ulang ya.");
      return;
    }
    params.onError("Failed to connect to the server.");
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
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
