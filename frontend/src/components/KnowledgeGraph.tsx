import { useCallback, useEffect, useMemo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  NodeTypes,
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

  // Build nodes and edges from tree - use useEffect for side effects
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
      // Position formula: space children evenly at each level
      const siblingCount = node.children.length;
      const baseX = 400;
      const nodeX = siblingCount > 0
        ? baseX + (index - (siblingCount - 1) / 2) * xStep
        : baseX;
      const nodeY = depth * yStep + 50;

      newNodes.push({
        id: node.id,
        type: 'nodeCard',
        position: { x: nodeX, y: nodeY },
        data: {
          label: node.title,
          isActive: node.id === activeNodeId,
          isOnPath: pathToActive.has(node.id),
        },
      });

      node.children.forEach((child, i) => {
        newEdges.push({
          id: `${node.id}-${child.id}`,
          source: node.id,
          target: child.id,
          type: 'smoothstep',
          style: pathToActive.has(child.id)
            ? { stroke: '#22c55e', strokeWidth: 2 }
            : { stroke: '#94a3b8', strokeWidth: 1 },
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
      <div className="flex items-center justify-center h-full text-gray-400">
        暂无对话数据
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={handleNodeClick}
      nodeTypes={nodeTypes}
      fitView
      attributionPosition="bottom-left"
    >
      <Controls />
      <Background />
    </ReactFlow>
  );
}
