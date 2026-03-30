import { Message } from "@/types/chat";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { Rabbit, User, Paperclip } from "lucide-react";

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 animate-fade-in ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-accent-subtle flex items-center justify-center mt-1">
          <Rabbit className="h-4 w-4 text-brand-accent" />
        </div>
      )}

      <div className={`max-w-[75%] ${isUser ? "order-first" : ""}`}>
        <div
          className={`px-4 py-3 rounded-2xl ${
            isUser
              ? "bg-user-bubble rounded-br-md"
              : "bg-assistant-bubble rounded-bl-md"
          }`}
        >
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {message.attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center gap-1.5 bg-secondary px-2.5 py-1 rounded-md text-xs text-muted-foreground"
                >
                  <Paperclip className="h-3 w-3" />
                  <span className="truncate max-w-[120px]">{att.name}</span>
                </div>
              ))}
            </div>
          )}

          {isUser ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="text-sm">
              <MarkdownRenderer content={message.content} />
              {isStreaming && message.content.length === 0 && (
                <div className="flex gap-1 py-1">
                  <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-pulse-dot" />
                  <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-pulse-dot-delay-1" />
                  <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-pulse-dot-delay-2" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center mt-1">
          <User className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
