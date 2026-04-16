import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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
  abortController: AbortController | null;
  isHydrated: boolean;

  // Actions
  loadTree: () => Promise<void>;
  setActiveNode: (id: string) => void;
  setModel: (model: string) => void;
  createRootConversation: (title?: string) => Promise<void>;
  createChildBranch: (parentId: string, title?: string) => Promise<void>;
  sendUserMessage: (nodeId: string, content: string) => Promise<void>;
  cancelStreaming: () => void;
  renameNode: (nodeId: string, title: string) => void;
  deleteNode: (nodeId: string) => Promise<void>;
  getPathToNode: (nodeId: string) => ConversationNode[];
  generateSummary: (nodeId: string) => string;
  clearError: () => void;
}

function findNodeById(node: ConversationNode | null, id: string): ConversationNode | null {
  if (!node) return null;
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findNodeById(child, id);
    if (found) return found;
  }
  return null;
}

function getPathToNode(node: ConversationNode, nodeId: string, path: ConversationNode[] = []): ConversationNode[] {
  path.push(node);
  if (node.id === nodeId) return path;
  for (const child of node.children) {
    const found = getPathToNode(child, nodeId, [...path]);
    if (found && found[found.length - 1].id === nodeId) return found;
  }
  return [];
}

function generateNodeSummary(node: ConversationNode): string {
  if (node.messages.length === 0) return '新节点';
  const firstUserMsg = node.messages.find(m => m.role === 'user');
  if (!firstUserMsg) return '新节点';
  // Truncate to ~50 chars
  const text = firstUserMsg.content.trim();
  return text.length > 50 ? text.slice(0, 50) + '...' : text;
}

function renameNodeInTree(node: ConversationNode, nodeId: string, newTitle: string): ConversationNode | null {
  if (node.id === nodeId) {
    return { ...node, title: newTitle };
  }
  const newChildren = node.children
    .map(child => renameNodeInTree(child, nodeId, newTitle))
    .filter((c): c is ConversationNode => c !== null);
  if (newChildren.length !== node.children.length) {
    return { ...node, children: newChildren };
  }
  return null; // No change made
}

function deleteNodeFromTree(node: ConversationNode, nodeId: string): ConversationNode | null {
  if (node.id === nodeId) {
    return null;
  }
  return {
    ...node,
    children: node.children
      .map(child => deleteNodeFromTree(child, nodeId))
      .filter((c): c is ConversationNode => c !== null)
  };
}

export const useConversationStore = create<ConversationStore>()(
  persist(
    (set, get) => ({
      tree: null,
      activeNodeId: null,
      streamingMessage: '',
      isLoading: false,
      error: null,
      selectedModel: MODELS[0].id,
      abortController: null,
      isHydrated: false,

      loadTree: async () => {
        const { abortController } = get();
        if (abortController) abortController.abort();

        set({ isLoading: true, error: null });
        try {
          const { root } = await getTree();
          set({ tree: root, isLoading: false, isHydrated: true });
        } catch (e) {
          if ((e as Error).name !== 'AbortError') {
            set({ error: (e as Error).message, isLoading: false, isHydrated: true });
          }
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
        const { abortController } = get();
        if (abortController) abortController.abort();

        const controller = new AbortController();
        set({ abortController: controller, isLoading: true, error: null, streamingMessage: '' });

        try {
          const model = get().selectedModel;
          const response = await streamMessage(nodeId, content, model);

          if (!response.ok) {
            let errorMsg = `HTTP ${response.status}`;
            try {
              const errData = await response.json();
              errorMsg = errData.detail || errorMsg;
            } catch {}
            throw new Error(errorMsg);
          }

          const reader = response.body?.getReader();
          if (!reader) throw new Error('No response body');

          const decoder = new TextDecoder();
          let fullContent = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (controller.signal.aborted) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();
                if (data === '[DONE]') continue;
                try {
                  const sseEvent = JSON.parse(data);
                  if (sseEvent.event === 'error') {
                    const errData = JSON.parse(sseEvent.data);
                    throw new Error(errData.error || 'Stream error');
                  }
                  if (sseEvent.data) {
                    const inner = JSON.parse(sseEvent.data);
                    const text = inner.content || '';
                    if (text) {
                      fullContent += text;
                      set({ streamingMessage: fullContent });
                    }
                  }
                } catch (parseErr) {
                  if ((parseErr as Error).message.startsWith('Stream error')) throw parseErr;
                  try {
                    const parsed = JSON.parse(data);
                    const text = parsed.content || parsed.choices?.[0]?.delta?.content || '';
                    if (text) {
                      fullContent += text;
                      set({ streamingMessage: fullContent });
                    }
                  } catch {}
                }
              }
            }
          }

          if (!controller.signal.aborted) {
            await get().loadTree();
          }
        } catch (e) {
          if ((e as Error).name !== 'AbortError') {
            set({ error: (e as Error).message, isLoading: false, streamingMessage: '' });
          }
        } finally {
          if (!controller.signal.aborted) {
            set({ streamingMessage: '', abortController: null });
          }
        }
      },

      cancelStreaming: () => {
        const { abortController } = get();
        if (abortController) abortController.abort();
        set({ isLoading: false, streamingMessage: '', abortController: null });
      },

      renameNode: (nodeId, title) => {
        const { tree } = get();
        if (!tree) return;
        const newTree = renameNodeInTree(tree, nodeId, title);
        if (newTree) {
          set({ tree: newTree });
        }
      },

      deleteNode: async (nodeId) => {
        const { tree, activeNodeId } = get();
        if (!tree) return;
        if (tree.id === nodeId) {
          set({ error: '不能删除根节点' });
          return;
        }
        const newTree = deleteNodeFromTree(tree, nodeId);
        set({ tree: newTree });
        if (activeNodeId === nodeId) {
          const deletedNode = findNodeById(tree, nodeId);
          if (deletedNode?.parent_id) {
            set({ activeNodeId: deletedNode.parent_id });
          } else if (newTree) {
            set({ activeNodeId: newTree.id });
          } else {
            set({ activeNodeId: null });
          }
        }
      },

      getPathToNode: (nodeId) => {
        const { tree } = get();
        if (!tree) return [];
        return getPathToNode(tree, nodeId);
      },

      generateSummary: (nodeId) => {
        const node = findNodeById(get().tree, nodeId);
        return node ? generateNodeSummary(node) : '';
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'deepmind-query-storage',
      partialize: (state) => ({
        tree: state.tree,
        activeNodeId: state.activeNodeId,
        selectedModel: state.selectedModel,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) state.isHydrated = true;
      },
    }
  )
);

export { MODELS };
