import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useConversationStore, MODELS } from '../store';

interface Props {
  onBranch?: () => void;
}

function findNode(node: any, id: string | null): any {
  if (!node || !id) return null;
  if (node.id === id) return node;
  for (const child of node.children || []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

export default function ConversationPanel({ onBranch }: Props) {
  const {
    tree, activeNodeId, streamingMessage, isLoading, selectedModel, setModel,
    sendUserMessage, createChildBranch, cancelStreaming, renameNode, deleteNode,
    getPathToNode, generateSummary, setActiveNode
  } = useConversationStore();
  const [input, setInput] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevNodeIdRef = useRef<string | null>(null);

  const activeNode = findNode(tree, activeNodeId);

  // Get the path from root to current node for the breadcrumb
  const pathToNode = useMemo(() => {
    if (!activeNodeId) return [];
    return getPathToNode(activeNodeId);
  }, [activeNodeId, tree, getPathToNode]);

  // Track node changes to show summary transition
  const [showSummary, setShowSummary] = useState(false);
  const summaryRef = useRef<string>('');

  useEffect(() => {
    if (activeNodeId && activeNodeId !== prevNodeIdRef.current) {
      prevNodeIdRef.current = activeNodeId;
      // Generate summary for the new node
      summaryRef.current = generateSummary(activeNodeId);
      setShowSummary(true);
      // Hide summary after animation
      const timer = setTimeout(() => setShowSummary(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [activeNodeId, generateSummary]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeNode?.messages, streamingMessage]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || !activeNodeId || isLoading) return;
    const content = input.trim();
    setInput('');
    await sendUserMessage(activeNodeId, content);
  }, [input, activeNodeId, isLoading, sendUserMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleBranch = async () => {
    if (!activeNodeId) return;
    await createChildBranch(activeNodeId, `分支`);
    onBranch?.();
  };

  const handleCancel = () => {
    cancelStreaming();
  };

  const handleTitleDoubleClick = () => {
    if (!activeNode) return;
    setEditedTitle(activeNode.title);
    setIsEditingTitle(true);
  };

  const handleTitleSave = () => {
    if (activeNodeId && editedTitle.trim()) {
      renameNode(activeNodeId, editedTitle.trim());
    }
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleTitleSave();
    else if (e.key === 'Escape') setIsEditingTitle(false);
  };

  const handleDelete = async () => {
    if (!activeNodeId || !window.confirm('删除此分支？此操作不可撤销。')) return;
    await deleteNode(activeNodeId);
  };

  const copyMessage = (content: string, index: number) => {
    navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 1500);
  };

  const handlePathNodeClick = (nodeId: string) => {
    setActiveNode(nodeId);
  };

  if (!activeNode) {
    return (
      <div className="flex flex-col h-full items-center justify-center" style={{ color: 'var(--text-muted)' }}>
        <p className="text-sm">选择一个节点开始对话</p>
        <p className="text-xs mt-2">或创建新对话</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Path Breadcrumb */}
      {pathToNode.length > 1 && (
        <div
          className="px-4 py-2 flex items-center gap-1 text-xs overflow-x-auto transition-all"
          style={{
            borderBottom: '1px solid var(--border)',
            backgroundColor: 'var(--bg-primary)',
            opacity: showSummary ? 1 : 0.7
          }}
        >
          {pathToNode.map((node, i) => (
            <div key={node.id} className="flex items-center flex-shrink-0">
              {i > 0 && <span className="mx-1" style={{ color: 'var(--text-muted)' }}>›</span>}
              <button
                onClick={() => handlePathNodeClick(node.id)}
                className={`px-2 py-1 rounded transition-all hover:scale-105 ${
                  node.id === activeNodeId ? 'font-medium' : 'opacity-70'
                }`}
                style={{
                  backgroundColor: node.id === activeNodeId ? 'var(--active-path)' : 'transparent',
                  color: node.id === activeNodeId ? 'var(--accent)' : 'var(--text-muted)'
                }}
              >
                {node.title.length > 15 ? node.title.slice(0, 15) + '...' : node.title}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Session Summary Banner */}
      {showSummary && summaryRef.current && (
        <div
          className="px-4 py-2 text-xs animate-fade-in"
          style={{
            backgroundColor: 'var(--accent)',
            color: 'var(--bg-primary)',
            borderBottom: '1px solid var(--border)'
          }}
        >
          💡 {summaryRef.current}
        </div>
      )}

      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between transition-smooth"
        style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-tertiary)' }}
      >
        <div className="min-w-0 flex-1">
          {isEditingTitle ? (
            <input
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={handleTitleKeyDown}
              autoFocus
              className="w-full px-2 py-1 text-sm font-semibold rounded transition-all"
              style={{
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--accent)',
                outline: 'none'
              }}
            />
          ) : (
            <h2
              className="font-semibold text-sm truncate cursor-pointer transition-all hover:opacity-80"
              style={{ color: 'var(--text-primary)' }}
              onDoubleClick={handleTitleDoubleClick}
              title="双击编辑标题"
            >
              {activeNode.title}
            </h2>
          )}
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {activeNode.messages.length} 条消息
            {activeNode.children.length > 0 && ` · ${activeNode.children.length} 个分支`}
          </p>
        </div>
        <select
          value={selectedModel}
          onChange={(e) => setModel(e.target.value)}
          className="text-xs px-2 py-1 rounded-lg ml-2 flex-shrink-0 transition-all"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border)',
            cursor: 'pointer'
          }}
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id} style={{ backgroundColor: 'var(--bg-secondary)' }}>{m.name}</option>
          ))}
        </select>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeNode.messages.length === 0 && !streamingMessage && (
          <p className="text-center text-sm animate-fade-in" style={{ color: 'var(--text-muted)' }}>
            开始对话吧！
          </p>
        )}

        {activeNode.messages.map((msg, i) => (
          <div
            key={i}
            className="message-enter flex animate-fade-in"
            style={{ justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}
          >
            <div
              className="group relative px-4 py-3 rounded-2xl max-w-[85%] transition-all hover:shadow-lg"
              style={{
                backgroundColor: msg.role === 'user' ? 'var(--user-bubble)' : 'var(--assistant-bubble)',
                border: `1px solid ${msg.role === 'user' ? 'var(--border-light)' : 'var(--border)'}`,
                borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              }}
            >
              <p className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                {msg.content}
              </p>
              <button
                onClick={() => copyMessage(msg.content, i)}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-xs px-2 py-1 rounded transition-all hover:scale-105"
                style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}
                title="复制"
              >
                {copiedIndex === i ? '✓' : '📋'}
              </button>
            </div>
          </div>
        ))}

        {streamingMessage && (
          <div className="flex justify-start message-enter animate-fade-in">
            <div
              className="px-4 py-3 rounded-2xl max-w-[85%]"
              style={{
                backgroundColor: 'var(--assistant-bubble)',
                border: '1px solid var(--border)',
                borderRadius: '16px 16px 16px 4px',
              }}
            >
              <p className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                {streamingMessage}<span className="typing-cursor" style={{ color: 'var(--accent)' }}></span>
              </p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Actions */}
      <div
        className="px-4 py-2 flex gap-2 items-center transition-smooth"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <button
          onClick={handleBranch}
          disabled={isLoading}
          className="px-3 py-1.5 text-sm rounded-lg transition-all hover:scale-105 disabled:opacity-50"
          style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--success)', border: '1px solid var(--border)' }}
        >
          + 继续追问
        </button>
        {isLoading && (
          <button
            onClick={handleCancel}
            className="px-3 py-1.5 text-sm rounded-lg transition-all hover:scale-105"
            style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--error)', border: '1px solid var(--border)' }}
          >
            取消
          </button>
        )}
        <div className="flex-1" />
        {activeNode.parent_id && (
          <button
            onClick={handleDelete}
            className="px-3 py-1.5 text-sm rounded-lg transition-all hover:scale-105 hover:opacity-80"
            style={{ color: 'var(--error)' }}
            title="删除此分支"
          >
            🗑️
          </button>
        )}
      </div>

      {/* Input */}
      <div className="p-4 transition-smooth" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的问题..."
            disabled={isLoading}
            className="flex-1 px-3 py-2 rounded-xl resize-none transition-all focus:shadow-lg disabled:opacity-50"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              outline: 'none'
            }}
            rows={2}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="px-4 py-2 rounded-xl transition-all hover:scale-105 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-primary)' }}
          >
            {isLoading ? '...' : '↑'}
          </button>
        </div>
      </div>
    </div>
  );
}
