import { useState, useRef, useCallback, useEffect } from 'react';
import { useNodesState, useEdgesState } from 'reactflow';
import ReactFlow, { Node, Controls, Background, BackgroundVariant } from 'reactflow';
import 'reactflow/dist/style.css';
import NodeCard from './NodeCard';
import { useStore } from '../store';

const nodeTypes = { nodeCard: NodeCard };

interface DraggableKnowledgeGraphProps {
  sidebarCollapsed: boolean;
}

export default function DraggableKnowledgeGraph({ sidebarCollapsed }: DraggableKnowledgeGraphProps) {
  const { graph, activeNodeId, getActiveRegion, createChildNode, setActiveNode, isBigBangAnalyzing, bigBangResult, bigBangRegionId, activeRegionId } = useStore();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const [isDocked, setIsDocked] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isExpanding, setIsExpanding] = useState(false);
  const [expandOrigin, setExpandOrigin] = useState({ x: 0, y: 0 });
  const dragState = useRef<{
    isDragging: boolean;
    startMouseX: number;
    startMouseY: number;
    startPosX: number;
    startPosY: number;
    hasMoved: boolean;
    element: HTMLElement | null;
    shouldUndock: boolean;
  }>({
    isDragging: false,
    startMouseX: 0,
    startMouseY: 0,
    startPosX: 0,
    startPosY: 0,
    hasMoved: false,
    element: null,
    shouldUndock: false,
  });
  const draggedFlag = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeRegion = getActiveRegion();
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

      const childEdges = currentGraph.edges.filter(e => String(e.source) === nodeIdStr);
      childEdges.forEach((edge, i) => {
        newEdges.push({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: 'smoothstep',
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

    setNodes(newNodes);
    setEdges(newEdges);
  }, [graph, activeNodeId, activeRegion, setNodes, setEdges]);

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
      shouldUndock: false,
    };
    el.style.cursor = 'grabbing';
    el.style.transition = 'none';
  }, [position]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const drag = dragState.current;
    if (!drag.isDragging || !drag.element) return;

    const dx = e.clientX - drag.startMouseX;
    const dy = e.clientY - drag.startMouseY;

    if (!drag.hasMoved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      drag.hasMoved = true;
      // Mark for undocking after drag ends
      if (isDocked) {
        dragState.current.shouldUndock = true;
      }
    }

    drag.element.style.left = `${drag.startPosX + dx}px`;
    drag.element.style.top = `${drag.startPosY + dy}px`;
  }, [isDocked]);

  const handleMouseUp = useCallback(() => {
    const drag = dragState.current;
    if (!drag.isDragging) return;

    drag.isDragging = false;
    const wasDragged = drag.hasMoved;
    const shouldUndock = drag.shouldUndock;
    const dragStartX = drag.startMouseX;
    const dragStartY = drag.startMouseY;

    if (drag.element) {
      drag.element.style.cursor = 'grab';
      if (drag.hasMoved) {
        const newX = parseInt(drag.element.style.left);
        const newY = parseInt(drag.element.style.top);
        setPosition({ x: newX, y: newY });

        // Check if dragged back to dock area
        const windowHeight = window.innerHeight;
        if (newX < 100 && newY > windowHeight - 300) {
          setIsDocked(true);
        } else if (shouldUndock) {
          // Set expand origin to where user grabbed (bottom-left of docked graph)
          setExpandOrigin({ x: dragStartX, y: dragStartY });
          setIsExpanding(true);
          setIsDocked(false);
        }
      }
    }

    drag.hasMoved = false;
    drag.shouldUndock = false;
    draggedFlag.current = wasDragged;
    setTimeout(() => { draggedFlag.current = false; }, 0);
  }, []);

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
          if (!draggedFlag.current) {
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
            {graph?.nodes.length || 0}
          </span>
        </div>

        {/* Mini Graph */}
        <div className="w-full" style={{ height: DOCKED_HEIGHT - 36 }}>
          {!graph || graph.nodes.length === 0 ? (
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
  const floatingStyle = isExpanding ? {
    left: expandOrigin.x - 16,
    top: expandOrigin.y - 16,
    width: '32px',
    height: '32px',
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    zIndex: 50,
    cursor: 'grab',
    animation: 'expandFromAnchor 0.3s ease-out forwards',
    transformOrigin: 'top left',
  } : {
    left: position.x ?? SIDEBAR_WIDTH,
    top: position.y ?? 100,
    width: '320px',
    height: '240px',
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    zIndex: 50,
    cursor: 'grab',
  };

  // After expansion animation, clear the expanding state
  useEffect(() => {
    if (isExpanding) {
      const timer = setTimeout(() => setIsExpanding(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isExpanding]);

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
      className={`fixed rounded-xl shadow-2xl overflow-hidden ${isExpanding ? '' : ''}`}
      style={floatingStyle}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{
          backgroundColor: 'var(--bg-tertiary)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); setIsCollapsed(true); }}
            className="text-xs px-2 py-1 rounded hover:opacity-80"
            style={{
              backgroundColor: 'var(--bg-hover)',
              color: 'var(--text-muted)',
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
            }}
            title="停靠"
          >
            ↙
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
          {graph?.nodes.length || 0}
        </span>
      </div>

      {/* Graph */}
      <div className="w-full h-full">
        {!graph || graph.nodes.length === 0 ? (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ color: 'var(--text-muted)', fontSize: '12px' }}
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
        )}
      </div>
    </div>
  );
}
