import { useEffect } from 'react';
import { useStore } from '../store';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';

interface BigBangModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function BigBangModal({ isOpen, onClose }: BigBangModalProps) {
  const { isBigBangAnalyzing, bigBangResult, bigBangError, bigBangRegionId, activeRegionId, startBigBangAnalysis } = useStore();

  // Don't render if not open
  if (!isOpen) return null;

  // Auto-start analysis if modal opens without one running
  useEffect(() => {
    if (isOpen && !isBigBangAnalyzing && !bigBangResult && !bigBangError && activeRegionId) {
      startBigBangAnalysis(activeRegionId);
    }
  }, [isOpen]);

  const isAnalyzing = isBigBangAnalyzing && bigBangRegionId === activeRegionId;
  const hasResult = !!bigBangResult && bigBangRegionId === activeRegionId;
  const hasError = !!bigBangError && bigBangRegionId === activeRegionId;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in"
      style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
      onClick={onClose}
    >
      <div
        className="w-[640px] max-w-[90vw] max-h-[85vh] overflow-y-auto rounded-2xl p-8 animate-fade-in"
        style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>
              大爆炸分析
            </h2>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              全面解析你的知识结构与思维模式
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isAnalyzing && (
              <button
                onClick={onClose}
                className="px-3 py-1 rounded-lg text-sm hover:opacity-70 transition-opacity"
                style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                title="最小化到后台继续分析"
              >
                后台
              </button>
            )}
            <button
              onClick={onClose}
              className="text-2xl hover:opacity-70 transition-opacity"
              style={{ color: 'var(--text-muted)' }}
            >
              X
            </button>
          </div>
        </div>

        {/* Analyzing in progress */}
        {isAnalyzing && !hasResult && (
          <div className="text-center py-12">
            <div className="text-4xl mb-4 animate-pulse">Analysing...</div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              正在分析你的知识网络...
            </p>
          </div>
        )}

        {/* Result */}
        {hasResult && (
          <div className="space-y-4">
            <div
              className="p-4 rounded-xl prose prose-sm max-w-none"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                lineHeight: '1.7'
              }}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex, rehypeHighlight]}
              >
                {bigBangResult}
              </ReactMarkdown>
            </div>

            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl font-medium transition-all hover:scale-[1.02]"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-primary)' }}
            >
              继续探索
            </button>
          </div>
        )}

        {/* Error state */}
        {hasError && (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">X</div>
            <p className="text-sm" style={{ color: 'var(--error)' }}>
              分析失败: {bigBangError}
            </p>
            <button
              onClick={onClose}
              className="mt-4 px-6 py-2 rounded-xl font-medium"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-primary)' }}
            >
              关闭
            </button>
          </div>
        )}
      </div>
    </div>
  );
}