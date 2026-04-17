import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

interface NodeData {
  label: string;
  isActive: boolean;
  isOnPath: boolean;
  messageCount?: number;
  childCount?: number;
}

function NodeCard({ data, selected }: NodeProps<NodeData>) {
  const { label, isActive, isOnPath, messageCount = 0, childCount = 0 } = data;

  const getBgColor = () => {
    if (isActive) return 'var(--active-path)';
    if (isOnPath) return 'var(--bg-tertiary)';
    return 'var(--bg-secondary)';
  };

  const getBorderColor = () => {
    if (selected || isActive) return 'var(--accent)';
    return 'var(--border)';
  };

  return (
    <div
      className="px-4 py-3 rounded-full min-w-[120px] text-center transition-all duration-200 hover:scale-105"
      style={{
        backgroundColor: getBgColor(),
        border: `2px solid ${getBorderColor()}`,
        boxShadow: selected || isActive
          ? '0 4px 20px rgba(212, 165, 116, 0.2)'
          : '0 2px 8px rgba(0,0,0,0.3)',
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
      <div className="flex items-center justify-center gap-2 mt-1">
        {isActive && (
          <span className="text-xs font-medium" style={{ color: 'var(--accent)' }}>当前</span>
        )}
      </div>
      {(messageCount > 0 || childCount > 0) && (
        <div className="text-xs mt-1 opacity-60" style={{ color: 'var(--text-muted)' }}>
          💬 {messageCount} {childCount > 0 && `· 🌿 ${childCount}`}
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
