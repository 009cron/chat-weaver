import { useState, useRef, useCallback } from "react";
import { Send, Paperclip, Mic, X } from "lucide-react";
import { Attachment } from "@/types/chat";

interface ChatInputProps {
  onSend: (content: string, attachments?: Attachment[]) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed && attachments.length === 0) return;
    onSend(trimmed, attachments.length > 0 ? attachments : undefined);
    setInput("");
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input, attachments, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newAttachments: Attachment[] = Array.from(files).map((f) => ({
      id: Math.random().toString(36).substring(2),
      name: f.name,
      type: f.type,
      size: f.size,
    }));
    setAttachments((prev) => [...prev, ...newAttachments]);
    e.target.value = "";
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const toggleRecording = () => {
    setIsRecording((prev) => !prev);
    // Voice recording would be implemented with Web Audio API + Whisper
  };

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
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex-shrink-0"
            title="Attach file"
          >
            <Paperclip className="h-5 w-5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
            accept="image/*,.pdf,.txt,.md,.csv,.json,.py,.js,.ts,.tsx,.jsx"
          />

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
