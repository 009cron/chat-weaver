import { Conversation } from "@/types/chat";
import { Plus, MessageSquare, Trash2, Rabbit, PanelLeftClose } from "lucide-react";

interface ChatSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onClose?: () => void;
}

export function ChatSidebar({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onDelete,
  onClose,
}: ChatSidebarProps) {
  return (
    <div className="w-64 h-full bg-sidebar flex flex-col border-r border-sidebar-border">
      {/* Header */}
      <div className="p-3 flex items-center justify-between border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <Rabbit className="h-5 w-5 text-brand-accent" />
          <span className="font-semibold text-sm text-sidebar-primary">BlackBunny</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onCreate}
            className="p-1.5 rounded-lg text-sidebar-foreground hover:text-sidebar-primary hover:bg-sidebar-accent transition-colors"
            title="New chat"
          >
            <Plus className="h-4 w-4" />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-sidebar-foreground hover:text-sidebar-primary hover:bg-sidebar-accent transition-colors md:hidden"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Conversations */}
      <div className="flex-1 overflow-y-auto chat-scrollbar p-2 space-y-0.5">
        {conversations.length === 0 ? (
          <div className="text-center py-8 text-sidebar-foreground text-xs">
            No conversations yet
          </div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                conv.id === activeId
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              }`}
              onClick={() => onSelect(conv.id)}
            >
              <MessageSquare className="h-4 w-4 flex-shrink-0 opacity-50" />
              <span className="text-sm truncate flex-1">{conv.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(conv.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-all"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
