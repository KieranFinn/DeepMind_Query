import { useCallback, useEffect, useMemo } from 'react';
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
import { useConversationStore } from '../store';

const nodeTypes: NodeTypes = { nodeCard: NodeCard };

interface Props {
  onNodeClick?: (nodeId: string) => void;
}

export default function KnowledgeGraph({ onNodeClick }: Props) {
  const { tree, activeNodeId } = useConversationStore();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Find path from root to active node
  const pathToActive = useMemo(() => {
    if (!tree || !activeNodeId) return new Set<string>();

    const path = new Set<string>();
    function findPath(node: ConversationNode, target: string): boolean {
      if (node.id === target) {
        path.add(node.id);
        return true;
      }
      for (const child of node.children) {
        if (findPath(child, target)) {
          path.add(node.id);
          return true;
        }
      }
      return false;
    }
    findPath(tree, activeNodeId);
    return path;
  }, [tree, activeNodeId]);

  // Count total nodes and messages for progress
  const stats = useMemo(() => {
    if (!tree) return { nodes: 0, messages: 0 };
    let nodes = 0;
    let messages = 0;
    function traverse(node: ConversationNode) {
      nodes++;
      messages += node.messages.length;
      node.children.forEach(traverse);
    }
    traverse(tree);
    return { nodes, messages };
  }, [tree]);

  // Build nodes and edges from tree
  useEffect(() => {
    if (!tree) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];
    const yStep = 150;
    const xStep = 200;

    function traverse(node: ConversationNode, depth: number, index: number) {
      const siblingCount = node.children.length;
      const baseX = 400;
      const nodeX = siblingCount > 0
        ? baseX + (index - (siblingCount - 1) / 2) * xStep
        : baseX;
      const nodeY = depth * yStep + 50;

      const isOnPath = pathToActive.has(node.id);
      const isActive = node.id === activeNodeId;

      newNodes.push({
        id: node.id,
        type: 'nodeCard',
        position: { x: nodeX, y: nodeY },
        data: {
          label: node.title,
          isActive,
          isOnPath,
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
          style: isOnPath || pathToActive.has(child.id)
            ? { stroke: 'var(--accent)', strokeWidth: 2 }
            : { stroke: 'var(--border)', strokeWidth: 1 },
        });
        traverse(child, depth + 1, i);
      });
    }

    traverse(tree, 0, 0);
    setNodes(newNodes);
    setEdges(newEdges);
  }, [tree, activeNodeId, pathToActive, setNodes, setEdges]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onNodeClick?.(node.id);
    },
    [onNodeClick]
  );

  if (!tree) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-muted)' }}>
        <div className="text-center">
          <p className="text-sm">暂无对话数据</p>
          <p className="text-xs mt-2 opacity-70">创建新对话开始探索</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {/* Progress indicator */}
      <div
        className="absolute top-3 left-3 z-10 px-3 py-1.5 rounded-lg text-xs"
        style={{
          backgroundColor: 'var(--bg-tertiary)',
          border: '1px solid var(--border)',
          color: 'var(--text-secondary)'
        }}
      >
        <span className="opacity-70">📊</span> {stats.nodes} 节点 · {stats.messages} 条消息
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-left"
        minZoom={0.1}
        maxZoom={2}
      >
        <Controls
          showZoom
          showFitView
          showInteractive={false}
        />
        <MiniMap
          nodeColor={(node) => {
            if (node.data?.isActive) return 'var(--accent)';
            if (node.data?.isOnPath) return 'var(--active-path)';
            return 'var(--bg-tertiary)';
          }}
          maskColor="rgba(0,0,0,0.5)"
          style={{
            backgroundColor: 'var(--bg-secondary)',
          }}
        />
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="var(--border)"
        />
      </ReactFlow>
    </div>
  );
}
