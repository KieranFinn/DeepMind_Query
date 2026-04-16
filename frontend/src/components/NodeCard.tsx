import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

interface NodeData {
  label: string;
  isActive: boolean;
  isOnPath: boolean;
}

function NodeCard({ data, selected }: NodeProps<NodeData>) {
  const { label, isActive, isOnPath } = data;

  const getBgColor = () => {
    if (isActive) return 'var(--active-path)';
    if (isOnPath) return 'var(--bg-tertiary)';
    return 'var(--bg-secondary)';
  };

  const getBorderColor = () => {
    if (selected) return 'var(--accent)';
    if (isActive) return 'var(--accent)';
    if (isOnPath) return 'var(--border-light)';
    return 'var(--border)';
  };

  return (
    <div
      className="px-4 py-3 rounded-lg min-w-[140px] text-center transition-all duration-200 hover:scale-105"
      style={{
        backgroundColor: getBgColor(),
        border: `2px solid ${getBorderColor()}`,
        boxShadow: selected || isActive ? '0 4px 20px rgba(212, 165, 116, 0.15)' : '0 2px 8px rgba(0,0,0,0.2)',
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 transition-all"
        style={{ backgroundColor: 'var(--border-light)' }}
      />
      <div
        className="text-sm font-medium truncate max-w-[160px]"
        style={{ color: isActive ? 'var(--accent)' : 'var(--text-primary)' }}
      >
        {label}
      </div>
      {isActive && (
        <div className="text-xs mt-1" style={{ color: 'var(--accent)' }}>
          当前
        </div>
      )}
      {isOnPath && !isActive && (
        <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          路径
        </div>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 transition-all"
        style={{ backgroundColor: 'var(--border-light)' }}
      />
    </div>
  );
}

export default memo(NodeCard);
