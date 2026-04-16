import { useConversationStore } from '../store';

export default function Toolbar() {
  const { createRootConversation, tree, loadTree, isLoading } = useConversationStore();

  const handleNew = async () => {
    await createRootConversation('新对话');
  };

  return (
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
        className="px-3 py-1.5 text-sm rounded-lg transition-smooth hover:opacity-90 disabled:opacity-50"
        style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-primary)' }}
      >
        新对话
      </button>
      <button
        onClick={() => loadTree()}
        disabled={isLoading}
        className="px-3 py-1.5 text-sm rounded-lg transition-smooth"
        style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
      >
        刷新
      </button>
      <div className="flex-1" />
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {tree ? `${tree.children.length + 1} 个节点` : '未连接'}
      </span>
    </div>
  );
}
