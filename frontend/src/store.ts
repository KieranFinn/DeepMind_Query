import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { KnowledgeRegion, Graph, Node } from './types';
import * as api from './api';

const MODELS = [
  { id: 'MiniMax-M2.7', name: 'MiniMax M2.7' },
];

const MAX_ERRORS = 3;

interface ErrorItem {
  id: string;
  message: string;
  timestamp: number;
}

interface AppState {
  // Regions & Active State
  regions: KnowledgeRegion[];
  activeRegionId: string | null;
  activeNodeId: string | null;  // Node = Session

  // UI State
  graph: Graph | null;  // Current region's graph
  streamingMessage: string;
  isLoading: boolean;
  errorQueue: ErrorItem[];
  selectedModel: string;
  abortController: AbortController | null;
  isHydrated: boolean;

  // BigBang Analysis State (background-capable)
  isBigBangAnalyzing: boolean;
  bigBangProgress: string;
  bigBangResult: string;
  bigBangError: string | null;
  bigBangAbortController: AbortController | null;
  bigBangRegionId: string | null;  // Track which region is being analyzed

  // Region actions
  loadRegions: () => Promise<void>;
  createRegion: (name: string, description?: string, color?: string) => Promise<void>;
  deleteRegion: (regionId: string) => Promise<void>;
  updateRegion: (regionId: string, name: string) => Promise<void>;
  setActiveRegion: (regionId: string) => Promise<void>;

  // Node actions (Node = Session)
  loadGraph: () => Promise<void>;
  setActiveNode: (nodeId: string) => Promise<void>;
  createNode: (title?: string, parentId?: string) => Promise<void>;
  deleteNode: (regionId: string, nodeId: string) => Promise<void>;
  sendUserMessage: (content: string) => Promise<void>;
  createChildNode: (parentId: string, title?: string) => Promise<void>;
  cancelStreaming: () => void;

  // Utils
  setModel: (model: string) => void;
  addError: (message: string) => void;
  clearError: (id?: string) => void;
  getActiveRegion: () => KnowledgeRegion | null;
  getActiveNode: () => Node | null;

  // BigBang Actions (background-capable analysis)
  startBigBangAnalysis: (regionId: string) => Promise<void>;
  cancelBigBangAnalysis: () => void;
  clearBigBangResult: () => void;
}

function findRegion(regions: KnowledgeRegion[], regionId: string): KnowledgeRegion | null {
  return regions.find(r => r.id === regionId) || null;
}

function findNode(graph: Graph | null, nodeId: string): Node | null {
  if (!graph) return null;
  return graph.nodes.find(n => n.id === nodeId) || null;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      regions: [],
      activeRegionId: null,
      activeNodeId: null,
      graph: null,
      streamingMessage: '',
      isLoading: false,
      errorQueue: [],
      selectedModel: MODELS[0].id,
      abortController: null,
      isHydrated: false,

      // BigBang initial state
      isBigBangAnalyzing: false,
      bigBangProgress: '',
      bigBangResult: '',
      bigBangError: null,
      bigBangAbortController: null,
      bigBangRegionId: null,

      // ============ Region Actions ============

      loadRegions: async () => {
        set(state => ({ ...state, isLoading: true, errorQueue: [] }));
        try {
          const regions = await api.getRegions();
          set({ regions, isLoading: false, isHydrated: true });

          // Auto-select first region and load its graph if none active
          const { activeRegionId } = get();
          if (!activeRegionId && regions.length > 0) {
            const firstRegionId = regions[0].id;
            set({ activeRegionId: firstRegionId });
            const graph = await api.getGraph(firstRegionId);
            set({
              graph,
              activeNodeId: graph.nodes.length > 0 ? graph.nodes[0].id : null
            });
          } else if (activeRegionId) {
            // Active region was restored from localStorage - load its graph
            const graph = await api.getGraph(activeRegionId);
            set({
              graph,
              activeNodeId: graph.nodes.length > 0 ? graph.nodes[0].id : null
            });
          }
        } catch (e) {
          get().addError((e as Error).message);
          set({ isLoading: false, isHydrated: true });
        }
      },

      createRegion: async (name, description, color) => {
        set(state => ({ ...state, isLoading: true, errorQueue: [] }));
        try {
          const region = await api.createRegion(name, description, color);
          set(state => ({
            regions: [...state.regions, region],
            activeRegionId: region.id,
            isLoading: false
          }));
          // Load graph for new region
          await get().loadGraph();
        } catch (e) {
          get().addError((e as Error).message);
          set({ isLoading: false });
        }
      },

      deleteRegion: async (regionId) => {
        const { activeRegionId } = get();
        set(state => ({ ...state, isLoading: true, errorQueue: [] }));
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
              activeNodeId: newActiveId !== regionId ? state.activeNodeId : null,
              graph: newActiveId !== regionId ? state.graph : null,
              isLoading: false
            };
          });
          // Reload graph if the deleted region was the active one
          if (activeRegionId === regionId) {
            await get().loadGraph();
          }
        } catch (e) {
          get().addError((e as Error).message);
          set({ isLoading: false });
        }
      },

      updateRegion: async (regionId, name) => {
        try {
          await api.updateRegion(regionId, name);
          set(state => ({
            regions: state.regions.map(r =>
              r.id === regionId ? { ...r, name } : r
            )
          }));
        } catch (e) {
          get().addError((e as Error).message);
        }
      },

      setActiveRegion: async (regionId) => {
        try {
          await api.setActiveRegion(regionId);
          set({ activeRegionId: regionId, activeNodeId: null, graph: null });
          await get().loadGraph();
        } catch (e) {
          get().addError((e as Error).message);
        }
      },

      // ============ Graph / Node Actions ============

      loadGraph: async () => {
        const { activeRegionId } = get();
        if (!activeRegionId) {
          set({ graph: null, activeNodeId: null });
          return;
        }

        set(state => ({ ...state, isLoading: true, errorQueue: [] }));
        try {
          const graph = await api.getGraph(activeRegionId);
          set(state => ({
            graph,
            isLoading: false,
            // Auto-select first node if exists
            activeNodeId: graph.nodes.length > 0 ? graph.nodes[0].id : null,
            // Sync graph into regions array so activeRegion.graph stays consistent
            regions: state.regions.map(r =>
              r.id === activeRegionId ? { ...r, graph } : r
            )
          }));
        } catch (e) {
          get().addError((e as Error).message);
          set({ isLoading: false });
        }
      },

      setActiveNode: async (nodeId) => {
        const { activeRegionId } = get();
        if (!activeRegionId) return;
        set({ activeNodeId: nodeId });
      },

      createNode: async (title, parentId) => {
        const { activeRegionId } = get();
        if (!activeRegionId) return;

        set(state => ({ ...state, isLoading: true, errorQueue: [] }));
        try {
          const result = await api.createNode(activeRegionId, title, parentId);
          await get().loadGraph();
          set({ activeNodeId: result.node.id });
        } catch (e) {
          get().addError((e as Error).message);
          set({ isLoading: false });
        }
      },

      deleteNode: async (regionId, nodeId) => {
        const { activeNodeId } = get();
        set(state => ({ ...state, isLoading: true, errorQueue: [] }));
        try {
          await api.deleteNode(regionId, nodeId);
          await get().loadGraph();
          // If deleted node was active, select first available node
          if (activeNodeId === nodeId) {
            const { graph } = get();
            set({ activeNodeId: graph?.nodes[0]?.id || null });
          }
        } catch (e) {
          get().addError((e as Error).message);
          set({ isLoading: false });
        }
      },

      createChildNode: async (parentId, title) => {
        const { activeRegionId } = get();
        if (!activeRegionId) return;

        set(state => ({ ...state, isLoading: true, errorQueue: [] }));
        try {
          const result = await api.createChildNode(activeRegionId, parentId, title);
          await get().loadGraph();
          set({ activeNodeId: result.node.id });
        } catch (e) {
          get().addError((e as Error).message);
          set({ isLoading: false });
        }
      },

      // ============ Message Actions ============

      sendUserMessage: async (content) => {
        const { activeRegionId, activeNodeId, abortController, selectedModel } = get();
        if (!activeRegionId || !activeNodeId) return;

        if (abortController) abortController.abort();

        // Optimistically add user message to local state immediately
        set(state => {
          if (!state.graph) return state;
          const newGraph = { ...state.graph };
          const nodeIndex = newGraph.nodes.findIndex(n => n.id === activeNodeId);
          if (nodeIndex === -1) return state;
          const updatedNode = { ...newGraph.nodes[nodeIndex] };
          updatedNode.messages = [...updatedNode.messages, { role: 'user', content, created_at: new Date().toISOString() }];
          newGraph.nodes = [...newGraph.nodes];
          newGraph.nodes[nodeIndex] = updatedNode;
          return { ...state, graph: newGraph };
        });

        const controller = new AbortController();
        set(state => ({ ...state, abortController: controller, isLoading: true, errorQueue: [], streamingMessage: '' }));

        try {
          const response = await api.streamMessage(activeRegionId, activeNodeId, content, selectedModel);

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
            await get().loadGraph();
          }
        } catch (e) {
          if ((e as Error).name !== 'AbortError') {
            get().addError((e as Error).message);
            set({ isLoading: false, streamingMessage: '', abortController: null });
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

      // ============ BigBang Analysis (Background-capable) ============

      startBigBangAnalysis: async (regionId: string) => {
        const { bigBangAbortController } = get();
        if (bigBangAbortController) bigBangAbortController.abort();

        const controller = new AbortController();
        set({
          isBigBangAnalyzing: true,
          bigBangProgress: '',
          bigBangResult: '',
          bigBangError: null,
          bigBangAbortController: controller,
          bigBangRegionId: regionId,
        });

        try {
          const response = await api.streamAnalyze(regionId);
          if (!response.ok) throw new Error('Analysis failed');

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
                    if (inner.content) {
                      fullContent += inner.content;
                      set({ bigBangProgress: fullContent });
                    }
                  }
                } catch (parseErr) {
                  if ((parseErr as Error).message.startsWith('Stream error')) throw parseErr;
                  try {
                    const parsed = JSON.parse(data);
                    const text = parsed.content || '';
                    if (text) {
                      fullContent += text;
                      set({ bigBangProgress: fullContent });
                    }
                  } catch {}
                }
              }
            }
          }

          if (!controller.signal.aborted) {
            set({
              bigBangResult: fullContent,
              bigBangProgress: '',
              isBigBangAnalyzing: false,
            });
          }
        } catch (e) {
          if ((e as Error).name !== 'AbortError') {
            set({
              bigBangError: (e as Error).message,
              isBigBangAnalyzing: false,
              bigBangProgress: '',
            });
          }
        } finally {
          if (!controller.signal.aborted) {
            set({ bigBangAbortController: null });
          }
        }
      },

      cancelBigBangAnalysis: () => {
        const { bigBangAbortController } = get();
        if (bigBangAbortController) bigBangAbortController.abort();
        set({
          isBigBangAnalyzing: false,
          bigBangProgress: '',
          bigBangAbortController: null,
        });
      },

      clearBigBangResult: () => {
        set({
          bigBangResult: '',
          bigBangProgress: '',
          bigBangError: null,
          isBigBangAnalyzing: false,
          bigBangAbortController: null,
          bigBangRegionId: null,
        });
      },

      // ============ Utils ============

      setModel: (model) => set({ selectedModel: model }),

      addError: (message) => set(state => {
        const newError: ErrorItem = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          message,
          timestamp: Date.now(),
        };
        const newQueue = [...state.errorQueue, newError].slice(-MAX_ERRORS);
        return { errorQueue: newQueue };
      }),

      clearError: (id) => set(state => {
        if (!id) {
          // Clear all errors
          return { errorQueue: [] };
        }
        // Clear specific error
        return { errorQueue: state.errorQueue.filter(e => e.id !== id) };
      }),

      getActiveRegion: () => {
        const { regions, activeRegionId } = get();
        return findRegion(regions, activeRegionId || '');
      },

      getActiveNode: () => {
        const { graph, activeNodeId } = get();
        return findNode(graph, activeNodeId || '');
      },
    }),
    {
      name: 'deepmind-query-storage',
      partialize: (state) => ({
        activeRegionId: state.activeRegionId,
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
