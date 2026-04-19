import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

interface KnowledgePointData {
  label: string;
  content: string;
  score?: number;
  sourceNodeId?: string;
}

function KnowledgePointCard({ data, selected }: NodeProps<KnowledgePointData>) {
  const { label, content, score } = data;

  const getScoreColor = () => {
    if (!score) return 'var(--text-muted)';
    if (score >= 0.8) return 'var(--success)';
    if (score >= 0.5) return 'var(--accent)';
    return 'var(--text-muted)';
  };

  return (
    <div
      className="relative px-3 py-2 text-center transition-all duration-200 hover:scale-105"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: '8px',
        boxShadow: selected
          ? '0 4px 20px rgba(212, 165, 116, 0.3)'
          : '0 2px 8px rgba(0,0,0,0.3)',
        minWidth: '100px',
        maxWidth: '180px',
      }}
    >
      {/* Diamond shape indicator - top */}
      <div
        className="absolute"
        style={{
          top: '-8px',
          left: '50%',
          transform: 'translateX(-50%) rotate(45deg)',
          width: '12px',
          height: '12px',
          backgroundColor: 'var(--accent)',
          border: '1px solid var(--border)',
        }}
      />

      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2"
        style={{ backgroundColor: 'var(--accent)' }}
      />

      <div
        className="text-xs font-medium truncate"
        style={{ color: 'var(--text-primary)' }}
        title={label}
      >
        {label}
      </div>

      {content && (
        <div
          className="text-xs mt-1 truncate opacity-70"
          style={{ color: 'var(--text-muted)' }}
          title={content}
        >
          {content.slice(0, 40)}{content.length > 40 ? '...' : ''}
        </div>
      )}

      {score !== undefined && (
        <div
          className="text-xs mt-1 font-medium"
          style={{ color: getScoreColor() }}
        >
          {Math.round(score * 100)}%
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2"
        style={{ backgroundColor: 'var(--accent)' }}
      />
    </div>
  );
}

export default memo(KnowledgePointCard);
