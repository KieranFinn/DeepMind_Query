import { useEffect } from 'react';
import ReactFlow, { Node, Controls, Background, MiniMap, useNodesState, useEdgesState, BackgroundVariant } from 'reactflow';
import 'reactflow/dist/style.css';
import NodeCard from './NodeCard';
import { useStore } from '../store';

const nodeTypes = { nodeCard: NodeCard };

interface MapViewerProps {
  onClose?: () => void;
}

export default function MapViewer({ onClose }: MapViewerProps) {
  const { graph, activeNodeId, getActiveRegion, setActiveNode, createChildNode } = useStore();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const activeRegion = getActiveRegion();

  // Build nodes and edges from graph
  useEffect(() => {
    if (!graph) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const currentGraph = graph; // Capture for closure
    const newNodes: Node[] = [];
    const newEdges: any[] = [];
    const yStep = 100;
    const xStep = 150;

    function layoutNode(nodeId: string, depth: number, index: number, siblingCount: number) {
      const node = currentGraph.nodes.find(n => String(n.id) === nodeId);
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
        });
        layoutNode(String(edge.target), depth + 1, i, childEdges.length);
      });
    }

    // Find root nodes (nodes with no parent in edges)
    const rootNodes = currentGraph.nodes.filter(n => !currentGraph.edges.some(e => String(e.target) === String(n.id)));
    rootNodes.forEach((root, i) => {
      layoutNode(String(root.id), 0, i, rootNodes.length);
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [graph, activeNodeId, setNodes, setEdges]);

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
          <ReactFlow
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
        )}
      </div>
    </div>
  );
}
