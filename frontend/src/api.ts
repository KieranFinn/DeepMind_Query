import { KnowledgeRegion, Graph, Node, KnowledgePoint } from './types';

const API_BASE = '/api';

// Regions
export async function getRegions(): Promise<KnowledgeRegion[]> {
  const res = await fetch(`${API_BASE}/regions`);
  if (!res.ok) throw new Error('Failed to get regions');
  return res.json();
}

export async function createRegion(name: string, description?: string, color?: string): Promise<KnowledgeRegion> {
  const res = await fetch(`${API_BASE}/regions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description, color }),
  });
  if (!res.ok) throw new Error('Failed to create region');
  return res.json();
}

export async function deleteRegion(regionId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/regions/${regionId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete region');
}

export async function updateRegion(regionId: string, name: string): Promise<void> {
  const res = await fetch(`${API_BASE}/regions/${regionId}?name=${encodeURIComponent(name)}`, { method: 'PATCH' });
  if (!res.ok) throw new Error('Failed to update region');
}

export async function setActiveRegion(regionId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/regions/${regionId}/active`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to set active region');
}

// Graph / Nodes
export async function getGraph(regionId: string): Promise<Graph> {
  const res = await fetch(`${API_BASE}/regions/${regionId}/graph`);
  if (!res.ok) throw new Error('Failed to get graph');
  return res.json();
}

export async function createNode(regionId: string, title?: string, parentId?: string): Promise<{ node: Node; success: boolean }> {
  const res = await fetch(`${API_BASE}/regions/${regionId}/graph/nodes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, parent_id: parentId }),
  });
  if (!res.ok) throw new Error('Failed to create node');
  return res.json();
}

export async function deleteNode(regionId: string, nodeId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/regions/${regionId}/graph/nodes/${nodeId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete node');
}

export async function updateNode(regionId: string, nodeId: string, title: string): Promise<void> {
  const res = await fetch(`${API_BASE}/regions/${regionId}/graph/nodes/${nodeId}?title=${encodeURIComponent(title)}`, { method: 'PATCH' });
  if (!res.ok) throw new Error('Failed to update node');
}

export async function createChildNode(regionId: string, nodeId: string, title?: string): Promise<{ node: Node; matched_knowledge_points: Array<{ id: string; content: string; reason?: string }> }> {
  const res = await fetch(`${API_BASE}/regions/${regionId}/graph/nodes/${nodeId}/children?title=${encodeURIComponent(title || '')}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to create child node');
  return res.json();
}

// Messages
export async function streamMessage(
  regionId: string,
  nodeId: string,
  content: string,
  model: string = 'MiniMax-M2.7'
): Promise<Response> {
  return fetch(`${API_BASE}/regions/${regionId}/graph/nodes/${nodeId}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, model }),
  });
}

export async function streamAnalyze(
  regionId: string
): Promise<Response> {
  return fetch(`${API_BASE}/regions/${regionId}/analyze`, {
    method: 'POST',
  });
}

export async function getFollowUpSuggestions(
  regionId: string,
  nodeId: string
): Promise<Response> {
  return fetch(`${API_BASE}/regions/${regionId}/graph/nodes/${nodeId}/suggest-branches`, {
    method: 'POST',
  });
}

// Knowledge Points
export async function matchKnowledgePoints(
  regionId: string,
  query: string
): Promise<KnowledgePoint[]> {
  const res = await fetch(`${API_BASE}/regions/${regionId}/knowledge/match?question=${encodeURIComponent(query)}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to match knowledge points');
  const data = await res.json();
  // Backend returns array of {id, content, reason}, transform to KnowledgePoint
  if (Array.isArray(data)) {
    return data.map((item: { id: string; content: string; reason?: string }) => ({
      id: item.id,
      title: item.content.slice(0, 30),
      content: item.content,
      score: 0.8, // Matched KPs get high relevance
      node_id: undefined,
    }));
  }
  return [];
}

export async function getKnowledgePointsForNode(
  regionId: string,
  nodeId: string
): Promise<KnowledgePoint[]> {
  const res = await fetch(`${API_BASE}/regions/${regionId}/graph/nodes/${nodeId}/knowledge`);
  if (!res.ok) throw new Error('Failed to get knowledge points for node');
  return res.json();
}
