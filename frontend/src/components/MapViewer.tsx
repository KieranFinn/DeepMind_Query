import { useEffect, useState, useCallback, useRef } from 'react';
import ReactFlow, { Node, Controls, Background, MiniMap, useNodesState, useEdgesState, BackgroundVariant } from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css';
import NodeCard from './NodeCard';
import KnowledgePointCard from './KnowledgePointCard';
import { useStore } from '../store';
import { Graph } from '../types';
import BigBangModal from './BigBangModal';

const nodeTypes = { nodeCard: NodeCard, knowledgePoint: KnowledgePointCard };

// Simple force-directed layout (same as DraggableKnowledgeGraph)
function applyForceLayout(nodes: Node[], edges: any[], iterations = 100): Node[] {
  if (nodes.length === 0) return nodes;

  const nodesCopy = nodes.map(n => ({
    ...n,
    position: { ...n.position },
    vx: 0,
    vy: 0,
  }));

  const repulsionStrength = 5000;
  const attractionStrength = 0.05;
  const damping = 0.9;
  const centerX = 400;
  const centerY = 300;

  const adjacency = new Map<string, Set<string>>();
  nodesCopy.forEach(n => adjacency.set(n.id, new Set()));
  edges.forEach(e => {
    adjacency.get(e.source)?.add(e.target);
    adjacency.get(e.target)?.add(e.source);
  });

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < nodesCopy.length; i++) {
      for (let j = i + 1; j < nodesCopy.length; j++) {
        const dx = nodesCopy[j].position.x - nodesCopy[i].position.x;
        const dy = nodesCopy[j].position.y - nodesCopy[i].position.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = repulsionStrength / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        nodesCopy[i].vx -= fx;
        nodesCopy[i].vy -= fy;
        nodesCopy[j].vx += fx;
        nodesCopy[j].vy += fy;
      }
    }

    edges.forEach(edge => {
      const source = nodesCopy.find(n => n.id === edge.source);
      const target = nodesCopy.find(n => n.id === edge.target);
      if (!source || !target) return;
      const dx = target.position.x - source.position.x;
      const dy = target.position.y - source.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = attractionStrength * dist;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      source.vx += fx;
      source.vy += fy;
      target.vx -= fx;
      target.vy -= fy;
    });

    nodesCopy.forEach(node => {
      node.vx += (centerX - node.position.x) * 0.01;
      node.vy += (centerY - node.position.y) * 0.01;
    });

    nodesCopy.forEach(node => {
      node.position.x += node.vx;
      node.position.y += node.vy;
      node.vx *= damping;
      node.vy *= damping;
    });
  }

  let minX = Infinity, minY = Infinity;
  nodesCopy.forEach(n => {
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
  });
  const offsetX = minX < 0 ? -minX + 20 : 20;
  const offsetY = minY < 0 ? -minY + 20 : 20;

  return nodesCopy.map(n => ({
    ...n,
    position: { x: n.position.x + offsetX, y: n.position.y + offsetY },
  }));
}

interface MapViewerProps {
  onClose?: () => void;
}

function layoutGraphNodes(graph: Graph, activeNodeId: string | null, knowledgePoints: any[]) {
  const newNodes: Node[] = [];
  const newEdges: { id: string; source: string; target: string; type: string }[] = [];
  const yStep = 100;
  const xStep = 150;

  // Track positions of session nodes for KP placement
  const nodePositions: Map<string, { x: number; y: number }> = new Map();

  function layoutNode(nodeId: string, depth: number, index: number, siblingCount: number) {
    const node = graph.nodes.find((n) => String(n.id) === nodeId);
    if (!node) return;

    const nodeIdStr = String(node.id);
    const baseX = 150;
    const nodeX = siblingCount > 0
      ? baseX + (index - (siblingCount - 1) / 2) * xStep
      : baseX;
    const nodeY = depth * yStep + 30;

    newNodes.push({
      id: node.id,
      type: 'nodeCard',
      position: { x: nodeX, y: nodeY },
      data: {
        label: node.title,
        isActive: nodeIdStr === activeNodeId,
        isOnPath: true,
        messageCount: node.messages.length,
        childCount: graph.edges.filter((e) => String(e.source) === nodeIdStr).length,
      },
    });

    // Store position for KP placement
    nodePositions.set(nodeIdStr, { x: nodeX, y: nodeY });

    const childEdges = graph.edges.filter((e) => String(e.source) === nodeIdStr);
    childEdges.forEach((edge, i) => {
      newEdges.push({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'default',
      });
      layoutNode(String(edge.target), depth + 1, i, childEdges.length);
    });
  }

  const rootNodes = graph.nodes.filter((n) => !graph.edges.some((e) => String(e.target) === String(n.id)));
  rootNodes.forEach((root, i) => {
    layoutNode(String(root.id), 0, i, rootNodes.length);
  });

  // Add knowledge point nodes for the active node
  const activeNodePos = activeNodeId ? nodePositions.get(String(activeNodeId)) : null;
  if (activeNodePos && knowledgePoints.length > 0) {
    const kpCount = knowledgePoints.length;
    const kpStartX = activeNodePos.x + 180; // Place to the right of the session node
    const kpStartY = activeNodePos.y - (kpCount * 30);

    knowledgePoints.forEach((kp, i) => {
      const kpId = `kp-${kp.id}`;
      newNodes.push({
        id: kpId,
        type: 'knowledgePoint',
        position: { x: kpStartX, y: kpStartY + i * 70 },
        data: {
          label: kp.title,
          content: kp.content,
          score: kp.score,
          sourceNodeId: String(activeNodeId),
        },
      });

      // Add edge from session node to KP
      newEdges.push({
        id: `kp-edge-${kp.id}`,
        source: String(activeNodeId),
        target: kpId,
        type: 'default',
      });
    });
  }

  return { newNodes, newEdges };
}

export default function MapViewer({ onClose }: MapViewerProps) {
  const { graph, activeNodeId, getActiveRegion, setActiveNode, createChildNode, startBigBangAnalysis, activeRegionId, activeNodeKnowledgePoints, fetchKnowledgePointsForNode } = useStore();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [showBigBang, setShowBigBang] = useState(false);
  const [layoutMode, setLayoutMode] = useState<'dagre' | 'force'>('dagre');
  const rfInstance = useRef<any>(null);

  const activeRegion = getActiveRegion();

  const layoutGraph = useCallback(() => {
    if (!graph || graph.nodes.length === 0) return;

    if (layoutMode === 'force') {
      setNodes(nodes => applyForceLayout(nodes, graph.edges));
    } else {
      const g = new dagre.graphlib.Graph();
      g.setGraph({ rankdir: 'TB', nodesep: 80, ranksep: 100 });
      g.setDefaultEdgeLabel(() => ({}));

      graph.nodes.forEach(node => {
        g.setNode(node.id, { width: 150, height: 50 });
      });

      graph.edges.forEach(edge => {
        g.setEdge(edge.source, edge.target);
      });

      dagre.layout(g);

      setNodes(nodes => nodes.map(node => {
        const pos = g.node(node.id);
        return {
          ...node,
          position: { x: pos.x - 75, y: pos.y - 25 }
        };
      }));
    }
  }, [graph, layoutMode, setNodes]);

  const handleCenterOnNode = useCallback(() => {
    if (!rfInstance.current || !activeNodeId) return;
    try {
      rfInstance.current.fitView({
        nodes: [{ id: activeNodeId }],
        duration: 300,
        padding: 0.3,
        maxZoom: 1,
      });
    } catch (e) {
      console.warn('Center failed:', e);
    }
  }, [activeNodeId]);

  // Build nodes and edges from graph
  useEffect(() => {
    if (!graph) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const { newNodes, newEdges } = layoutGraphNodes(graph, activeNodeId, activeNodeKnowledgePoints);
    setNodes(newNodes);
    setEdges(newEdges);
  }, [graph, activeNodeId, activeNodeKnowledgePoints, setNodes, setEdges]);

  // Fetch knowledge points when active node changes
  useEffect(() => {
    if (activeNodeId && activeRegionId) {
      fetchKnowledgePointsForNode(activeRegionId, String(activeNodeId));
    }
  }, [activeNodeId, activeRegionId, fetchKnowledgePointsForNode]);

  const handleNodeClick = async (_: React.MouseEvent, node: Node) => {
    if (node.id !== activeNodeId) {
      await setActiveNode(node.id);
    }
  };

  const handleNodeDoubleClick = async (_: React.MouseEvent, node: Node) => {
    if (graph) {
      await createChildNode(String(node.id), `分支 ${String(node.id).slice(0, 8)}`);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100%', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--bg-secondary)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            ← 返回
          </button>
        )}

        {activeRegion && (
          <div className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: activeRegion.color }}
            />
            <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
              {activeRegion.name}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              ({graph?.nodes.length || 0} 个会话)
            </span>
          </div>
        )}

        {/* Center on active node button */}
        <button
          onClick={(e) => { e.stopPropagation(); handleCenterOnNode(); }}
          title="定位当前会话"
          style={{
            padding: '6px 10px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            backgroundColor: 'var(--bg-tertiary)',
            color: 'var(--text-muted)',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          ◎
        </button>

        {/* Layout toggle */}
        <button
          onClick={() => {
            setLayoutMode(m => m === 'dagre' ? 'force' : 'dagre');
            layoutGraph();
            setTimeout(() => handleCenterOnNode(), 50);
          }}
          style={{
            padding: '6px 10px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            backgroundColor: layoutMode === 'force' ? 'var(--accent)' : 'var(--bg-tertiary)',
            color: layoutMode === 'force' ? 'var(--bg-primary)' : 'var(--text-muted)',
            fontSize: '12px',
            cursor: 'pointer',
          }}
          title={layoutMode === 'dagre' ? '切换到力导向布局' : '切换到层级布局'}
        >
          {layoutMode === 'dagre' ? '⊞' : '◎'}
        </button>

        {/* BigBang button - only show when node count >= 3 */}
        {(graph?.nodes.length || 0) >= 3 && (
          <button
            onClick={async () => {
              if (activeRegionId) {
                await startBigBangAnalysis(activeRegionId);
              }
              setShowBigBang(true);
            }}
            style={{
              marginLeft: 'auto',
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--accent)',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            💥 大爆炸
          </button>
        )}
      </div>

      {/* Graph area */}
      <div style={{ flex: 1 }}>
        {!graph || graph.nodes.length === 0 ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'var(--text-muted)',
          }}>
            在左侧创建新会话查看图谱
          </div>
        ) : (
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <ReactFlow
              ref={rfInstance}
              onInit={(instance) => { rfInstance.current = instance; }}
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={handleNodeClick}
              onNodeDoubleClick={handleNodeDoubleClick}
              nodeTypes={nodeTypes}
              fitView
              attributionPosition="bottom-left"
              minZoom={0.1}
              maxZoom={2}
            >
              <Controls showZoom showFitView showInteractive={false} />
              <MiniMap
                nodeColor={(node) => {
                  if (node.type === 'knowledgePoint') return 'var(--success)';
                  if (node.data?.isActive) return 'var(--accent)';
                  return 'var(--bg-tertiary)';
              }}
              maskColor="rgba(0,0,0,0.5)"
              style={{ backgroundColor: 'var(--bg-secondary)' }}
            />
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="var(--border)"
            />
            </ReactFlow>
          </div>
        )}
      </div>

      <BigBangModal isOpen={showBigBang} onClose={() => setShowBigBang(false)} />
    </div>
  );
}
