import { create } from 'zustand';
import { ConversationNode } from './types';
import { getTree, createConversation, createBranch, streamMessage } from './api';

const MODELS = [
  { id: 'abab6.5s-chat', name: 'MiniMax abab6.5s' },
  { id: 'abab6-chat', name: 'MiniMax abab6' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
  { id: 'gpt-4o', name: 'GPT-4o' },
];

interface ConversationStore {
  tree: ConversationNode | null;
  activeNodeId: string | null;
  streamingMessage: string;
  isLoading: boolean;
  error: string | null;
  selectedModel: string;

  // Actions
  loadTree: () => Promise<void>;
  setActiveNode: (id: string) => void;
  setModel: (model: string) => void;
  createRootConversation: (title?: string) => Promise<void>;
  createChildBranch: (parentId: string, title?: string) => Promise<void>;
  sendUserMessage: (nodeId: string, content: string) => Promise<void>;
  clearError: () => void;
}

export const useConversationStore = create<ConversationStore>((set, get) => ({
  tree: null,
  activeNodeId: null,
  streamingMessage: '',
  isLoading: false,
  error: null,
  selectedModel: MODELS[0].id,

  loadTree: async () => {
    set({ isLoading: true, error: null });
    try {
      const { root } = await getTree();
      set({ tree: root, isLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },

  setActiveNode: (id) => set({ activeNodeId: id }),

  setModel: (model) => set({ selectedModel: model }),

  createRootConversation: async (title) => {
    set({ isLoading: true, error: null });
    try {
      const node = await createConversation(title);
      set({ tree: node, activeNodeId: node.id, isLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },

  createChildBranch: async (parentId, title) => {
    set({ isLoading: true, error: null });
    try {
      const child = await createBranch(parentId, title);
      await get().loadTree();
      set({ activeNodeId: child.id, isLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },

  sendUserMessage: async (nodeId, content) => {
    set({ isLoading: true, error: null, streamingMessage: '' });
    try {
      const model = get().selectedModel;
      const response = await streamMessage(nodeId, content, model);
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error('No response body');

      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            try {
              // Parse SSE event format: {"event": "message", "data": "{\"content\": \"...\"}"}
              const sseEvent = JSON.parse(data);
              if (sseEvent.data) {
                const inner = JSON.parse(sseEvent.data);
                const text = inner.content || '';
                if (text) {
                  fullContent += text;
                  set({ streamingMessage: fullContent });
                }
              }
            } catch {
              // Try parsing as plain JSON (fallback)
              try {
                const parsed = JSON.parse(data);
                const text = parsed.content || parsed.choices?.[0]?.delta?.content || '';
                if (text) {
                  fullContent += text;
                  set({ streamingMessage: fullContent });
                }
              } catch {
                // Not JSON, skip
              }
            }
          }
        }
      }

      await get().loadTree();
      set({ streamingMessage: '', isLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false, streamingMessage: '' });
    }
  },

  clearError: () => set({ error: null }),
}));

export { MODELS };
