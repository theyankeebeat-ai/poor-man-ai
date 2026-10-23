export type Role = "user" | "assistant" | "tool";

export type AgentEvent =
  | { type: "status"; text: string }
  | { type: "plan"; text: string }
  | { type: "tool"; name: string; args: Record<string, unknown> }
  | { type: "observation"; name: string; text: string }
  | { type: "token"; text: string }
  | { type: "done"; text: string }
  | { type: "error"; text: string };

export type UploadedAttachment = {
  filename: string;
  url: string;
  size: number;
  isImage: boolean;
  preview?: string;
};

export type ChatMessage = {
  id: string;
  role: Role;
  text: string;
  turnId?: string;
  plan?: string;
  toolName?: string;
  observation?: string;
  imageUrls?: string[];
  queuedJson?: string;
  attachments?: UploadedAttachment[];
};

export type Conversation = {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
};

export type MemoryFact = {
  ts: string;
  fact: string;
  source_url?: string | null;
};

export type ThemeId = "dark" | "light" | "midnight" | "aurora" | "beige";
