import { useState } from 'react';
import { useStore } from '../store';

interface FollowUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateFollowUp: (title: string, link: boolean) => void;
}

export default function FollowUpModal({ isOpen, onClose, onCreateFollowUp }: FollowUpModalProps) {
  const { activeRegionId, activeNodeId, followUpSummary, followUpDirections, followUpPending } = useStore();
  const [customInput, setCustomInput] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  if (!isOpen) return null;

  const handleSelectDirection = (direction: string) => {
    if (activeRegionId && activeNodeId) {
      onClose();
      onCreateFollowUp(direction, true);
    }
  };

  const handleCustomSubmit = () => {
    if (!customInput.trim()) return;
    setShowConfirm(true);
  };

  const handleConfirmNoLink = () => {
    onClose();
    onCreateFollowUp(customInput.trim(), true);
  };

  const handleNoLink = () => {
    onClose();
    onCreateFollowUp('', false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in"
      style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
      onClick={onClose}
    >
      <div
        className="w-[520px] max-w-[90vw] max-h-[80vh] overflow-y-auto rounded-2xl p-6 animate-fade-in"
        style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold" style={{ color: 'var(--accent)' }}>
              💭 智能追问
            </h2>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              基于当前会话的延伸方向
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-2xl hover:opacity-70 transition-opacity"
            style={{ color: 'var(--text-muted)' }}
          >
            ✕
          </button>
        </div>

        {/* Loading state */}
        {followUpPending && (
          <div className="text-center py-8">
            <div className="text-3xl mb-4 animate-pulse">🧠</div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              正在分析会话内容...
            </p>
          </div>
        )}

        {/* Suggestions ready */}
        {!followUpPending && !showConfirm && (
          <div className="space-y-4">
            {/* Summary */}
            {followUpSummary && (
              <div
                className="p-4 rounded-xl text-sm"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-secondary)',
                  lineHeight: '1.6'
                }}
              >
                <div className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
                  会话摘要
                </div>
                {followUpSummary}
              </div>
            )}

            {/* AI Suggestions */}
            {followUpDirections.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                  可能的追问方向
                </div>
                <div className="flex flex-wrap gap-2">
                  {followUpDirections.map((dir, i) => (
                    <button
                      key={i}
                      onClick={() => handleSelectDirection(dir)}
                      className="px-4 py-2 rounded-xl text-sm font-medium transition-all hover:scale-105"
                      style={{
                        backgroundColor: 'var(--bg-tertiary)',
                        color: 'var(--accent)',
                        border: '1px solid var(--accent)'
                      }}
                    >
                      {dir}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Custom input */}
            <div className="space-y-2">
              <div className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                自定义追问方向
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCustomSubmit()}
                  placeholder="输入你想追问的方向..."
                  className="flex-1 px-3 py-2 rounded-xl text-sm"
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                    outline: 'none'
                  }}
                />
                <button
                  onClick={handleCustomSubmit}
                  disabled={!customInput.trim()}
                  className="px-4 py-2 rounded-xl text-sm font-medium transition-all hover:scale-105 disabled:opacity-50"
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: 'var(--bg-primary)'
                  }}
                >
                  确认
                </button>
              </div>
            </div>

            {/* No link option */}
            <button
              onClick={handleNoLink}
              className="w-full py-3 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-muted)',
                border: '1px solid var(--border)'
              }}
            >
              不关联，创建独立新会话 →
            </button>
          </div>
        )}

        {/* Confirmation for custom input */}
        {!followUpPending && showConfirm && (
          <div className="space-y-4">
            <div
              className="p-4 rounded-xl"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-primary)'
              }}
            >
              <div className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
                确认关联到会话
              </div>
              <p className="text-sm">
                新会话 "<span style={{ color: 'var(--accent)' }}>{customInput.trim()}</span>" 将作为当前会话的追问分支
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-3 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border)'
                }}
              >
                返回修改
              </button>
              <button
                onClick={handleConfirmNoLink}
                className="flex-1 py-3 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--bg-primary)'
                }}
              >
                确认关联
              </button>
            </div>
          </div>
        )}

        {/* Empty state - not enough conversation */}
        {!followUpPending && !followUpSummary && followUpDirections.length === 0 && !showConfirm && (
          <div className="text-center py-8">
            <div className="text-3xl mb-4">🤔</div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              当前会话内容不足，无法生成追问建议
            </p>
            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
              请先进行一轮完整的问答
            </p>
            <button
              onClick={onClose}
              className="mt-4 px-6 py-2 rounded-xl text-sm font-medium"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--bg-primary)'
              }}
            >
              关闭
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
