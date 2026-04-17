import { useState, useEffect } from 'react';
import { Graph, Node } from '../types';
import { useStore } from '../store';
import { streamAnalyze } from '../api';

interface BigBangModalProps {
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
  totalNodes: number;
  totalMessages: number;
  maxDepth: number;
}

function buildTree(graph: Graph): Map<string, { node: Node; children: string[]; depth: number }> {
  // Build parent -> children mapping from edges
  const childrenMap = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const src = String(edge.source);
    if (!childrenMap.has(src)) childrenMap.set(src, []);
    childrenMap.get(src)!.push(String(edge.target));
  }

  // Find root nodes (nodes with no incoming edge)
  const allTargets = new Set(graph.edges.map(e => String(e.target)));
  const roots = graph.nodes.filter(n => !allTargets.has(String(n.id)));

  // BFS from roots to assign depths
  const nodeInfo = new Map<string, { node: Node; children: string[]; depth: number }>();
  const queue: Array<{ id: string; depth: number }> = [];

  for (const root of roots) {
    const id = String(root.id);
    nodeInfo.set(id, { node: root, children: childrenMap.get(id) || [], depth: 0 });
    for (const childId of childrenMap.get(id) || []) {
      queue.push({ id: childId, depth: 1 });
    }
  }

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (nodeInfo.has(id)) continue;
    const node = graph.nodes.find(n => String(n.id) === id);
    if (!node) continue;
    nodeInfo.set(id, { node, children: childrenMap.get(id) || [], depth });
    for (const childId of childrenMap.get(id) || []) {
      queue.push({ id: childId, depth: depth + 1 });
    }
  }

  return nodeInfo;
}

function analyzeGraph(graph: Graph | null): AnalysisResult | null {
  if (!graph || graph.nodes.length === 0) return null;

  const nodeInfo = buildTree(graph);
  let totalNodes = 0;
  let maxDepth = 0;
  let totalMessages = 0;
  const branchFactors: number[] = [];

  for (const [id, info] of nodeInfo) {
    totalNodes++;
    totalMessages += info.node.messages.length;
    maxDepth = Math.max(maxDepth, info.depth);
    if (info.children.length > 0) {
      branchFactors.push(info.children.length);
    }
  }

  const avgBranchFactor = branchFactors.length > 0
    ? branchFactors.reduce((a, b) => a + b, 0) / branchFactors.length
    : 0;

  // Completeness: ratio of actual nodes to "healthy" tree (avg branching 2-3)
  const idealNodesAtMaxDepth = Math.pow(avgBranchFactor || 2, Math.max(maxDepth, 1));
  const completeness = Math.min(100, Math.round((totalNodes / Math.max(idealNodesAtMaxDepth, 1)) * 100));

  // Depth score
  const depthScore = Math.min(100, Math.round((maxDepth / 10) * 100));

  // Breadth score
  const breadthScore = Math.min(100, Math.round((avgBranchFactor / 4) * 100));

  // Thinking pattern analysis
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
  if (completeness < 30) suggestions.push('知识网络比较稀疏，建议扩展更多分支');
  if (depthScore < 40) suggestions.push('可以尝试对关键分支进行连续追问，深挖底层逻辑');
  if (breadthScore < 30) suggestions.push('当前分支较少，可以从不同角度提问获取更广视角');
  if (totalMessages < 3) suggestions.push('每个分支的对话内容较少，可以更充分地展开讨论');
  if (maxDepth >= 7) suggestions.push('你已经建立了相当深度的知识体系，考虑总结提炼形成自己的框架');

  return {
    completeness,
    depth: depthScore,
    breadth: breadthScore,
    avgBranchFactor: Math.round(avgBranchFactor * 100) / 100,
    thinkingPattern,
    suggestions,
    critique,
    totalNodes,
    totalMessages,
    maxDepth,
  };
}

export default function BigBangModal({ isOpen, onClose }: BigBangModalProps) {
  const { graph, activeRegionId } = useStore();
  const [llmContent, setLlmContent] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    if (isOpen && graph && activeRegionId) {
      setIsAnalyzing(true);
      setLlmContent('');

      // Use LLM streaming analysis
      streamAnalyze(activeRegionId)
        .then(response => {
          if (!response.ok) throw new Error('Analysis failed');
          const reader = response.body?.getReader();
          if (!reader) throw new Error('No response body');
          const decoder = new TextDecoder();
          let fullContent = '';

          const processStream = () => {
            reader.read().then(({ done, value }) => {
              if (done) {
                setIsAnalyzing(false);
                return;
              }
              const chunk = decoder.decode(value, { stream: true });
              const lines = chunk.split('\n');
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6).trim();
                  if (data === '[DONE]') {
                    setIsAnalyzing(false);
                    return;
                  }
                  try {
                    const event = JSON.parse(data);
                    if (event.event === 'error') {
                      const errData = JSON.parse(event.data);
                      throw new Error(errData.error || 'Stream error');
                    }
                    if (event.data) {
                      const inner = JSON.parse(event.data);
                      if (inner.content) {
                        fullContent += inner.content;
                        setLlmContent(fullContent);
                      }
                    }
                  } catch (e) {
                    if ((e as Error).message.startsWith('Stream error')) {
                      setIsAnalyzing(false);
                      return;
                    }
                  }
                }
              }
              processStream();
            });
          };
          processStream();
        })
        .catch(e => {
          console.error('Analysis error:', e);
          setIsAnalyzing(false);
        });
    }
  }, [isOpen, graph, activeRegionId]);

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

        {(llmContent || isAnalyzing) && (
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
              {llmContent ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex, rehypeHighlight]}
                >
                  {llmContent}
                </ReactMarkdown>
              ) : (
                <div className="flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                  <span className="animate-pulse">🔮</span>
                  <span>正在深度分析中...</span>
                </div>
              )}
            </div>

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

        {!llmContent && !isAnalyzing && graph && graph.nodes.length > 0 && (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">🌌</div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              点击上方按钮开始深度分析
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

        {!llmContent && !isAnalyzing && (!graph || graph.nodes.length === 0) && (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">🌌</div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              当前知识区为空，请先创建会话
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
