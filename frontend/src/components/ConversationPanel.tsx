import { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../store';

function findNode(node: any, id: string | null): any {
  if (!node || !id) return null;
  if (node.id === id) return node;
  for (const child of node.children || []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

export default function ConversationPanel() {
  const {
    activeTree, isLoading, streamingMessage,
    sendUserMessage, createBranch, cancelStreaming,
    getActiveRegion, getActiveSession
  } = useStore();

  const [input, setInput] = useState('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeRegion = getActiveRegion();
  const activeSession = getActiveSession();
  const activeNodeId = activeTree?.id || null;
  const activeNode = activeTree;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeNode?.messages, streamingMessage]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading || !activeTree) return;
    const content = input.trim();
    setInput('');
    await sendUserMessage(content);
  }, [input, isLoading, activeTree, sendUserMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleBranch = async () => {
    if (!activeTree) return;
    // Create branch from root node
    await createBranch(activeTree.id, `分支 ${activeTree.children.length + 1}`);
  };

  const handleCancel = () => {
    cancelStreaming();
  };

  const copyMessage = (content: string, index: number) => {
    navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 1500);
  };

  if (!activeRegion) {
    return (
      <div className="flex flex-col h-full items-center justify-center" style={{ color: 'var(--text-muted)' }}>
        <p className="text-sm">创建或选择一个知识区</p>
      </div>
    );
  }

  if (!activeSession) {
    return (
      <div className="flex flex-col h-full items-center justify-center" style={{ color: 'var(--text-muted)' }}>
        <p className="text-sm">在此知识区创建新会话</p>
      </div>
    );
  }

  if (!activeTree) {
    return (
      <div className="flex flex-col h-full items-center justify-center" style={{ color: 'var(--text-muted)' }}>
        <p className="text-sm">加载中...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-tertiary)' }}
      >
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
            {activeTree.title}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            <span style={{ color: activeRegion.color }}>{activeRegion.name}</span>
            {' · '}
            {activeTree.messages.length} 条消息 · {activeTree.children.length} 个分支
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTree.messages.length === 0 && !streamingMessage && (
          <p className="text-center text-sm animate-fade-in" style={{ color: 'var(--text-muted)' }}>
            开始对话吧！
          </p>
        )}

        {activeTree.messages.map((msg, i) => (
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
        className="px-4 py-2 flex gap-2 items-center"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <button
          onClick={handleBranch}
          disabled={isLoading}
          className="px-3 py-1.5 text-sm rounded-lg transition-all hover:scale-105 disabled:opacity-50"
          style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--success)', border: '1px solid var(--border)' }}
        >
          + 追问
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
      </div>

      {/* Input */}
      <div className="p-4" style={{ borderTop: '1px solid var(--border)' }}>
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
