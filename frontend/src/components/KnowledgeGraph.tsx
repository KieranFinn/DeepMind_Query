import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  NodeTypes,
  BackgroundVariant,
} from 'reactflow';
import 'reactflow/dist/style.css';
import NodeCard from './NodeCard';
import { ConversationNode } from '../types';
import { useStore } from '../store';

const nodeTypes: NodeTypes = { nodeCard: NodeCard };

export default function KnowledgeGraph() {
  const { activeTree, getActiveRegion, createBranch, setActiveSession } = useStore();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const activeRegion = getActiveRegion();

  // Build nodes and edges from tree
  useEffect(() => {
    if (!activeTree) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];
    const yStep = 120;
    const xStep = 180;

    function traverse(node: ConversationNode, depth: number, index: number, siblingCount: number) {
      const baseX = 200;
      const nodeX = siblingCount > 0
        ? baseX + (index - (siblingCount - 1) / 2) * xStep
        : baseX;
      const nodeY = depth * yStep + 40;

      newNodes.push({
        id: node.id,
        type: 'nodeCard',
        position: { x: nodeX, y: nodeY },
        data: {
          label: node.title,
          isActive: node.id === activeTree.id,
          isOnPath: true,
          messageCount: node.messages.length,
          childCount: node.children.length,
        },
      });

      node.children.forEach((child, i) => {
        newEdges.push({
          id: `${node.id}-${child.id}`,
          source: node.id,
          target: child.id,
          type: 'smoothstep',
          style: {
            stroke: activeRegion?.color || 'var(--accent)',
            strokeWidth: 2
          },
        });
        traverse(child, depth + 1, i, node.children.length);
      });
    }

    traverse(activeTree, 0, 0, 0);
    setNodes(newNodes);
    setEdges(newEdges);
  }, [activeTree, activeRegion, setNodes, setEdges]);

  const handleNodeClick = useCallback(
    async (_: React.MouseEvent, node: Node) => {
      // Clicking a node in the graph switches to that conversation context
      // For now, clicking switches to that node's session
      // In the new model, the tree IS the session, so we just highlight
    },
    []
  );

  const handleNodeDoubleClick = useCallback(
    async (_: React.MouseEvent, node: Node) => {
      // Double-click to create a branch from this node
      if (activeTree && node.id !== activeTree.id) {
        await createBranch(node.id, `分支 ${activeTree.children.length + 1}`);
      }
    },
    [activeTree, createBranch]
  );

  if (!activeTree) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-muted)' }}>
        <div className="text-center">
          <p className="text-sm">选择或创建一个会话</p>
          <p className="text-xs mt-2 opacity-70">知识图谱将在此处显示</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {/* Region indicator */}
      {activeRegion && (
        <div
          className="absolute top-3 left-3 z-10 px-3 py-1.5 rounded-lg text-xs flex items-center gap-2"
          style={{
            backgroundColor: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)'
          }}
        >
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: activeRegion.color }}
          />
          {activeRegion.name}
        </div>
      )}

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
            if (node.data?.isActive) return activeRegion?.color || 'var(--accent)';
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

      {/* Hint */}
      <div
        className="absolute bottom-3 left-3 z-10 text-xs"
        style={{ color: 'var(--text-muted)' }}
      >
        双击节点创建追问分支
      </div>
    </div>
  );
}
