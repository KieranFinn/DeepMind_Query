import { useState, useRef, useEffect, useCallback } from 'react';
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
    sendUserMessage, createChildBranch, cancelStreaming
  } = useConversationStore();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeNode = findNode(tree, activeNodeId);

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

  if (!activeNode) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-gray-400">
        <p>选择一个节点开始对话</p>
        <p className="text-sm mt-2">或创建新对话</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-gray-800 truncate">{activeNode.title}</h2>
          <p className="text-xs text-gray-500">
            {activeNode.messages.length} 条消息
            {activeNode.children.length > 0 && ` · ${activeNode.children.length} 个分支`}
          </p>
        </div>
        <select
          value={selectedModel}
          onChange={(e) => setModel(e.target.value)}
          className="text-xs px-2 py-1 border border-gray-300 rounded-md bg-white ml-2 flex-shrink-0"
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeNode.messages.length === 0 && !streamingMessage && (
          <p className="text-gray-400 text-center text-sm">
            开始对话吧！输入你的问题或概念。
          </p>
        )}

        {activeNode.messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] px-4 py-2 rounded-lg ${
                msg.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
            </div>
          </div>
        ))}

        {streamingMessage && (
          <div className="flex justify-start">
            <div className="max-w-[85%] px-4 py-2 rounded-lg bg-gray-100 text-gray-800">
              <p className="whitespace-pre-wrap text-sm">{streamingMessage}<span className="animate-pulse">▊</span></p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Actions */}
      <div className="px-4 py-2 border-t border-gray-200 flex gap-2">
        <button
          onClick={handleBranch}
          disabled={isLoading}
          className="px-3 py-1.5 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 disabled:opacity-50"
        >
          + 继续追问
        </button>
        {isLoading && (
          <button
            onClick={handleCancel}
            className="px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
          >
            取消
          </button>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的问题..."
            disabled={isLoading}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            rows={2}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? '...' : '发送'}
          </button>
        </div>
      </div>
    </div>
  );
}
