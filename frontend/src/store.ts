import { create } from 'zustand';
import { ConversationNode, Message } from './types';
import { getTree, createConversation, createBranch, streamMessage } from './api';

interface ConversationStore {
  tree: ConversationNode | null;
  activeNodeId: string | null;
  streamingMessage: string;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadTree: () => Promise<void>;
  setActiveNode: (id: string) => void;
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
      // Reload tree to get updated structure
      await get().loadTree();
      set({ activeNodeId: child.id, isLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },

  sendUserMessage: async (nodeId, content) => {
    set({ isLoading: true, error: null, streamingMessage: '' });
    try {
      const response = await streamMessage(nodeId, content);
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error('No response body');

      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        // SSE format: data: {...}\n\n or data: [DONE]\n\n
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              // Accumulate content from stream
              if (parsed.trim()) {
                fullContent += parsed;
                set({ streamingMessage: fullContent });
              }
            } catch {
              // Plain text chunk
              fullContent += data;
              set({ streamingMessage: fullContent });
            }
          }
        }
      }

      // Reload tree to get updated messages
      await get().loadTree();
      set({ streamingMessage: '', isLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false, streamingMessage: '' });
    }
  },

  clearError: () => set({ error: null }),
}));
