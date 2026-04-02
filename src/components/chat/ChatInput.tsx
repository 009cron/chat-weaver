import { useState, useRef, useCallback, useEffect } from "react";
import { Send, Paperclip, Mic, X, Loader2 } from "lucide-react";
import { AgentId, Attachment } from "@/types/chat";
import { uploadFiles, transcribeAudio } from "@/api/client";

interface ChatInputProps {
  onSend: (content: string, attachments?: Attachment[], agentId?: AgentId) => void;
  disabled?: boolean;
  backendAvailable?: boolean | null;
  selectedAgentId?: AgentId;
}

const AGENTS: { id: AgentId; label: string }[] = [
  { id: "general", label: "General" },
  { id: "coder", label: "Coder" },
  { id: "research", label: "Research" },
  { id: "designer", label: "Designer" },
  { id: "builder", label: "Builder" },
  { id: "reviewer", label: "Reviewer" },
  { id: "tester", label: "Tester" },
  { id: "planner", label: "Planner" },
  { id: "docs", label: "Docs" },
  { id: "analyst", label: "Analyst" },
  { id: "debugger", label: "Debugger" },
];

export function ChatInput({ onSend, disabled, backendAvailable, selectedAgentId = "general" }: ChatInputProps) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [agentId, setAgentId] = useState<AgentId>(selectedAgentId);
  const [isUploading, setIsUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed && attachments.length === 0) return;
    onSend(trimmed, attachments.length > 0 ? attachments : undefined, agentId);
    setInput("");
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input, attachments, onSend, agentId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (backendAvailable) {
      // Upload to backend
      setIsUploading(true);
      try {
        const uploaded = await uploadFiles(Array.from(files));
        const newAttachments: Attachment[] = uploaded.map((u) => ({
          id: u.id,
          name: u.originalName,
          type: u.mimeType,
          size: u.size,
          url: u.url,
        }));
        setAttachments((prev) => [...prev, ...newAttachments]);
      } catch (err) {
        console.error("Upload failed:", err);
      } finally {
        setIsUploading(false);
      }
    } else {
      // Local-only attachments (demo mode)
      const newAttachments: Attachment[] = Array.from(files).map((f) => ({
        id: crypto.randomUUID(),
        name: f.name,
        type: f.type,
        size: f.size,
      }));
      setAttachments((prev) => [...prev, ...newAttachments]);
    }
    e.target.value = "";
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const toggleRecording = async () => {
    if (isRecording) {
      // Stop recording
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      // Start recording
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
        mediaRecorderRef.current = mediaRecorder;
        chunksRef.current = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        mediaRecorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });

          if (backendAvailable) {
            try {
              const text = await transcribeAudio(blob);
              if (text) {
                setInput((prev) => (prev ? prev + " " + text : text));
              }
            } catch (err) {
              console.error("Transcription failed:", err);
            }
          }
        };

        mediaRecorder.start();
        setIsRecording(true);
      } catch (err) {
        console.error("Microphone access denied:", err);
      }
    }
  };

  useEffect(() => {
    setAgentId(selectedAgentId);
  }, [selectedAgentId]);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  };

  return (
    <div className="px-4 pb-4 pt-2">
      <div className="max-w-3xl mx-auto">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2 px-1">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="flex items-center gap-1.5 bg-secondary pl-2.5 pr-1 py-1 rounded-lg text-xs text-muted-foreground"
              >
                <Paperclip className="h-3 w-3" />
                <span className="truncate max-w-[120px]">{att.name}</span>
                <button
                  onClick={() => removeAttachment(att.id)}
                  className="p-0.5 rounded hover:bg-accent transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 bg-chat-input rounded-2xl border border-border px-3 py-2 focus-within:border-muted-foreground/50 transition-colors">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex-shrink-0 disabled:opacity-50"
            title="Attach file"
          >
            {isUploading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Paperclip className="h-5 w-5" />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
            accept="*/*"
          />

          <select
            value={agentId}
            onChange={(e) => setAgentId(e.target.value as AgentId)}
            className="bg-transparent text-xs text-muted-foreground border border-border rounded-md px-2 py-1 h-9"
            title="Select agent"
          >
            {AGENTS.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.label}
              </option>
            ))}
          </select>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Message BlackBunny..."
            rows={1}
            disabled={disabled}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none py-2 max-h-40"
          />

          <button
            onClick={toggleRecording}
            className={`p-2 rounded-lg flex-shrink-0 transition-colors ${
              isRecording
                ? "text-destructive bg-destructive/10"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
            title="Voice input"
          >
            <Mic className="h-5 w-5" />
          </button>

          <button
            onClick={handleSubmit}
            disabled={disabled || (!input.trim() && attachments.length === 0)}
            className="p-2 rounded-lg bg-foreground text-background disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 transition-opacity flex-shrink-0"
            title="Send message"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
