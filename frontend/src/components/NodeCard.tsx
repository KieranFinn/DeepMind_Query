import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

interface NodeData {
  label: string;
  isActive: boolean;
  isOnPath: boolean;
}

function NodeCard({ data, selected }: NodeProps<NodeData>) {
  const { label, isActive, isOnPath } = data;

  return (
    <div
      className={`
        px-4 py-2 rounded-lg border-2 min-w-[120px] text-center
        transition-all duration-200
        ${selected ? 'border-blue-500 shadow-lg' : 'border-gray-300'}
        ${isActive ? 'bg-blue-50 border-blue-400' : isOnPath ? 'bg-green-50 border-green-400' : 'bg-white'}
      `}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-400 !w-2 !h-2" />
      <div className="text-sm font-medium text-gray-800 truncate max-w-[150px]">
        {label}
      </div>
      {isActive && <div className="text-xs text-blue-500 mt-1">当前</div>}
      <Handle type="source" position={Position.Bottom} className="!bg-gray-400 !w-2 !h-2" />
    </div>
  );
}

export default memo(NodeCard);
