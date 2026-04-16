import { useState } from 'react';
import { useConversationStore } from '../store';
import SettingsModal from './SettingsModal';
import BigBangModal from './BigBangModal';

export default function Toolbar() {
  const { createRootConversation, tree, loadTree, isLoading } = useConversationStore();
  const [showSettings, setShowSettings] = useState(false);
  const [showBigBang, setShowBigBang] = useState(false);

  const handleNew = async () => {
    await createRootConversation('新对话');
  };

  return (
    <>
      <div
        className="flex items-center gap-3 px-4 py-3 transition-smooth"
        style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}
      >
        <h1 className="font-semibold text-base" style={{ color: 'var(--accent)' }}>
          DeepMind_Query
        </h1>
        <button
          onClick={handleNew}
          disabled={isLoading}
          className="px-3 py-1.5 text-sm rounded-lg transition-all hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-primary)' }}
        >
          新对话
        </button>
        <button
          onClick={() => loadTree()}
          disabled={isLoading}
          className="px-3 py-1.5 text-sm rounded-lg transition-all"
          style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
        >
          刷新
        </button>

        {/* Big Bang Button */}
        {tree && (
          <button
            onClick={() => setShowBigBang(true)}
            className="px-3 py-1.5 text-sm rounded-lg transition-all hover:scale-105 animate-fade-in"
            style={{ backgroundColor: 'var(--error)', color: '#fff' }}
          >
            💥 大爆炸
          </button>
        )}

        <div className="flex-1" />
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {tree ? `${tree.children.length + 1} 个节点` : '未连接'}
        </span>
        <button
          onClick={() => setShowSettings(true)}
          className="px-3 py-1.5 text-sm rounded-lg transition-all"
          style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
        >
          ⚙️
        </button>
      </div>

      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
      <BigBangModal isOpen={showBigBang} onClose={() => setShowBigBang(false)} />
    </>
  );
}
