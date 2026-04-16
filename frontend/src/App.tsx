import { useEffect } from 'react';
import Toolbar from './components/Toolbar';
import KnowledgeGraph from './components/KnowledgeGraph';
import ConversationPanel from './components/ConversationPanel';
import { useConversationStore } from './store';

export default function App() {
  const { loadTree, setActiveNode, error, clearError } = useConversationStore();

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  const handleNodeClick = (nodeId: string) => {
    setActiveNode(nodeId);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <Toolbar />

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 flex justify-between items-center">
          <span>{error}</span>
          <button onClick={clearError} className="text-sm hover:underline">
            关闭
          </button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Graph Panel */}
        <div className="flex-1 border-r border-gray-300">
          <KnowledgeGraph onNodeClick={handleNodeClick} />
        </div>

        {/* Conversation Panel */}
        <div className="w-[400px] bg-white">
          <ConversationPanel />
        </div>
      </div>
    </div>
  );
}
