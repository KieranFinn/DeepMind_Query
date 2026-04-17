import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { useStore } from '../store';
import FollowUpModal from './FollowUpModal';

export default function ConversationPanel() {
  const {
    isLoading, streamingMessage,
    sendUserMessage, createChildNode, cancelStreaming,
    getActiveRegion, getActiveNode,
    activeRegionId,
    followUpReady, followUpPending,
    fetchFollowUpSuggestions
  } = useStore();

  const [input, setInput] = useState('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [showFollowUpBtn, setShowFollowUpBtn] = useState(false);  // For animation
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wasLoading = useRef(false);

  const activeRegion = getActiveRegion();
  const activeNode = getActiveNode();

  // Check message state
  const messages = activeNode?.messages || [];
  const hasUserMsg = messages.some(m => m.role === 'user');
  const hasAssistantMsg = messages.some(m => m.role === 'assistant');
  const hasConversation = hasUserMsg && hasAssistantMsg;

  // After streaming completes, trigger follow-up suggestion fetch
  useEffect(() => {
    if (wasLoading.current && !isLoading && activeNode && activeRegionId) {
      const msgs = activeNode.messages || [];
      const hasU = msgs.some((m: any) => m.role === 'user');
      const hasA = msgs.some((m: any) => m.role === 'assistant');
      if (hasU && hasA) {
        // First Q&A completed - fetch follow-up suggestions in background
        fetchFollowUpSuggestions(activeRegionId, String(activeNode.id));
      }
    }
    wasLoading.current = isLoading;
  }, [isLoading, activeNode, activeRegionId, fetchFollowUpSuggestions]);

  // When follow-up becomes ready, trigger animation
  useEffect(() => {
    if (followUpReady) {
      setShowFollowUpBtn(true);
    }
  }, [followUpReady]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeNode, streamingMessage]);

  // Listen for follow-up creation event from FollowUpModal
  useEffect(() => {
    const handleFollowUpCreate = async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const { title, link } = detail;
      if (!activeNode) return;
      const nodeId = String(activeNode.id);
      if (link && title) {
        await createChildNode(nodeId, title);
      } else {
        // No link - create standalone child
        await createChildNode(nodeId, `分支 ${nodeId.slice(0, 8)}`);
      }
    };
    window.addEventListener('followup-create', handleFollowUpCreate);
    return () => window.removeEventListener('followup-create', handleFollowUpCreate);
  }, [activeNode, createChildNode]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading || !activeNode) return;
    const content = input.trim();
    setInput('');
    await sendUserMessage(content);
  }, [input, isLoading, activeNode, sendUserMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      handleSend();
    }
    // Ctrl/Cmd + Enter to create branch (not for sending)
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (followUpReady) handleFollowUpClick();
    }
  };

  const handleFollowUpClick = () => {
    if (!followUpReady) return;
    setShowFollowUp(true);
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

  if (!activeNode) {
    return (
      <div className="flex flex-col h-full items-center justify-center" style={{ color: 'var(--text-muted)' }}>
        <p className="text-sm">在此知识区创建新会话</p>
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
            {activeNode.title}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            <span style={{ color: activeRegion.color }}>{activeRegion.name}</span>
            {' · '}
            {messages.length} 条消息
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !streamingMessage && (
          <p className="text-center text-sm animate-fade-in" style={{ color: 'var(--text-muted)' }}>
            开始对话吧！
          </p>
        )}

        {messages.map((msg: any, i: number) => (
          <div
            key={`${msg.created_at}-${i}`}
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
              {msg.role === 'user' ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                  {msg.content}
                </p>
              ) : (
                <div className="markdown-content text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex, rehypeHighlight]}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
              )}
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
              <div className="markdown-content text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex, rehypeHighlight]}
                >
                  {streamingMessage}
                </ReactMarkdown>
                <span className="typing-cursor" style={{ color: 'var(--accent)' }}></span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Actions - only show when there are messages or streaming */}
      {(hasConversation || isLoading || showFollowUpBtn) && (
        <div
          className="px-4 py-2 flex gap-2 items-center"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          {/* Follow-up button - animated entrance */}
          {followUpReady && (
            <button
              onClick={handleFollowUpClick}
              className="px-3 py-1.5 text-sm rounded-lg transition-all hover:scale-105"
              style={{
                backgroundColor: 'var(--bg-hover)',
                color: 'var(--success)',
                border: '1px solid var(--border)',
                animation: 'pop-in 0.3s ease-out'
              }}
              title="智能追问：AI总结+关键词建议"
            >
              + 追问
            </button>
          )}

          {/* Follow-up loading indicator */}
          {followUpPending && (
            <div className="px-3 py-1.5 text-sm rounded-lg flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
              <span className="animate-pulse">🧠</span>
              <span className="text-xs">生成追问方向...</span>
            </div>
          )}

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
      )}

      {/* Input */}
      <div className="p-4" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的问题..."
            disabled={isLoading}
            className="flex-1 px-3 rounded-xl resize-none transition-all focus:shadow-lg disabled:opacity-50"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              outline: 'none',
              fontSize: '14px',
              lineHeight: '20px',
              paddingTop: '8px',
              paddingBottom: '8px',
              minHeight: '36px',
              maxHeight: '120px',
              overflow: 'auto'
            }}
            rows={1}
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

      <FollowUpModal isOpen={showFollowUp} onClose={() => setShowFollowUp(false)} />
    </div>
  );
}
