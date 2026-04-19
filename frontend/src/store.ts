import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { KnowledgeRegion, Graph, Node, KnowledgePoint } from './types';
import * as api from './api';

const MODELS = [
  { id: 'MiniMax-M2.7', name: 'MiniMax M2.7' },
  { id: 'claude-sonnet-4.6', name: 'Claude Sonnet 4' },
];

const MAX_ERRORS = 3;

interface ErrorItem {
  id: string;
  message: string;
  timestamp: number;
}

// ============ Shared Streaming Utility ============

type StreamingCallback = (content: string) => void;

async function streamSSE(
  response: Response,
  signal: AbortSignal,
  onChunk: StreamingCallback,
  throttleMs = 0
): Promise<string> {
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
  let lastUpdateTime = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (signal.aborted) break;

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
              const now = Date.now();
              if (!throttleMs || now - lastUpdateTime >= throttleMs) {
                onChunk(fullContent);
                lastUpdateTime = now;
              }
            }
          }
        } catch (parseErr) {
          if (parseErr instanceof Error && parseErr.message.startsWith('Stream error')) throw parseErr;
          try {
            const parsed = JSON.parse(data);
            const text = parsed.content || parsed.choices?.[0]?.delta?.content || '';
            if (text) {
              fullContent += text;
              const now = Date.now();
              if (!throttleMs || now - lastUpdateTime >= throttleMs) {
                onChunk(fullContent);
                lastUpdateTime = now;
              }
            }
          } catch {}
        }
      }
    }
  }

  // Final update for any remaining content
  onChunk(fullContent);
  return fullContent;
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

  // Follow-up Suggestions (AI-generated after first Q&A)
  followUpSummary: string;
  followUpDirections: string[];
  followUpReady: boolean;  // true when suggestions are ready
  followUpPending: boolean;  // true when fetching suggestions
  followUpNodeId: string | null;  // which node the suggestions are for
  followUpAbortController: AbortController | null;

  // Knowledge Points
  knowledgePoints: KnowledgePoint[];
  knowledgePointsLoading: boolean;
  activeNodeKnowledgePoints: KnowledgePoint[];  // KPs for the currently selected node

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
  updateNode: (regionId: string, nodeId: string, title: string) => Promise<void>;
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

  // Follow-up Actions
  fetchFollowUpSuggestions: (regionId: string, nodeId: string) => Promise<void>;

  // Knowledge Point Actions
  fetchKnowledgePointsForNode: (regionId: string, nodeId: string) => Promise<void>;
  clearKnowledgePoints: () => void;
  matchKnowledgePoints: (regionId: string, query: string) => Promise<void>;
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

      // Follow-up initial state
      followUpSummary: '',
      followUpDirections: [],
      followUpReady: false,
      followUpPending: false,
      followUpNodeId: null,
      followUpAbortController: null,

      // Knowledge Points initial state
      knowledgePoints: [],
      knowledgePointsLoading: false,
      activeNodeKnowledgePoints: [],

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
          get().addError(e instanceof Error ? e.message : String(e));
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
          get().addError(e instanceof Error ? e.message : String(e));
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
              isLoading: false,
              // Clear knowledge points state
              knowledgePoints: [],
              activeNodeKnowledgePoints: [],
            };
          });
          // Reload graph if the deleted region was the active one
          if (activeRegionId === regionId) {
            await get().loadGraph();
          }

          // Clear BigBang state if the deleted region was being analyzed
          const { bigBangRegionId } = get();
          if (bigBangRegionId === regionId) {
            set({
              bigBangRegionId: null,
              bigBangResult: '',
              bigBangError: null,
              isBigBangAnalyzing: false,
              bigBangProgress: '',
              bigBangAbortController: null,
            });
          }
        } catch (e) {
          get().addError(e instanceof Error ? e.message : String(e));
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
          get().addError(e instanceof Error ? e.message : String(e));
        }
      },

      setActiveRegion: async (regionId) => {
        try {
          await api.setActiveRegion(regionId);
          set({
            activeRegionId: regionId,
            activeNodeId: null,
            graph: null,
            activeNodeKnowledgePoints: [],
            knowledgePoints: [],
          });
          await get().loadGraph();
        } catch (e) {
          get().addError(e instanceof Error ? e.message : String(e));
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
            // Preserve current activeNodeId if it still exists in the graph, otherwise select first node
            activeNodeId: (() => {
              const currentId = state.activeNodeId;
              const nodeStillExists = graph.nodes.some(n => n.id === currentId);
              if (currentId && nodeStillExists) {
                return currentId;
              }
              return graph.nodes.length > 0 ? graph.nodes[0].id : null;
            })(),
          }));
        } catch (e) {
          get().addError(e instanceof Error ? e.message : String(e));
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
          get().addError(e instanceof Error ? e.message : String(e));
          set({ isLoading: false });
        }
      },

      deleteNode: async (regionId, nodeId) => {
        const { activeNodeId } = get();
        const deletingActiveNode = activeNodeId === nodeId;
        set(state => ({ ...state, isLoading: true, errorQueue: [], activeNodeKnowledgePoints: [] }));
        try {
          await api.deleteNode(regionId, nodeId);
          await get().loadGraph();
          // If deleted node was active, select first available node
          if (deletingActiveNode) {
            const { graph } = get();
            set({ activeNodeId: graph?.nodes[0]?.id || null });
          }
        } catch (e) {
          get().addError(e instanceof Error ? e.message : String(e));
          set({ isLoading: false });
        }
      },

      updateNode: async (regionId, nodeId, title) => {
        try {
          await api.updateNode(regionId, nodeId, title);
          set(state => ({
            graph: state.graph ? {
              ...state.graph,
              nodes: state.graph.nodes.map(n =>
                n.id === nodeId ? { ...n, title } : n
              )
            } : null
          }));
        } catch (e) {
          get().addError(e instanceof Error ? e.message : String(e));
        }
      },

      createChildNode: async (parentId, title) => {
        const { activeRegionId } = get();
        if (!activeRegionId) return;

        set(state => ({ ...state, isLoading: true, errorQueue: [] }));
        try {
          const result = await api.createChildNode(activeRegionId, parentId, title);
          await get().loadGraph();

          // Transform matched_knowledge_points to KnowledgePoint format
          const matchedKPs = (result.matched_knowledge_points || []).map(
            (kp: { id: string; content: string; reason?: string }) => ({
              id: kp.id,
              title: kp.content.slice(0, 30),
              content: kp.content,
              score: 0.8,
              node_id: result.node.id,
            })
          );

          set({
            activeNodeId: result.node.id,
            activeNodeKnowledgePoints: matchedKPs
          });
        } catch (e) {
          get().addError(e instanceof Error ? e.message : String(e));
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
          const nodeIndex = state.graph.nodes.findIndex(n => n.id === activeNodeId);
          if (nodeIndex === -1) return state;
          const newMessage = { role: 'user' as const, content, created_at: new Date().toISOString() };
          const updatedNode = {
            ...state.graph.nodes[nodeIndex],
            messages: [...state.graph.nodes[nodeIndex].messages, newMessage]
          };
          const nodes = [...state.graph.nodes];
          nodes[nodeIndex] = updatedNode;
          return { ...state, graph: { ...state.graph, nodes } };
        });

        const controller = new AbortController();
        set(state => ({ ...state, abortController: controller, isLoading: true, errorQueue: [], streamingMessage: '' }));

        try {
          const response = await api.streamMessage(activeRegionId, activeNodeId, content, selectedModel);
          let fullContent = '';
          await streamSSE(response, controller.signal, (chunk) => {
            fullContent = chunk;
            set({ streamingMessage: fullContent });
          });

          if (!controller.signal.aborted) {
            await get().loadGraph();
          }
        } catch (e) {
          if (e instanceof Error && e.name !== 'AbortError') {
            get().addError(e.message);
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
          const THROTTLE_MS = 100;
          let fullContent = '';
          await streamSSE(response, controller.signal, (chunk) => {
            fullContent = chunk;
            set({ bigBangProgress: fullContent });
          }, THROTTLE_MS);

          if (!controller.signal.aborted) {
            set({
              bigBangResult: fullContent,
              bigBangProgress: '',
              isBigBangAnalyzing: false,
            });
          }
        } catch (e) {
          if (e instanceof Error && e.name !== 'AbortError') {
            set({
              bigBangError: e.message,
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

      // ============ Follow-up Suggestions ============

      fetchFollowUpSuggestions: async (regionId: string, nodeId: string) => {
        const { followUpPending, followUpNodeId, followUpReady, followUpAbortController } = get();
        // Abort any previous request
        if (followUpAbortController) followUpAbortController.abort();

        // Don't refetch if already pending for same node
        if (followUpPending && followUpNodeId === nodeId) return;
        // Don't refetch if already have suggestions for this node
        if (followUpReady && followUpNodeId === nodeId) return;

        const controller = new AbortController();
        set({
          followUpPending: true,
          followUpSummary: '',
          followUpDirections: [],
          followUpReady: false,
          followUpNodeId: nodeId,
          followUpAbortController: controller,
        });

        try {
          const response = await api.getFollowUpSuggestions(regionId, nodeId);
          let fullContent = '';
          await streamSSE(response, controller.signal, (chunk) => {
            fullContent = chunk;
          });

          // Parse the response - look for 【摘要】 and 【方向】 with regex for robustness
          let summary = '';
          const directions: string[] = [];
          const lines = fullContent.split('\n');

          // Robust regex patterns that handle variations like "【 摘要 】" or "总结"
          const summaryPattern = /^【\s*([摘要总结])】\s*(.+)/;
          const direction1Pattern = /^【\s*方向\s*1\s*[】:]\s*(.+)/;
          const direction2Pattern = /^【\s*方向\s*2\s*[】:]\s*(.+)/;

          for (const line of lines) {
            const trimmed = line.trim();
            const summaryMatch = trimmed.match(summaryPattern);
            if (summaryMatch) summary = summaryMatch[2].trim();
            const dir1Match = trimmed.match(direction1Pattern);
            if (dir1Match) directions[0] = dir1Match[1].trim();
            const dir2Match = trimmed.match(direction2Pattern);
            if (dir2Match) directions[1] = dir2Match[1].trim();
          }

          // Fallback: if no markers found, create generic summary
          if (!summary && fullContent.length > 20) {
            summary = fullContent.slice(0, 100).replace(/[#*]/g, '').trim() + '...';
          }

          set({
            followUpSummary: summary,
            followUpDirections: directions.filter(Boolean),
            followUpReady: true,
            followUpPending: false,
          });
        } catch (e) {
          if (e instanceof Error && e.name !== 'AbortError') {
            set({
              followUpPending: false,
              followUpReady: false,
            });
          }
        } finally {
          if (!controller.signal.aborted) {
            set({ followUpAbortController: null });
          }
        }
      },

      // ============ Knowledge Point Actions ============

      fetchKnowledgePointsForNode: async (regionId: string, nodeId: string) => {
        set(state => ({ ...state, knowledgePointsLoading: true, activeNodeKnowledgePoints: [] }));
        try {
          const kps = await api.getKnowledgePointsForNode(regionId, nodeId);
          set({ activeNodeKnowledgePoints: kps, knowledgePointsLoading: false });
        } catch (e) {
          get().addError(e instanceof Error ? e.message : String(e));
          set({ knowledgePointsLoading: false });
        }
      },

      clearKnowledgePoints: () => {
        set({ knowledgePoints: [], activeNodeKnowledgePoints: [] });
      },

      matchKnowledgePoints: async (regionId: string, query: string) => {
        set(state => ({ ...state, knowledgePointsLoading: true }));
        try {
          const kps = await api.matchKnowledgePoints(regionId, query);
          set({ knowledgePoints: kps, knowledgePointsLoading: false });
        } catch (e) {
          get().addError(e instanceof Error ? e.message : String(e));
          set({ knowledgePointsLoading: false });
        }
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
        if (!activeRegionId) return null;
        return regions.find(r => r.id === activeRegionId) || null;
      },

      getActiveNode: () => {
        const { graph, activeNodeId } = get();
        if (!graph || !activeNodeId) return null;
        return graph.nodes.find(n => n.id === activeNodeId) || null;
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
