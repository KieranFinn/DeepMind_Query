import { KnowledgeRegion, Session, ConversationNode } from './types';

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

export async function setActiveRegion(regionId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/regions/${regionId}/active`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to set active region');
}

// Sessions
export async function getSessions(regionId: string): Promise<Session[]> {
  const res = await fetch(`${API_BASE}/regions/${regionId}/sessions`);
  if (!res.ok) throw new Error('Failed to get sessions');
  return res.json();
}

export async function createSession(regionId: string, title?: string): Promise<Session> {
  const res = await fetch(`${API_BASE}/regions/${regionId}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error('Failed to create session');
  return res.json();
}

export async function getSession(regionId: string, sessionId: string): Promise<Session> {
  const res = await fetch(`${API_BASE}/regions/${regionId}/sessions/${sessionId}`);
  if (!res.ok) throw new Error('Failed to get session');
  return res.json();
}

// Conversation Tree
export async function getSessionTree(regionId: string, sessionId: string): Promise<ConversationNode> {
  const res = await fetch(`${API_BASE}/regions/${regionId}/sessions/${sessionId}/tree`);
  if (!res.ok) throw new Error('Failed to get session tree');
  return res.json();
}

export async function streamMessage(
  regionId: string,
  sessionId: string,
  content: string,
  model: string = 'gpt-4o-mini'
): Promise<Response> {
  return fetch(`${API_BASE}/regions/${regionId}/sessions/${sessionId}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, model }),
  });
}

export async function createBranch(
  regionId: string,
  sessionId: string,
  parentNodeId: string,
  title?: string
): Promise<ConversationNode> {
  const res = await fetch(
    `${API_BASE}/regions/${regionId}/sessions/${sessionId}/branch?parent_node_id=${parentNodeId}&title=${encodeURIComponent(title || '')}`,
    { method: 'POST' }
  );
  if (!res.ok) throw new Error('Failed to create branch');
  return res.json();
}
