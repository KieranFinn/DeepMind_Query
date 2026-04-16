import { useEffect } from 'react';
import Toolbar from './components/Toolbar';
import KnowledgeGraph from './components/KnowledgeGraph';
import ConversationPanel from './components/ConversationPanel';
import { useConversationStore } from './store';

export default function App() {
  const { loadTree, setActiveNode, error, clearError, isHydrated } = useConversationStore();

  useEffect(() => {
    if (isHydrated) {
      loadTree();
    }
  }, [isHydrated, loadTree]);

  const handleNodeClick = (nodeId: string) => {
    setActiveNode(nodeId);
  };

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <Toolbar />

      {error && (
        <div
          className="flex justify-between items-center px-4 py-2 animate-fade-in"
          style={{ backgroundColor: 'var(--error)', color: '#fff' }}
        >
          <span className="text-sm">{error}</span>
          <button onClick={clearError} className="text-sm hover:underline">
            关闭
          </button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Graph Panel */}
        <div className="flex-1" style={{ borderRight: '1px solid var(--border)' }}>
          <KnowledgeGraph onNodeClick={handleNodeClick} />
        </div>

        {/* Conversation Panel */}
        <div className="w-[420px] flex-shrink-0" style={{ backgroundColor: 'var(--bg-secondary)' }}>
          <ConversationPanel />
        </div>
      </div>
    </div>
  );
}
