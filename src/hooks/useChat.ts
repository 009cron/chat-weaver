import { useState, useCallback, useEffect, useRef } from "react";
import { Message, Conversation, Attachment, AgentId } from "@/types/chat";
import * as api from "@/api/client";

const generateId = () => crypto.randomUUID();

const DEMO_RESPONSE =
  "I'm BlackBunny, your AI assistant. I'm currently running in demo mode — connect your backend API to get real AI responses. Feel free to explore the interface!";

export function useChat() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [backendAvailable, setBackendAvailable] = useState<boolean | null>(null);
  const checkedRef = useRef(false);

  const activeConversation = conversations.find((c) => c.id === activeConversationId) ?? null;

  // Check backend health on mount
  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;
    api.healthCheck().then((ok) => {
      setBackendAvailable(ok);
      if (ok) {
        // Load existing conversations from backend
        api.listConversations().then((convs) => {
          setConversations(
            convs.map((c) => ({
              id: c.id,
              title: c.title,
              messages: [],
              createdAt: new Date(c.createdAt),
              updatedAt: new Date(c.updatedAt),
              agentId: (c as any).agentId || "general",
            }))
          );
        }).catch(() => {});
      }
    });
  }, []);

  const createConversation = useCallback((agentId: AgentId = "general") => {
    const conv: Conversation = {
      id: generateId(),
      title: "New chat",
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      agentId,
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
      if (backendAvailable) {
        api.deleteConversation(id).catch(() => {});
      }
    },
    [activeConversationId, backendAvailable]
  );

  const loadConversation = useCallback(
    async (id: string) => {
      setActiveConversationId(id);
      if (!backendAvailable) return;

      // Check if messages already loaded
      const conv = conversations.find((c) => c.id === id);
      if (conv && conv.messages.length > 0) return;

      try {
        const data = await api.getConversation(id);
        setConversations((prev) =>
          prev.map((c) =>
            c.id === id
              ? {
                  ...c,
                  agentId: data.agentId || c.agentId || "general",
                  messages: (data.messages || []).map((m: any) => ({
                    id: m.id,
                    role: m.role,
                    content: m.content,
                    timestamp: new Date(m.createdAt),
                    attachments: m.attachments?.map((a: any) => ({
                      id: a.id,
                      name: a.originalName,
                      type: a.mimeType,
                      size: a.size,
                      url: a.url,
                    })),
                  })),
                }
              : c
          )
        );
      } catch {
        // silently fail, local state still works
      }
    },
    [backendAvailable, conversations]
  );

  const sendMessageDemo = useCallback(
    async (content: string, convId: string, attachments?: Attachment[], agentId: AgentId = "general") => {
      const userMsg: Message = {
        id: generateId(),
        role: "user",
        content,
        timestamp: new Date(),
        attachments,
      };

      const assistantId = generateId();
      const assistantMsg: Message = {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
      };

      // Add both messages at once to avoid race conditions
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId
            ? {
                ...c,
                title: c.messages.length === 0 ? content.slice(0, 40) : c.title,
                messages: [...c.messages, userMsg, assistantMsg],
                updatedAt: new Date(),
                agentId,
              }
            : c
        )
      );

      setIsStreaming(true);

      // Small delay to let React commit the state
      await new Promise((r) => setTimeout(r, 50));

      for (let i = 0; i < DEMO_RESPONSE.length; i++) {
        await new Promise((r) => setTimeout(r, 15));
        const partial = DEMO_RESPONSE.slice(0, i + 1);
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
    []
  );

  const sendMessageApi = useCallback(
    async (content: string, convId: string, attachments?: Attachment[], agentId: AgentId = "general") => {
      const userMsg: Message = {
        id: generateId(),
        role: "user",
        content,
        timestamp: new Date(),
        attachments,
      };

      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId
            ? {
                ...c,
                title: c.messages.length === 0 ? content.slice(0, 40) : c.title,
                messages: [...c.messages, userMsg],
                updatedAt: new Date(),
                agentId,
              }
            : c
        )
      );

      setIsStreaming(true);

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

      const attachmentIds = attachments
        ?.filter((a) => a.id)
        .map((a) => a.id) || [];

      try {
        await api.streamChat({
          message: content,
          conversationId: convId,
          attachmentIds,
          agentId,
          onMeta: (data) => {
            // Update conversation ID if backend assigned a new one
            if (data.conversationId !== convId) {
              setConversations((prev) =>
                prev.map((c) => (c.id === convId ? { ...c, id: data.conversationId } : c))
              );
              setActiveConversationId(data.conversationId);
            }
          },
          onDelta: (text) => {
            setConversations((prev) =>
              prev.map((c) => ({
                ...c,
                messages: c.messages.map((m) =>
                  m.id === assistantId ? { ...m, content: m.content + text } : m
                ),
              }))
            );
          },
          onDone: () => {
            setIsStreaming(false);
          },
          onError: (msg) => {
            setConversations((prev) =>
              prev.map((c) => ({
                ...c,
                messages: c.messages.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: `⚠️ ${msg}` }
                    : m
                ),
              }))
            );
            setIsStreaming(false);
          },
        });
      } catch {
        setConversations((prev) =>
          prev.map((c) => ({
            ...c,
            messages: c.messages.map((m) =>
              m.id === assistantId
                ? { ...m, content: "⚠️ Failed to connect to the server." }
                : m
            ),
          }))
        );
        setIsStreaming(false);
      }
    },
    []
  );

  const sendMessage = useCallback(
    async (content: string, attachments?: Attachment[], agentId: AgentId = "general") => {
      let convId = activeConversationId;
      if (!convId) {
        convId = createConversation(agentId);
      }

      if (backendAvailable) {
        await sendMessageApi(content, convId, attachments, agentId);
      } else {
        await sendMessageDemo(content, convId, attachments, agentId);
      }
    },
    [activeConversationId, createConversation, backendAvailable, sendMessageApi, sendMessageDemo]
  );

  return {
    conversations,
    activeConversation,
    activeConversationId,
    isStreaming,
    backendAvailable,
    setActiveConversationId: loadConversation,
    createConversation,
    deleteConversation,
    sendMessage,
  };
}
