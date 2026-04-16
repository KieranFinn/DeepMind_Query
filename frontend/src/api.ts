import { ConversationNode, TreeResponse } from './types';

const API_BASE = '/api';

export async function createConversation(title?: string): Promise<ConversationNode> {
  const res = await fetch(`${API_BASE}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error('Failed to create conversation');
  return res.json();
}

export async function getTree(): Promise<TreeResponse> {
  const res = await fetch(`${API_BASE}/conversations`);
  if (!res.ok) throw new Error('Failed to get tree');
  return res.json();
}

export async function getConversation(nodeId: string): Promise<ConversationNode> {
  const res = await fetch(`${API_BASE}/conversations/${nodeId}`);
  if (!res.ok) throw new Error('Failed to get conversation');
  return res.json();
}

export async function sendMessage(nodeId: string, content: string, model = 'gpt-4o-mini'): Promise<EventSource> {
  const url = new URL(`${API_BASE}/conversations/${nodeId}/message`, window.location.origin);
  url.searchParams.set('content', content);
  url.searchParams.set('model', model);
  return new EventSource(url.toString().replace('http://', 'http://').replace('https://', 'https://'));
}

export async function createBranch(nodeId: string, title?: string): Promise<ConversationNode> {
  const res = await fetch(`${API_BASE}/conversations/${nodeId}/branch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error('Failed to create branch');
  return res.json();
}

export async function streamMessage(nodeId: string, content: string, model = 'gpt-4o-mini'): Promise<Response> {
  return fetch(`${API_BASE}/conversations/${nodeId}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, model }),
  });
}
