export type AgentId = "general" | "coder" | "research" | "designer" | "builder" | "reviewer" | "tester" | "planner" | "docs" | "analyst" | "debugger";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  attachments?: Attachment[];
}

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url?: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  agentId?: AgentId;
}
