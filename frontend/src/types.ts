export interface Message {
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface Node {
  id: string;
  title: string;
  messages: Message[];
  parent_id: string | null;
  created_at: string;
  last_active_at: string;
}

export interface Edge {
  id: string;
  source: string;
  target: string;
}

export interface Graph {
  nodes: Node[];
  edges: Edge[];
}

export interface KnowledgeRegion {
  id: string;
  name: string;
  description: string;
  color: string;
  graph: Graph;
  created_at: string;
  last_active_at: string;
  tags: string[];
}

export interface RegionsResponse {
  regions: KnowledgeRegion[];
}

export interface ActiveState {
  regionId: string | null;
  nodeId: string | null;
}
