import { useState, useEffect } from 'react';
import { ConversationNode } from '../types';
import { useConversationStore } from '../store';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface AnalysisResult {
  completeness: number;
  depth: number;
  breadth: number;
  avgBranchFactor: number;
  thinkingPattern: string;
  suggestions: string[];
  critique: string[];
}

function analyzeTree(node: ConversationNode | null): AnalysisResult | null {
  if (!node) return null;

  let totalNodes = 0;
  let maxDepth = 0;
  let totalMessages = 0;
  let totalBranches = 0;
  const depthCounts: number[] = [];
  const branchFactors: number[] = [];

  function traverse(n: ConversationNode, depth: number) {
    totalNodes++;
    totalMessages += n.messages.length;
    maxDepth = Math.max(maxDepth, depth);
    depthCounts[depth] = (depthCounts[depth] || 0) + 1;

    if (n.children.length > 0) {
      branchFactors.push(n.children.length);
      totalBranches += n.children.length;
    }

    n.children.forEach(child => traverse(child, depth + 1));
  }

  traverse(node, 0);

  // Completeness: based on nodes vs potential (a "complete" tree has ~2^n nodes at depth n)
  const avgBranchFactor = branchFactors.length > 0
    ? branchFactors.reduce((a, b) => a + b, 0) / branchFactors.length
    : 0;

  // Completeness score: ratio of actual nodes to a "healthy" tree (avg branching 2-3)
  const idealNodesAtMaxDepth = Math.pow(avgBranchFactor || 2, maxDepth);
  const completeness = Math.min(100, Math.round((totalNodes / Math.max(idealNodesAtMaxDepth, 1)) * 100));

  // Depth score: deeper is better for deep learning
  const depthScore = Math.min(100, Math.round((maxDepth / 10) * 100));

  // Breadth score: more breadth indicates exploration
  const breadthScore = Math.min(100, Math.round((avgBranchFactor / 4) * 100));

  // Analyze thinking pattern based on structure
  let thinkingPattern = '';
  const suggestions: string[] = [];
  const critique: string[] = [];

  if (maxDepth <= 2 && avgBranchFactor < 1.5) {
    thinkingPattern = '线性思维 · 深度不足';
    critique.push('你的学习路径偏浅，倾向于表面理解');
    critique.push('建议向纵深挖掘，建立更深的专业壁垒');
  } else if (maxDepth >= 5 && avgBranchFactor < 1.3) {
    thinkingPattern = '纵向深挖 · 但广度不足';
    critique.push('你擅长深入研究，但可能陷入"兔子洞"');
    critique.push('建议适度横向扩展，建立跨领域联系');
  } else if (avgBranchFactor > 2.5 && maxDepth < 3) {
    thinkingPattern = '发散思维 · 但缺乏聚焦';
    critique.push('你善于发现关联，但深度不够');
    critique.push('建议对关键分支进行深入探索');
  } else if (maxDepth >= 4 && avgBranchFactor >= 1.5 && avgBranchFactor <= 2.5) {
    thinkingPattern = '网状思维 · 结构平衡';
    critique.push('你的知识结构较为健康');
    critique.push('继续保持这种纵横交错的探索方式');
  } else if (totalNodes < 5) {
    thinkingPattern = '新手起步 · 结构初建';
    suggestions.push('知识网络刚刚开始，继续扩展分支');
    suggestions.push('尝试从一个概念延伸出多个相关问题');
  } else {
    thinkingPattern = '探索型 · 风格多元';
    critique.push('你的学习风格多元，需要根据目标调整深度和广度');
  }

  // Completeness suggestions
  if (completeness < 30) {
    suggestions.push('知识网络比较稀疏，建议扩展更多分支');
  }
  if (depthScore < 40) {
    suggestions.push('可以尝试对关键分支进行连续追问，深挖底层逻辑');
  }
  if (breadthScore < 30) {
    suggestions.push('当前分支较少，可以从不同角度提问获取更广视角');
  }
  if (totalMessages < 3) {
    suggestions.push('每个分支的对话内容较少，可以更充分地展开讨论');
  }

  // Add depth-specific suggestions
  if (maxDepth >= 7) {
    suggestions.push('你已经建立了相当深度的知识体系，考虑总结提炼形成自己的框架');
  }

  return {
    completeness,
    depth: depthScore,
    breadth: breadthScore,
    avgBranchFactor: Math.round(avgBranchFactor * 100) / 100,
    thinkingPattern,
    suggestions,
    critique,
  };
}

export default function BigBangModal({ isOpen, onClose }: Props) {
  const { tree, isLoading } = useConversationStore();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    if (isOpen && tree) {
      setIsAnalyzing(true);
      // Simulate processing time for dramatic effect
      setTimeout(() => {
        const analysis = analyzeTree(tree);
        setResult(analysis);
        setIsAnalyzing(false);
      }, 1500);
    }
  }, [isOpen, tree]);

  if (!isOpen) return null;

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
              💥 大爆炸分析
            </h2>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              全面解析你的知识结构与思维模式
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

        {isAnalyzing && (
          <div className="text-center py-12">
            <div className="text-4xl mb-4 animate-pulse">🔮</div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              正在分析你的知识网络...
            </p>
          </div>
        )}

        {result && !isAnalyzing && (
          <div className="space-y-8">
            {/* Thinking Pattern - Hero */}
            <div className="text-center py-6 rounded-xl" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
              <p className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>你的思维模式</p>
              <p className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>
                {result.thinkingPattern}
              </p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>完整度</p>
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-bold" style={{ color: result.completeness > 50 ? 'var(--success)' : 'var(--error)' }}>
                    {result.completeness}%
                  </span>
                </div>
                <div className="mt-2 h-1 rounded-full" style={{ backgroundColor: 'var(--border)' }}>
                  <div
                    className="h-1 rounded-full transition-all"
                    style={{
                      width: `${result.completeness}%`,
                      backgroundColor: result.completeness > 50 ? 'var(--success)' : 'var(--error)'
                    }}
                  />
                </div>
              </div>

              <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>深度</p>
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-bold" style={{ color: result.depth > 50 ? 'var(--success)' : 'var(--error)' }}>
                    {result.depth}%
                  </span>
                </div>
                <div className="mt-2 h-1 rounded-full" style={{ backgroundColor: 'var(--border)' }}>
                  <div
                    className="h-1 rounded-full transition-all"
                    style={{
                      width: `${result.depth}%`,
                      backgroundColor: result.depth > 50 ? 'var(--success)' : 'var(--error)'
                    }}
                  />
                </div>
              </div>

              <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>广度</p>
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-bold" style={{ color: result.breadth > 50 ? 'var(--success)' : 'var(--error)' }}>
                    {result.breadth}%
                  </span>
                </div>
                <div className="mt-2 h-1 rounded-full" style={{ backgroundColor: 'var(--border)' }}>
                  <div
                    className="h-1 rounded-full transition-all"
                    style={{
                      width: `${result.breadth}%`,
                      backgroundColor: result.breadth > 50 ? 'var(--success)' : 'var(--error)'
                    }}
                  />
                </div>
              </div>

              <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>平均分支数</p>
                <span className="text-3xl font-bold" style={{ color: 'var(--accent)' }}>
                  {result.avgBranchFactor}
                </span>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  每个节点平均子分支数
                </p>
              </div>
            </div>

            {/* Critique */}
            {result.critique.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>
                  🧠 思维模式批判
                </h3>
                <div className="space-y-2">
                  {result.critique.map((c, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-lg text-sm animate-fade-in"
                      style={{ backgroundColor: 'var(--error)', color: '#fff', opacity: 0.9 }}
                    >
                      {c}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Suggestions */}
            {result.suggestions.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>
                  💡 补全建议
                </h3>
                <div className="space-y-2">
                  {result.suggestions.map((s, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-lg text-sm animate-fade-in"
                      style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                    >
                      {s}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action */}
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl font-medium transition-all hover:scale-[1.02]"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-primary)' }}
            >
              继续探索 →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
