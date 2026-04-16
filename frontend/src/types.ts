export interface Message {
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface ConversationNode {
  id: string;
  parent_id: string | null;
  title: string;
  messages: Message[];
  children: ConversationNode[];
  created_at: string;
}

export interface TreeResponse {
  root: ConversationNode | null;
}
