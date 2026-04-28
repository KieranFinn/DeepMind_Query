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

/* ------------------------------------------------------------------ */
/*  Force-directed layout                                              */
/* ------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
interface DraggableKnowledgeGraphProps {
  sidebarCollapsed: boolean;
}

export default function DraggableKnowledgeGraph({ sidebarCollapsed }: DraggableKnowledgeGraphProps) {
  const {
    graph,
    activeNodeId,
    getActiveRegion,
    createChildNode,
    setActiveNode,
    isBigBangAnalyzing,
    bigBangResult,
    bigBangRegionId,
    activeRegionId,
    activeNodeKnowledgePoints,
    fetchKnowledgePointsForNode,
  } = useStore();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const [isDocked, setIsDocked] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [layoutMode, setLayoutMode] = useState<'dagre' | 'force'>('dagre');

  const SIDEBAR_WIDTH = sidebarCollapsed ? 32 : 280;
  const DOCKED_HEIGHT = 160;

  /* refs */
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
    wasDocked: boolean;
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
    wasDocked: false,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const rfInstance = useRef<any>(null);
  const userPositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  const lastGraphKeyRef = useRef('');
  const fitViewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasInitialPositionRef = useRef(false);

  const activeRegion = getActiveRegion();
  const nodeCount = graph?.nodes.length || 0;

  /* ---------------------------------------------------------------- */
  /*  Initial floating position                                        */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    if (!hasInitialPositionRef.current) {
      setPosition({ x: SIDEBAR_WIDTH, y: 100 });
      hasInitialPositionRef.current = true;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------------------------------------------------------------- */
  /*  Hide ReactFlow attribution (cleaned up on unmount)               */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    const styleId = 'hide-react-flow-attribution';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = '.react-flow__attribution { display: none !important; }';
      document.head.appendChild(style);
    }
    return () => {
      const existing = document.getElementById(styleId);
      if (existing) document.head.removeChild(existing);
    };
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Window resize handler                                            */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    const handleResize = () => {
      if (!isDocked && !isCollapsed && position) {
        setPosition(prev => {
          if (!prev) return prev;
          return {
            x: Math.min(prev.x, window.innerWidth - 320),
            y: Math.min(prev.y, window.innerHeight - 240),
          };
        });
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isDocked, isCollapsed, position]);

  /* ---------------------------------------------------------------- */
  /*  Build nodes & edges from graph                                   */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    if (!graph) {
      setNodes([]);
      setEdges([]);
      lastGraphKeyRef.current = '';
      return;
    }

    const currentGraph = graph;
    const graphKey = JSON.stringify({
      nodeIds: currentGraph.nodes.map(n => n.id).sort(),
      edgeIds: currentGraph.edges.map(e => e.id).sort(),
      activeNodeId,
      kpIds: activeNodeKnowledgePoints.map(kp => kp.id).sort(),
    });

    const isSameGraph = lastGraphKeyRef.current === graphKey;
    lastGraphKeyRef.current = graphKey;

    const newNodes: Node[] = [];
    const newEdges: any[] = [];
    const yStep = 60;
    const xStep = 100;
    const nodePositions = new Map<string, { x: number; y: number }>();

    function layoutNode(nodeId: string, depth: number, index: number, siblingCount: number) {
      const node = currentGraph.nodes.find(n => String(n.id) === nodeId);
      if (!node) return;

      const nodeIdStr = String(node.id);
      const userPos = userPositions.current.get(nodeIdStr);

      const baseX = 60;
      const nodeX = userPos ? userPos.x : (siblingCount > 0
        ? baseX + (index - (siblingCount - 1) / 2) * xStep
        : baseX);
      const nodeY = userPos ? userPos.y : depth * yStep + 20;

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
            strokeWidth: 2,
          },
        });
        layoutNode(String(edge.target), depth + 1, i, childEdges.length);
      });
    }

    const rootNodes = currentGraph.nodes.filter(n => !currentGraph.edges.some(e => String(e.target) === String(n.id)));
    rootNodes.forEach((root, i) => {
      layoutNode(String(root.id), 0, i, rootNodes.length);
    });

    // Knowledge point nodes for the active node
    const activeNodePos = activeNodeId ? nodePositions.get(String(activeNodeId)) : null;
    if (activeNodePos && activeNodeKnowledgePoints.length > 0) {
      const kpCount = activeNodeKnowledgePoints.length;
      const kpStartX = activeNodePos.x + 120;
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

    // Fit view once after initial data load
    if (!isSameGraph && rfInstance.current && newNodes.length > 0) {
      if (fitViewTimerRef.current) clearTimeout(fitViewTimerRef.current);
      fitViewTimerRef.current = setTimeout(() => {
        rfInstance.current?.fitView({ duration: 300, padding: 0.2 });
      }, 50);
    }
  }, [graph, activeNodeId, activeRegion, activeNodeKnowledgePoints, setNodes, setEdges]);

  /* ---------------------------------------------------------------- */
  /*  Fetch knowledge points                                           */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    if (activeNodeId && activeRegionId) {
      fetchKnowledgePointsForNode(activeRegionId, String(activeNodeId));
    }
  }, [activeNodeId, activeRegionId, fetchKnowledgePointsForNode]);

  /* ---------------------------------------------------------------- */
  /*  Node interactions                                                */
  /* ---------------------------------------------------------------- */
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

  const handleNodesChangeWithUserPos = useCallback(
    (changes: any[]) => {
      changes.forEach((change: any) => {
        if (change.type === 'position' && change.position && !change.dragging) {
          userPositions.current.set(change.id, change.position);
        }
      });
      onNodesChange(changes);
    },
    [onNodesChange]
  );

  /* ---------------------------------------------------------------- */
  /*  Center / layout helpers                                          */
  /* ---------------------------------------------------------------- */
  const handleCenterOnNode = useCallback(() => {
    if (!rfInstance.current || !activeNodeId) return;
    try {
      const node = rfInstance.current.getNode(activeNodeId);
      if (node && node.position) {
        rfInstance.current.setCenter(
          node.position.x + 60,
          node.position.y + 20,
          { zoom: 1, duration: 300 }
        );
      }
    } catch (e) {
      console.warn('Center on node failed:', e);
    }
  }, [activeNodeId]);

  const layoutGraph = useCallback(() => {
    if (!graph || graph.nodes.length === 0) return;

    if (layoutMode === 'force') {
      setNodes(currentNodes => {
        const sessionNodes = currentNodes.filter(n => !n.id.startsWith('kp-'));
        const laidOut = applyForceLayout(sessionNodes, graph.edges);
        const laidOutMap = new Map(laidOut.map(n => [n.id, n.position]));
        return currentNodes.map(node => {
          if (node.id.startsWith('kp-')) return node;
          const newPos = laidOutMap.get(node.id);
          if (newPos) {
            userPositions.current.set(node.id, newPos);
            return { ...node, position: newPos };
          }
          return node;
        });
      });
    } else {
      const g = new dagre.graphlib.Graph();
      g.setGraph({ rankdir: 'TB', nodesep: 80, ranksep: 100 });
      g.setDefaultEdgeLabel(() => ({}));

      graph.nodes.forEach(node => g.setNode(String(node.id), { width: 150, height: 50 }));
      graph.edges.forEach(edge => g.setEdge(String(edge.source), String(edge.target)));
      dagre.layout(g);

      setNodes(currentNodes => {
        return currentNodes.map(node => {
          if (node.id.startsWith('kp-')) return node;
          const nodeId = String(node.id);
          if (!g.hasNode(nodeId)) return node;
          const pos = g.node(nodeId);
          const newPos = { x: pos.x - 75, y: pos.y - 25 };
          userPositions.current.set(node.id, newPos);
          return { ...node, position: newPos };
        });
      });
    }

    if (fitViewTimerRef.current) clearTimeout(fitViewTimerRef.current);
    fitViewTimerRef.current = setTimeout(() => {
      rfInstance.current?.fitView({ duration: 300, padding: 0.2 });
    }, 50);
  }, [graph, setNodes, layoutMode]);

  /* ---------------------------------------------------------------- */
  /*  Drag handlers (transform-based, no inline style pollution)       */
  /* ---------------------------------------------------------------- */
  const handleMouseDown = useCallback((e: React.MouseEvent, el: HTMLElement) => {
    if (
      (e.target as HTMLElement).closest('.react-flow__controls') ||
      (e.target as HTMLElement).closest('.react-flow__node') ||
      (e.target as HTMLElement).closest('.react-flow__minimap') ||
      (e.target as HTMLElement).closest('button')
    ) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();

    const rect = el.getBoundingClientRect();
    dragState.current = {
      isDragging: true,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startPosX: rect.left,
      startPosY: rect.top,
      hasMoved: false,
      element: el,
      currentMouseX: e.clientX,
      currentMouseY: e.clientY,
      wasDocked: isDocked,
    };
    el.style.cursor = 'grabbing';
    el.style.transition = 'none';
  }, [isDocked]);

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

    drag.element.style.transform = `translate(${dx}px, ${dy}px)`;
  }, []);

  const handleMouseUp = useCallback(() => {
    const drag = dragState.current;
    if (!drag.isDragging) return;

    drag.isDragging = false;
    const el = drag.element;
    drag.element = null; // fix leak

    if (!el) return;

    el.style.cursor = 'grab';
    el.style.transition = '';
    el.style.transform = '';

    if (!drag.hasMoved) return;

    const dx = drag.currentMouseX - drag.startMouseX;
    const dy = drag.currentMouseY - drag.startMouseY;
    const finalX = drag.startPosX + dx;
    const finalY = drag.startPosY + dy;

    if (drag.wasDocked) {
      // Dock area: bottom-left ~200x200 px
      const inDockArea = finalX < 200 && finalY > window.innerHeight - 200;
      if (inDockArea) {
        // Stay docked
        setIsDocked(true);
        return;
      }
      // Undock to floating, centering window on release point
      flushSync(() => {
        setPosition({
          x: Math.max(0, drag.currentMouseX - 160),
          y: Math.max(0, drag.currentMouseY - 120),
        });
        setIsDocked(false);
      });
    } else {
      // Already floating: just update position
      setPosition({ x: finalX, y: finalY });
    }
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  /* ---------------------------------------------------------------- */
  /*  Collapse / expand helpers                                        */
  /* ---------------------------------------------------------------- */
  const handleCollapse = useCallback(() => {
    setIsCollapsed(true);
  }, []);

  const handleExpand = useCallback(() => {
    // BUG FIX #1: sidebar-collapse deadlock
    // If we are docked but sidebar is collapsed, undock to floating first
    if (isDocked && sidebarCollapsed) {
      setIsDocked(false);
      setPosition(prev => prev || { x: SIDEBAR_WIDTH, y: 100 });
    }
    setIsCollapsed(false);
  }, [isDocked, sidebarCollapsed, SIDEBAR_WIDTH]);

  const handleDock = useCallback(() => {
    setIsDocked(true);
    setIsCollapsed(false);
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Render helpers                                                   */
  /* ---------------------------------------------------------------- */

  // Determine if we should show the collapsed circle
  const showCollapsed = isCollapsed || (isDocked && sidebarCollapsed);

  if (showCollapsed) {
    const collapsedX = isDocked ? 0 : (position?.x ?? SIDEBAR_WIDTH);
    const collapsedY = isDocked
      ? window.innerHeight - 52
      : (position?.y ?? 100);

    const bigBangActive = isBigBangAnalyzing && bigBangRegionId === activeRegionId;
    const bigBangDone = !!bigBangResult && bigBangRegionId === activeRegionId;

    return (
      <div
        ref={containerRef}
        onMouseDown={(e) => {
          e.stopPropagation();
          if (containerRef.current) {
            handleMouseDown(e, containerRef.current);
          }
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (!dragState.current.hasMoved) {
            handleExpand();
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
        title={
          bigBangActive
            ? '大爆炸分析中...'
            : bigBangDone
            ? '大爆炸分析完成，点击查看'
            : '展开知识图谱'
        }
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
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: 'var(--border)' }}
          />
        )}
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Docked mode                                                      */
  /* ---------------------------------------------------------------- */
  if (isDocked && !sidebarCollapsed) {
    return (
      <div
        ref={containerRef}
        onMouseDown={(e) => {
          if (containerRef.current) {
            e.stopPropagation();
            handleMouseDown(e, containerRef.current);
          }
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
        {/* Header */}
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
              onNodesChange={handleNodesChangeWithUserPos}
              onEdgesChange={onEdgesChange}
              onNodeClick={handleNodeClick}
              onNodeDoubleClick={handleNodeDoubleClick}
              nodeTypes={nodeTypes}
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

  /* ---------------------------------------------------------------- */
  /*  Floating mode                                                    */
  /* ---------------------------------------------------------------- */
  const floatX = position?.x ?? SIDEBAR_WIDTH;
  const floatY = position?.y ?? 100;

  return (
    <div
      ref={containerRef}
      onMouseDown={(e) => {
        if (
          (e.target as HTMLElement).closest('.react-flow__node') ||
          (e.target as HTMLElement).closest('.react-flow__controls') ||
          (e.target as HTMLElement).closest('.react-flow__minimap')
        ) {
          return;
        }
        if (containerRef.current) {
          handleMouseDown(e, containerRef.current);
        }
      }}
      className="fixed rounded-xl shadow-2xl overflow-hidden"
      style={{
        left: floatX,
        top: floatY,
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
          pointerEvents: 'none',
        }}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCollapse();
            }}
            className="text-xs px-2 py-1 rounded hover:opacity-80"
            style={{
              backgroundColor: 'var(--bg-hover)',
              color: 'var(--text-muted)',
              pointerEvents: 'auto',
            }}
            title="收起"
          >
            −
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDock();
            }}
            className="text-xs px-2 py-1 rounded hover:opacity-80"
            style={{
              backgroundColor: 'var(--bg-hover)',
              color: 'var(--text-muted)',
              pointerEvents: 'auto',
            }}
            title="停靠"
          >
            ↙
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setLayoutMode(m => (m === 'dagre' ? 'force' : 'dagre'));
              // layoutGraph reads layoutMode via closure, so defer
              setTimeout(() => layoutGraph(), 0);
            }}
            className="text-xs px-2 py-1 rounded hover:opacity-80"
            style={{
              backgroundColor: layoutMode === 'force' ? 'var(--accent)' : 'var(--bg-hover)',
              color: layoutMode === 'force' ? 'var(--bg-primary)' : 'var(--text-muted)',
              pointerEvents: 'auto',
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
              onInit={(instance) => {
                rfInstance.current = instance;
              }}
              nodes={nodes}
              edges={edges}
              onNodesChange={handleNodesChangeWithUserPos}
              onEdgesChange={onEdgesChange}
              onNodeClick={handleNodeClick}
              onNodeDoubleClick={handleNodeDoubleClick}
              nodeTypes={nodeTypes}
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
              onClick={(e) => {
                e.stopPropagation();
                handleCenterOnNode();
              }}
              className="absolute w-7 h-7 flex items-center justify-center rounded hover:opacity-80"
              style={{
                backgroundColor: 'var(--bg-hover)',
                color: 'var(--text-muted)',
                bottom: '8px',
                left: '8px',
                zIndex: 10,
                pointerEvents: 'auto',
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
