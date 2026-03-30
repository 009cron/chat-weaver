import { useState } from "react";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatView } from "@/components/chat/ChatView";
import { useChat } from "@/hooks/useChat";
import { PanelLeft } from "lucide-react";

const Index = () => {
  const {
    conversations,
    activeConversation,
    activeConversationId,
    isStreaming,
    backendAvailable,
    setActiveConversationId,
    createConversation,
    deleteConversation,
    sendMessage,
  } = useChat();

  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } fixed md:relative z-20 h-full transition-transform duration-200 ease-in-out md:translate-x-0 ${
          sidebarOpen ? "md:block" : "md:hidden"
        }`}
      >
        <ChatSidebar
          conversations={conversations}
          activeId={activeConversationId}
          onSelect={setActiveConversationId}
          onCreate={createConversation}
          onDelete={deleteConversation}
          onClose={() => setSidebarOpen(false)}
        />
      </div>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-10 bg-background/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center h-12 px-4 border-b border-border">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors mr-2"
            >
              <PanelLeft className="h-5 w-5" />
            </button>
          )}
          <span className="text-sm text-muted-foreground">
            {activeConversation?.title ?? "BlackBunny"}
          </span>
        </div>

        <ChatView
          conversation={activeConversation}
          isStreaming={isStreaming}
          backendAvailable={backendAvailable}
          onSend={sendMessage}
        />
      </div>
    </div>
  );
};

export default Index;
