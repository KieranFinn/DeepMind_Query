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

export interface Session {
  id: string;
  title: string;
  rootNode: ConversationNode;
  created_at: string;
  last_active_at: string;
}

export interface KnowledgeRegion {
  id: string;
  name: string;
  description: string;
  color: string;
  sessions: Session[];
  created_at: string;
  last_active_at: string;
  tags: string[];
}

export interface TreeResponse {
  root: ConversationNode | null;
}

export interface RegionsResponse {
  regions: KnowledgeRegion[];
}

export interface ActiveState {
  regionId: string | null;
  sessionId: string | null;
}
