import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { getFollowUpSuggestions } from '../api';

interface FollowUpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function FollowUpModal({ isOpen, onClose }: FollowUpModalProps) {
  const { activeRegionId, activeNodeId } = useStore();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [summary, setSummary] = useState('');
  const [customInput, setCustomInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamedContent, setStreamedContent] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  useEffect(() => {
    if (isOpen && activeRegionId && activeNodeId) {
      setIsLoading(true);
      setStreamedContent('');
      setSuggestions([]);
      setSummary('');
      setCustomInput('');
      setShowConfirm(false);

      getFollowUpSuggestions(activeRegionId, activeNodeId)
        .then(response => {
          if (!response.ok) throw new Error('Failed to get suggestions');
          const reader = response.body?.getReader();
          if (!reader) throw new Error('No response body');
          const decoder = new TextDecoder();

          const processStream = () => {
            reader.read().then(({ done, value }) => {
              if (done) {
                setIsLoading(false);
                // Parse accumulated content
                parseContent(streamedContent);
                return;
              }
              const chunk = decoder.decode(value, { stream: true });
              setStreamedContent(prev => {
                const newContent = prev + chunk;
                // Try to parse incrementally
                parseContent(newContent);
                return newContent;
              });
              processStream();
            });
          };
          processStream();
        })
        .catch(e => {
          console.error('Suggest error:', e);
          setIsLoading(false);
        });
    }
  }, [isOpen, activeRegionId, activeNodeId]);

  const parseContent = (content: string) => {
    // Parse the SSE-like content
    const lines = content.split('\n');
    let fullText = '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          const event = JSON.parse(data);
          if (event.data) {
            const inner = JSON.parse(event.data);
            if (inner.content) {
              fullText += inner.content;
            }
          }
        } catch {}
      }
    }
  };

  // Separate effect to parse streamed content
  useEffect(() => {
    if (!streamedContent) return;

    // Simple parsing: look for 【摘要】 and 【方向】 markers
    let summaryText = '';
    let dirs: string[] = [];

    const textToParse = streamedContent;
    const lines = textToParse.split('\n');
    for (const line of lines) {
      if (line.startsWith('【摘要】')) {
        summaryText = line.slice(4).trim();
      } else if (line.startsWith('【方向1】')) {
        dirs[0] = line.slice(4).trim();
      } else if (line.startsWith('【方向2】')) {
        dirs[1] = line.slice(4).trim();
      }
    }

    // Also try to extract from accumulated content without markers
    if (!summaryText && streamedContent.length > 50) {
      // Just use the first meaningful chunk as summary
      const cleaned = streamedContent.replace(/data:\s*/g, '').replace(/\{[^}]*\}/g, '');
      if (cleaned.length > 20) {
        summaryText = cleaned.slice(0, 100) + '...';
      }
    }

    setSummary(summaryText);
    setSuggestions(dirs.filter(Boolean));
  }, [streamedContent]);

  if (!isOpen) return null;

  const handleSelectDirection = (direction: string) => {
    // User selected AI suggestion - auto-link and create child
    if (activeRegionId && activeNodeId) {
      createChildWithLink(direction);
    }
  };

  const handleCustomSubmit = () => {
    if (!customInput.trim()) return;
    // Show confirmation
    setConfirmText(customInput.trim());
    setShowConfirm(true);
  };

  const createChildWithLink = async (title: string) => {
    // This will be handled by parent - just close and let parent do the creation
    onClose();
    // Parent should call createChildNode after modal closes
    window.dispatchEvent(new CustomEvent('followup-create', {
      detail: { title, link: true }
    }));
  };

  const handleNoLink = () => {
    // Create child without linking
    onClose();
    window.dispatchEvent(new CustomEvent('followup-create', {
      detail: { title: '', link: false }
    }));
  };

  const handleConfirmNoLink = () => {
    // Create with the custom input but confirmed
    onClose();
    window.dispatchEvent(new CustomEvent('followup-create', {
      detail: { title: confirmText, link: true }
    }));
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
        {isLoading && (
          <div className="text-center py-8">
            <div className="text-3xl mb-4 animate-pulse">🧠</div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              正在分析会话内容...
            </p>
          </div>
        )}

        {/* Suggestions ready */}
        {!isLoading && !showConfirm && (
          <div className="space-y-4">
            {/* Summary */}
            {summary && (
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
                {summary}
              </div>
            )}

            {/* AI Suggestions */}
            {suggestions.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                  可能的追问方向
                </div>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((dir, i) => (
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
        {!isLoading && showConfirm && (
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
                新会话 "<span style={{ color: 'var(--accent)' }}>{confirmText}</span>" 将作为当前会话的追问分支
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
        {!isLoading && !summary && suggestions.length === 0 && !showConfirm && (
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
