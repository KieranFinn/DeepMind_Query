import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { KnowledgeRegion, Session, ConversationNode } from './types';
import * as api from './api';

const MODELS = [
  { id: 'abab6.5s-chat', name: 'MiniMax abab6.5s' },
  { id: 'abab6-chat', name: 'MiniMax abab6' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
  { id: 'gpt-4o', name: 'GPT-4o' },
];

interface AppState {
  // Regions & Sessions
  regions: KnowledgeRegion[];
  activeRegionId: string | null;
  activeSessionId: string | null;

  // UI State
  activeTree: ConversationNode | null;
  streamingMessage: string;
  isLoading: boolean;
  error: string | null;
  selectedModel: string;
  abortController: AbortController | null;
  isHydrated: boolean;

  // Region actions
  loadRegions: () => Promise<void>;
  createRegion: (name: string, description?: string, color?: string) => Promise<void>;
  deleteRegion: (regionId: string) => Promise<void>;
  setActiveRegion: (regionId: string) => Promise<void>;

  // Session actions
  loadSessions: (regionId: string) => Promise<void>;
  createSession: (regionId: string, title?: string) => Promise<void>;
  setActiveSession: (sessionId: string) => Promise<void>;

  // Tree actions
  loadTree: () => Promise<void>;
  sendUserMessage: (content: string) => Promise<void>;
  createBranch: (parentNodeId: string, title?: string) => Promise<void>;
  cancelStreaming: () => void;

  // Utils
  setModel: (model: string) => void;
  clearError: () => void;
  getActiveRegion: () => KnowledgeRegion | null;
  getActiveSession: () => Session | null;
}

function findRegion(regions: KnowledgeRegion[], regionId: string): KnowledgeRegion | null {
  return regions.find(r => r.id === regionId) || null;
}

function findSession(region: KnowledgeRegion | null, sessionId: string): Session | null {
  if (!region) return null;
  return region.sessions.find(s => s.id === sessionId) || null;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      regions: [],
      activeRegionId: null,
      activeSessionId: null,
      activeTree: null,
      streamingMessage: '',
      isLoading: false,
      error: null,
      selectedModel: MODELS[0].id,
      abortController: null,
      isHydrated: false,

      // ============ Region Actions ============

      loadRegions: async () => {
        set({ isLoading: true, error: null });
        try {
          const regions = await api.getRegions();
          set({ regions, isLoading: false, isHydrated: true });

          // Auto-select first region if none active
          const { activeRegionId, activeSessionId } = get();
          if (!activeRegionId && regions.length > 0) {
            set({ activeRegionId: regions[0].id });
          }
        } catch (e) {
          set({ error: (e as Error).message, isLoading: false, isHydrated: true });
        }
      },

      createRegion: async (name, description, color) => {
        set({ isLoading: true, error: null });
        try {
          const region = await api.createRegion(name, description, color);
          set(state => ({
            regions: [...state.regions, region],
            activeRegionId: region.id,
            isLoading: false
          }));
          // Create first session in new region
          await get().createSession(region.id, '第一个会话');
        } catch (e) {
          set({ error: (e as Error).message, isLoading: false });
        }
      },

      deleteRegion: async (regionId) => {
        set({ isLoading: true, error: null });
        try {
          await api.deleteRegion(regionId);
          set(state => {
            const newRegions = state.regions.filter(r => r.id !== regionId);
            const newActiveId = state.activeRegionId === regionId
              ? (newRegions[0]?.id || null)
              : state.activeRegionId;
            return {
              regions: newRegions,
              activeRegionId: newActiveId,
              activeSessionId: newActiveId !== regionId ? state.activeSessionId : null,
              isLoading: false
            };
          });
        } catch (e) {
          set({ error: (e as Error).message, isLoading: false });
        }
      },

      setActiveRegion: async (regionId) => {
        try {
          await api.setActiveRegion(regionId);
          set({ activeRegionId: regionId, activeSessionId: null, activeTree: null });

          // Load sessions and auto-select first
          const region = findRegion(get().regions, regionId);
          if (region && region.sessions.length > 0) {
            set({ activeSessionId: region.sessions[0].id });
            await get().loadTree();
          }
        } catch (e) {
          set({ error: (e as Error).message });
        }
      },

      // ============ Session Actions ============

      loadSessions: async (regionId) => {
        // Sessions are stored within regions, no separate load needed
      },

      createSession: async (regionId, title) => {
        set({ isLoading: true, error: null });
        try {
          const session = await api.createSession(regionId, title);
          set(state => ({
            regions: state.regions.map(r =>
              r.id === regionId
                ? { ...r, sessions: [...r.sessions, session] }
                : r
            ),
            activeSessionId: session.id,
            isLoading: false
          }));
          // Load the tree for the new session
          await get().loadTree();
        } catch (e) {
          set({ error: (e as Error).message, isLoading: false });
        }
      },

      setActiveSession: async (sessionId) => {
        const { activeRegionId } = get();
        if (!activeRegionId) return;

        set({ activeSessionId: sessionId });
        await get().loadTree();
      },

      // ============ Tree Actions ============

      loadTree: async () => {
        const { activeRegionId, activeSessionId } = get();
        if (!activeRegionId || !activeSessionId) {
          set({ activeTree: null });
          return;
        }

        set({ isLoading: true, error: null });
        try {
          const tree = await api.getSessionTree(activeRegionId, activeSessionId);
          set({ activeTree: tree, isLoading: false });
        } catch (e) {
          set({ error: (e as Error).message, isLoading: false });
        }
      },

      sendUserMessage: async (content) => {
        const { activeRegionId, activeSessionId, abortController, selectedModel } = get();
        if (!activeRegionId || !activeSessionId) return;

        if (abortController) abortController.abort();

        const controller = new AbortController();
        set({ abortController: controller, isLoading: true, error: null, streamingMessage: '' });

        try {
          const response = await api.streamMessage(activeRegionId, activeSessionId, content, selectedModel);

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

      createBranch: async (parentNodeId, title) => {
        const { activeRegionId, activeSessionId } = get();
        if (!activeRegionId || !activeSessionId) return;

        set({ isLoading: true, error: null });
        try {
          await api.createBranch(activeRegionId, activeSessionId, parentNodeId, title);
          await get().loadTree();
        } catch (e) {
          set({ error: (e as Error).message, isLoading: false });
        }
      },

      cancelStreaming: () => {
        const { abortController } = get();
        if (abortController) abortController.abort();
        set({ isLoading: false, streamingMessage: '', abortController: null });
      },

      // ============ Utils ============

      setModel: (model) => set({ selectedModel: model }),

      clearError: () => set({ error: null }),

      getActiveRegion: () => {
        const { regions, activeRegionId } = get();
        return findRegion(regions, activeRegionId || '');
      },

      getActiveSession: () => {
        const region = get().getActiveRegion();
        const { activeSessionId } = get();
        return findSession(region, activeSessionId || '');
      },
    }),
    {
      name: 'deepmind-query-storage',
      partialize: (state) => ({
        activeRegionId: state.activeRegionId,
        activeSessionId: state.activeSessionId,
        selectedModel: state.selectedModel,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) state.isHydrated = true;
      },
    }
  )
);

export { MODELS };
