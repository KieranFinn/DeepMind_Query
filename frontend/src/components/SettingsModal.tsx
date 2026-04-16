import { useState, useEffect } from 'react';
import { useConversationStore, MODELS } from '../store';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: Props) {
  const { selectedModel, setModel } = useConversationStore();
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Load from localStorage
      const saved = localStorage.getItem('deepmind-query-api-key');
      if (saved) setApiKey(saved);
    }
  }, [isOpen]);

  const handleSaveApiKey = () => {
    localStorage.setItem('deepmind-query-api-key', apiKey);
    // Reload to apply
    window.location.reload();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="w-[480px] max-w-[90vw] rounded-xl p-6 animate-fade-in"
        style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            设置
          </h2>
          <button
            onClick={onClose}
            className="text-lg hover:opacity-70 transition-opacity"
            style={{ color: 'var(--text-muted)' }}
          >
            ✕
          </button>
        </div>

        {/* Model Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
            AI 模型
          </label>
          <select
            value={selectedModel}
            onChange={(e) => setModel(e.target.value)}
            className="w-full px-3 py-2 rounded-lg transition-all"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
            }}
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id} style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        {/* API Key */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
            API Key (MiniMax)
          </label>
          <div className="flex gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="输入你的 API Key"
              className="flex-1 px-3 py-2 rounded-lg transition-all"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
              }}
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className="px-3 py-2 rounded-lg text-sm transition-all"
              style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            >
              {showKey ? '🙈' : '👁️'}
            </button>
          </div>
          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
            API Key 仅存储在本地浏览器中
          </p>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSaveApiKey}
          className="w-full py-2 rounded-lg font-medium transition-all hover:opacity-90"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-primary)' }}
        >
          保存并重启
        </button>

        {/* Keyboard Shortcuts */}
        <div className="mt-6 pt-6" style={{ borderTop: '1px solid var(--border)' }}>
          <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>
            键盘快捷键
          </h3>
          <div className="space-y-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <div className="flex justify-between">
              <span>发送消息</span>
              <kbd className="px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-tertiary)' }}>⌘/Ctrl + Enter</kbd>
            </div>
            <div className="flex justify-between">
              <span>取消发送</span>
              <kbd className="px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-tertiary)' }}>Esc</kbd>
            </div>
            <div className="flex justify-between">
              <span>切换到父节点</span>
              <kbd className="px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-tertiary)' }}>↑</kbd>
            </div>
            <div className="flex justify-between">
              <span>切换到子节点</span>
              <kbd className="px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-tertiary)' }}>↓</kbd>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
