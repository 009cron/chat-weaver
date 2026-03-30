import { useState, useCallback } from "react";
import { Message, Conversation } from "@/types/chat";

const generateId = () => Math.random().toString(36).substring(2, 15);

export function useChat() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  const activeConversation = conversations.find((c) => c.id === activeConversationId) ?? null;

  const createConversation = useCallback(() => {
    const conv: Conversation = {
      id: generateId(),
      title: "New chat",
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setConversations((prev) => [conv, ...prev]);
    setActiveConversationId(conv.id);
    return conv.id;
  }, []);

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) {
        setActiveConversationId(null);
      }
    },
    [activeConversationId]
  );

  const sendMessage = useCallback(
    async (content: string, attachments?: Message["attachments"]) => {
      let convId = activeConversationId;
      if (!convId) {
        convId = createConversation();
      }

      const userMsg: Message = {
        id: generateId(),
        role: "user",
        content,
        timestamp: new Date(),
        attachments,
      };

      // Update title from first message
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId
            ? {
                ...c,
                title: c.messages.length === 0 ? content.slice(0, 40) : c.title,
                messages: [...c.messages, userMsg],
                updatedAt: new Date(),
              }
            : c
        )
      );

      setIsStreaming(true);

      // Create assistant message placeholder
      const assistantId = generateId();
      const assistantMsg: Message = {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
      };

      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId
            ? { ...c, messages: [...c.messages, assistantMsg], updatedAt: new Date() }
            : c
        )
      );

      // Simulate streaming for now (will be replaced with real AI)
      const response = "I'm BlackBunny, your AI assistant. I'm currently running in demo mode — once Lovable Cloud is connected, I'll be powered by real AI. Feel free to explore the interface!";
      
      for (let i = 0; i < response.length; i++) {
        await new Promise((r) => setTimeout(r, 15));
        const partial = response.slice(0, i + 1);
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === assistantId ? { ...m, content: partial } : m
                  ),
                }
              : c
          )
        );
      }

      setIsStreaming(false);
    },
    [activeConversationId, createConversation]
  );

  return {
    conversations,
    activeConversation,
    activeConversationId,
    isStreaming,
    setActiveConversationId,
    createConversation,
    deleteConversation,
    sendMessage,
  };
}
