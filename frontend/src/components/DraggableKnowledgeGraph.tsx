import { useState, useRef, useCallback, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { useNodesState, useEdgesState } from 'reactflow';
import ReactFlow, { Node, Controls, Background, BackgroundVariant } from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css';
import NodeCard from './NodeCard';
import KnowledgePointCard from './KnowledgePointCard';
import { useStore } from '../store';

const nodeTypes = { nodeCard: NodeCard, knowledgePoint: KnowledgePointCard };

// Simple force-directed layout
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
  const centerX = 160;
  const centerY = 120;

  // Build adjacency for attraction calculation
  const adjacency = new Map<string, Set<string>>();
  nodesCopy.forEach(n => adjacency.set(n.id, new Set()));
  edges.forEach(e => {
    adjacency.get(e.source)?.add(e.target);
    adjacency.get(e.target)?.add(e.source);
  });

  for (let iter = 0; iter < iterations; iter++) {
    // Repulsion between all nodes
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

    // Attraction along edges
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

    // Center gravity
    nodesCopy.forEach(node => {
      node.vx += (centerX - node.position.x) * 0.01;
      node.vy += (centerY - node.position.y) * 0.01;
    });

    // Apply velocities with damping
    nodesCopy.forEach(node => {
      node.position.x += node.vx;
      node.position.y += node.vy;
      node.vx *= damping;
      node.vy *= damping;
    });
  }

  // Normalize positions to be non-negative and centered
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

interface DraggableKnowledgeGraphProps {
  sidebarCollapsed: boolean;
}

export default function DraggableKnowledgeGraph({ sidebarCollapsed }: DraggableKnowledgeGraphProps) {
  const { graph, activeNodeId, getActiveRegion, createChildNode, setActiveNode, isBigBangAnalyzing, bigBangResult, bigBangRegionId, activeRegionId, activeNodeKnowledgePoints, fetchKnowledgePointsForNode } = useStore();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const [isDocked, setIsDocked] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [layoutMode, setLayoutMode] = useState<'dagre' | 'force'>('dagre');
  const dragState = useRef<{
    isDragging: boolean;
    startMouseX: number;
    startMouseY: number;
    startPosX: number;
    startPosY: number;
    hasMoved: boolean;
    element: HTMLElement | null;
    currentMouseX: number;
    currentMouseY: number;
  }>({
    isDragging: false,
    startMouseX: 0,
    startMouseY: 0,
    startPosX: 0,
    startPosY: 0,
    hasMoved: false,
    element: null,
    currentMouseX: 0,
    currentMouseY: 0,
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const rfInstance = useRef<any>(null);

  const activeRegion = getActiveRegion();
  const nodeCount = graph?.nodes.length || 0;
  const SIDEBAR_WIDTH = sidebarCollapsed ? 32 : 280;
  const DOCKED_HEIGHT = 160;

  // Hide ReactFlow attribution
  useEffect(() => {
    const styleId = 'hide-react-flow-attribution';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = '.react-flow__attribution { display: none !important; }';
      document.head.appendChild(style);
    }
  }, []);

  // Build nodes and edges from graph
  useEffect(() => {
    if (!graph) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const currentGraph = graph;
    const newNodes: Node[] = [];
    const newEdges: any[] = [];
    const yStep = 60;
    const xStep = 100;

    // Track positions of session nodes for KP placement
    const nodePositions: Map<string, { x: number; y: number }> = new Map();

    function layoutNode(nodeId: string, depth: number, index: number, siblingCount: number) {
      const node = currentGraph.nodes.find(n => String(n.id) === nodeId);
      if (!node) return;

      const nodeIdStr = String(node.id);
      const baseX = 60;
      const nodeX = siblingCount > 0
        ? baseX + (index - (siblingCount - 1) / 2) * xStep
        : baseX;
      const nodeY = depth * yStep + 20;

      newNodes.push({
        id: node.id,
        type: 'nodeCard',
        position: { x: nodeX, y: nodeY },
        data: {
          label: node.title,
          isActive: nodeIdStr === activeNodeId,
          isOnPath: true,
          messageCount: node.messages.length,
          childCount: currentGraph.edges.filter(e => String(e.source) === nodeIdStr).length,
        },
      });

      // Store position for KP placement
      nodePositions.set(nodeIdStr, { x: nodeX, y: nodeY });

      const childEdges = currentGraph.edges.filter(e => String(e.source) === nodeIdStr);
      childEdges.forEach((edge, i) => {
        newEdges.push({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: 'default',
          style: {
            stroke: activeRegion?.color || 'var(--accent)',
            strokeWidth: 2
          },
        });
        layoutNode(String(edge.target), depth + 1, i, childEdges.length);
      });
    }

    const rootNodes = currentGraph.nodes.filter(n => !currentGraph.edges.some(e => String(e.target) === String(n.id)));
    rootNodes.forEach((root, i) => {
      layoutNode(String(root.id), 0, i, rootNodes.length);
    });

    // Add knowledge point nodes for the active node
    const activeNodePos = activeNodeId ? nodePositions.get(String(activeNodeId)) : null;
    if (activeNodePos && activeNodeKnowledgePoints.length > 0) {
      const kpCount = activeNodeKnowledgePoints.length;
      const kpStartX = activeNodePos.x + 120; // Place to the right of the session node
      const kpStartY = activeNodePos.y - (kpCount * 25);

      activeNodeKnowledgePoints.forEach((kp, i) => {
        const kpId = `kp-${kp.id}`;
        newNodes.push({
          id: kpId,
          type: 'knowledgePoint',
          position: { x: kpStartX, y: kpStartY + i * 55 },
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
          style: {
            stroke: 'var(--accent)',
            strokeWidth: 1.5,
            strokeDasharray: '5,5',
          },
        });
      });
    }

    setNodes(newNodes);
    setEdges(newEdges);
  }, [graph, activeNodeId, activeRegion, activeNodeKnowledgePoints, setNodes, setEdges]);

  // Fetch knowledge points when active node changes
  useEffect(() => {
    if (activeNodeId && activeRegionId) {
      fetchKnowledgePointsForNode(activeRegionId, String(activeNodeId));
    }
  }, [activeNodeId, activeRegionId, fetchKnowledgePointsForNode]);

  const handleNodeClick = useCallback(
    async (_: React.MouseEvent, node: Node) => {
      if (node.id !== activeNodeId) {
        await setActiveNode(node.id);
      }
    },
    [activeNodeId, setActiveNode]
  );

  const handleNodeDoubleClick = useCallback(
    async (_: React.MouseEvent, node: Node) => {
      if (graph) {
        await createChildNode(String(node.id), `分支 ${String(node.id).slice(0, 8)}`);
      }
    },
    [graph, createChildNode]
  );

  const handleCenterOnNode = useCallback(() => {
    if (!rfInstance.current || !activeNodeId) return;

    try {
      const node = rfInstance.current.getNode(activeNodeId);
      if (node && node.position) {
        rfInstance.current.setCenter(
          node.position.x + 60, // center of node width (approximate)
          node.position.y + 20, // center of node height (approximate)
          { zoom: 1, duration: 300 }
        );
      } else {
        // Fallback: fit view if node not found
        rfInstance.current.fitView({ duration: 300 });
      }
    } catch (e) {
      console.warn('Center on node failed:', e);
      try {
        rfInstance.current?.fitView({ duration: 300 });
      } catch {}
    }
  }, [activeNodeId]);

  const layoutGraph = useCallback(() => {
    if (!graph || graph.nodes.length === 0) return;

    if (layoutMode === 'force') {
      // Force-directed layout
      setNodes(nodes => applyForceLayout(nodes, graph.edges));
    } else {
      // Dagre hierarchical layout
      const g = new dagre.graphlib.Graph();
      g.setGraph({ rankdir: 'TB', nodesep: 80, ranksep: 100 });
      g.setDefaultEdgeLabel(() => ({}));

      // Add nodes
      graph.nodes.forEach(node => {
        g.setNode(node.id, { width: 150, height: 50 });
      });

      // Add edges
      graph.edges.forEach(edge => {
        g.setEdge(edge.source, edge.target);
      });

      // Calculate layout
      dagre.layout(g);

      // Update node positions
      setNodes(nodes => nodes.map(node => {
        const pos = g.node(node.id);
        return {
          ...node,
          position: { x: pos.x - 75, y: pos.y - 25 }
        };
      }));
    }
  }, [graph, setNodes, layoutMode]);

  const handleMouseDown = useCallback((e: React.MouseEvent, el: HTMLElement) => {
    if ((e.target as HTMLElement).closest('.react-flow__controls') ||
        (e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    e.stopPropagation();

    dragState.current = {
      isDragging: true,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startPosX: parseInt(el.style.left) || position.x,
      startPosY: parseInt(el.style.top) || position.y,
      hasMoved: false,
      element: el,
      currentMouseX: e.clientX,
      currentMouseY: e.clientY,
    };
    el.style.cursor = 'grabbing';
    el.style.transition = 'none';
  }, [position]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const drag = dragState.current;
    if (!drag.isDragging || !drag.element) return;

    const dx = e.clientX - drag.startMouseX;
    const dy = e.clientY - drag.startMouseY;

    drag.currentMouseX = e.clientX;
    drag.currentMouseY = e.clientY;

    if (!drag.hasMoved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      drag.hasMoved = true;
    }

    drag.element.style.left = `${drag.startPosX + dx}px`;
    drag.element.style.top = `${drag.startPosY + dy}px`;
  }, []);

  const handleMouseUp = useCallback(() => {
    const drag = dragState.current;
    if (!drag.isDragging) return;

    drag.isDragging = false;

    if (drag.element) {
      drag.element.style.cursor = 'grab';
      if (drag.hasMoved) {
        if (!isDocked) {
          // Update position state to match the DOM position where we dragged to
          const finalX = parseInt(drag.element.style.left);
          const finalY = parseInt(drag.element.style.top);
          setPosition({ x: finalX, y: finalY });
        } else {
          // Docked mode: check if dragged back to dock area
          const newX = parseInt(drag.element.style.left);
          const newY = parseInt(drag.element.style.top);

          const windowHeight = window.innerHeight;
          const shouldUndock = !(newX < 100 && newY > windowHeight - 300);

          if (shouldUndock) {
            // Undock: use flushSync, snap to cursor
            flushSync(() => {
              setPosition({ x: drag.currentMouseX - 16, y: drag.currentMouseY - 16 });
              setIsDocked(false);
            });
          } else {
            // Normal docked drag: update position but stay docked
            setIsDocked(true);
            // Update position so if we undock later, we start from here
            const finalX = drag.startPosX + (drag.currentMouseX - drag.startMouseX);
            const finalY = drag.startPosY + (drag.currentMouseY - drag.startMouseY);
            setPosition({ x: finalX, y: finalY });
          }
        }
      }
    }

    drag.hasMoved = false;
  }, [isDocked]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Collapsed circle view - shown when:
  // 1. isCollapsed is true (user clicked collapse)
  // 2. OR (isDocked AND sidebarCollapsed) - sidebar collapsed means we collapse too
  if (isCollapsed || (isDocked && sidebarCollapsed)) {
    // When collapsed from docked mode, position at dock location
    const collapsedX = isDocked ? 0 : position.x;
    const collapsedY = isDocked ? window.innerHeight - 52 : position.y;

    // Determine BigBang status for this region
    const bigBangActive = isBigBangAnalyzing && bigBangRegionId === activeRegionId;
    const bigBangDone = !!bigBangResult && bigBangRegionId === activeRegionId;

    return (
      <div
        ref={containerRef}
        onMouseDown={(e) => {
          e.stopPropagation();
          if (containerRef.current) {
            const el = containerRef.current;
            el.style.left = `${e.clientX - 16}px`;
            el.style.top = `${e.clientY - 16}px`;
            handleMouseDown(e, el);
          }
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (!dragState.current.hasMoved) {
            setIsCollapsed(false);
          }
        }}
        className="fixed flex items-center justify-center rounded-full shadow-lg"
        style={{
          left: collapsedX,
          top: collapsedY,
          width: '32px',
          height: '32px',
          backgroundColor: 'var(--bg-tertiary)',
          border: '2px solid var(--accent)',
          zIndex: 61,
          cursor: 'grab',
        }}
        title={bigBangActive ? '大爆炸分析中...' : bigBangDone ? '大爆炸分析完成，点击查看' : '展开知识图谱'}
      >
        {bigBangActive ? (
          <span className="text-sm animate-pulse">💥</span>
        ) : bigBangDone ? (
          <span className="text-sm">💥</span>
        ) : activeRegion ? (
          <span
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: activeRegion.color }}
          />
        ) : (
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--border)' }} />
        )}
      </div>
    );
  }

  // Docked mode - only shown when sidebar is expanded
  if (isDocked && !sidebarCollapsed) {
    return (
      <div
        ref={containerRef}
        onMouseDown={(e) => {
          // Only start drag if moved enough from click position
          if (containerRef.current) {
            e.stopPropagation();
            const el = containerRef.current;
            const rect = el.getBoundingClientRect();
            el.style.left = `${rect.left}px`;
            el.style.top = `${rect.top}px`;
            el.style.bottom = 'auto';
            handleMouseDown(e, el);
          }
        }}
        onClick={(e) => {
          e.stopPropagation();
          // Docked mode is mini view, no expand needed
        }}
        className="fixed rounded-t-xl overflow-hidden shadow-lg"
        style={{
          left: 0,
          bottom: '50px',
          width: '280px',
          height: `${DOCKED_HEIGHT}px`,
          backgroundColor: 'var(--bg-secondary)',
          borderTop: '1px solid var(--border)',
          borderRight: '1px solid var(--border)',
          zIndex: 60,
          cursor: 'grab',
        }}
      >
        {/* Header - 仅显示，无控制按钮 */}
        <div
          className="flex items-center gap-1.5 px-2 py-1.5"
          style={{
            backgroundColor: 'var(--bg-tertiary)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          {activeRegion && (
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: activeRegion.color }}
            />
          )}
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            图谱
          </span>
          <span className="text-xs" style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {nodeCount}
          </span>
        </div>

        {/* Mini Graph */}
        <div className="w-full" style={{ height: DOCKED_HEIGHT - 36 }}>
          {nodeCount === 0 ? (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ color: 'var(--text-muted)', fontSize: '11px' }}
            >
              空
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={handleNodeClick}
              onNodeDoubleClick={handleNodeDoubleClick}
              nodeTypes={nodeTypes}
              fitView
              minZoom={0.1}
              maxZoom={1}
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={12}
                size={1}
                color="var(--border)"
              />
            </ReactFlow>
          )}
        </div>
      </div>
    );
  }

  // Floating mode
  return (
    <div
      ref={containerRef}
      onMouseDown={(e) => {
        // Don't start window drag if clicking on ReactFlow nodes or controls
        if ((e.target as HTMLElement).closest('.react-flow__node') ||
            (e.target as HTMLElement).closest('.react-flow__controls') ||
            (e.target as HTMLElement).closest('.react-flow__minimap')) {
          return;
        }
        containerRef.current && handleMouseDown(e, containerRef.current);
      }}
      className="fixed rounded-xl shadow-2xl overflow-hidden"
      style={{
        left: position.x ?? SIDEBAR_WIDTH,
        top: position.y ?? 100,
        width: '320px',
        height: '240px',
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        zIndex: 50,
        cursor: 'grab',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{
          backgroundColor: 'var(--bg-tertiary)',
          borderBottom: '1px solid var(--border)',
          pointerEvents: 'none', // Let parent handle drags
        }}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); setIsCollapsed(true); }}
            className="text-xs px-2 py-1 rounded hover:opacity-80"
            style={{
              backgroundColor: 'var(--bg-hover)',
              color: 'var(--text-muted)',
              pointerEvents: 'auto', // Re-enable click on button
            }}
            title="收起"
          >
            −
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setIsDocked(true); }}
            className="text-xs px-2 py-1 rounded hover:opacity-80"
            style={{
              backgroundColor: 'var(--bg-hover)',
              color: 'var(--text-muted)',
              pointerEvents: 'auto', // Re-enable click on button
            }}
            title="停靠"
          >
            ↙
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setLayoutMode(m => m === 'dagre' ? 'force' : 'dagre');
              layoutGraph();
              setTimeout(() => handleCenterOnNode(), 50);
            }}
            className="text-xs px-2 py-1 rounded hover:opacity-80"
            style={{
              backgroundColor: layoutMode === 'force' ? 'var(--accent)' : 'var(--bg-hover)',
              color: layoutMode === 'force' ? 'var(--bg-primary)' : 'var(--text-muted)',
              pointerEvents: 'auto', // Re-enable click on button
            }}
            title={layoutMode === 'dagre' ? '切换到力导向布局' : '切换到层级布局'}
          >
            {layoutMode === 'dagre' ? '⊞' : '◎'}
          </button>
          {activeRegion && (
            <>
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: activeRegion.color }}
              />
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                {activeRegion.name}
              </span>
            </>
          )}
        </div>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {nodeCount}
        </span>
      </div>

      {/* Graph */}
      <div className="w-full h-full" style={{ position: 'relative' }}>
        {nodeCount === 0 ? (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ color: 'var(--text-muted)', fontSize: '12px' }}
          >
            空
          </div>
        ) : (
          <>
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
              minZoom={0.1}
              maxZoom={1.5}
            >
              <Controls showZoom={false} showFitView={false} showInteractive={false} />
              <Background
                variant={BackgroundVariant.Dots}
                gap={16}
                size={1}
                color="var(--border)"
              />
            </ReactFlow>
            {/* Center on active node button */}
            <button
              onClick={(e) => { e.stopPropagation(); handleCenterOnNode(); }}
              className="absolute w-7 h-7 flex items-center justify-center rounded hover:opacity-80"
              style={{
                backgroundColor: 'var(--bg-hover)',
                color: 'var(--text-muted)',
                bottom: '8px',
                left: '8px',
                zIndex: 10,
                pointerEvents: 'auto', // Re-enable click on button
              }}
              title="回到会话"
            >
              ◎
            </button>
          </>
        )}
      </div>
    </div>
  );
}
