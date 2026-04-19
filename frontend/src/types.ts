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

export interface KnowledgePoint {
  id: string;
  title: string;
  content: string;
  score?: number;
  node_id?: string;  // The session node this KP relates to
}

export interface KnowledgePointNode {
  id: string;
  type: 'knowledgePoint';
  position: { x: number; y: number };
  data: {
    label: string;
    content: string;
    score?: number;
    sourceNodeId?: string;
  };
}

export interface Edge {
  id: string;
  source: string;
  target: string;
}

export interface Graph {
  nodes: Node[];
  edges: Edge[];
  knowledgePoints?: KnowledgePoint[];
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

