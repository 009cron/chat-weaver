import { useRef, useEffect } from "react";
import { AgentId, Conversation } from "@/types/chat";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import { Rabbit } from "lucide-react";
import { Attachment } from "@/types/chat";

interface ChatViewProps {
  conversation: Conversation | null;
  isStreaming: boolean;
  backendAvailable?: boolean | null;
  onSend: (content: string, attachments?: Attachment[], agentId?: AgentId) => void;
}

function EmptyState({ onSend }: { onSend: (msg: string) => void }) {
  const suggestions = [
    "Explain quantum computing in simple terms",
    "Write a Python script to sort a list",
    "What are the best practices for React?",
    "Help me debug my code",
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-brand-accent-subtle flex items-center justify-center mb-6">
        <Rabbit className="h-8 w-8 text-brand-accent" />
      </div>
      <h1 className="text-2xl font-semibold text-foreground mb-2">BlackBunny</h1>
      <p className="text-muted-foreground text-sm mb-8">Your personal AI assistant</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg w-full">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onSend(s)}
            className="text-left px-4 py-3 rounded-xl bg-secondary hover:bg-accent text-sm text-foreground transition-colors border border-border"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ChatView({ conversation, isStreaming, backendAvailable, onSend }: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation?.messages]);

  const hasMessages = conversation && conversation.messages.length > 0;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {hasMessages ? (
        <div ref={scrollRef} className="flex-1 overflow-y-auto chat-scrollbar px-4 py-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {conversation.messages.map((msg, i) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isStreaming={
                  isStreaming &&
                  i === conversation.messages.length - 1 &&
                  msg.role === "assistant"
                }
              />
            ))}
          </div>
        </div>
      ) : (
        <EmptyState onSend={(msg) => onSend(msg)} />
      )}

      <ChatInput onSend={onSend} disabled={isStreaming} backendAvailable={backendAvailable} selectedAgentId={conversation?.agentId ?? "general"} />
    </div>
  );
}
