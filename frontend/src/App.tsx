import { useEffect, Component, ReactNode } from 'react';
import Toolbar from './components/Toolbar';
import KnowledgeGraph from './components/KnowledgeGraph';
import ConversationPanel from './components/ConversationPanel';
import { useConversationStore } from './store';

// Error Boundary for graceful error handling
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('DeepMind_Query Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="h-screen flex items-center justify-center"
          style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
        >
          <div className="text-center p-8 rounded-xl" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
            <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--error)' }}>
              出错了
            </h2>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
              {this.state.error?.message || '发生了未知错误'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg text-sm"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-primary)' }}
            >
              重新加载
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const { loadTree, setActiveNode, error, clearError, isHydrated, tree, activeNodeId, sendUserMessage } = useConversationStore();

  // Load tree on mount
  useEffect(() => {
    if (isHydrated) {
      loadTree();
    }
  }, [isHydrated, loadTree]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + Enter to send
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        const input = document.querySelector('textarea') as HTMLTextAreaElement;
        if (input && !input.disabled) {
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        }
      }

      // Escape to cancel streaming
      if (e.key === 'Escape') {
        const { cancelStreaming, isLoading } = useConversationStore.getState();
        if (isLoading) {
          cancelStreaming();
        }
        clearError();
      }

      // Arrow keys to navigate nodes in graph (when graph focused)
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const activeEl = document.activeElement;
        if (activeEl?.tagName === 'BODY' || activeEl?.classList.contains('react-flow')) {
          e.preventDefault();
          const { tree, activeNodeId, setActiveNode } = useConversationStore.getState();
          if (!tree || !activeNodeId) return;

          // Find current node and navigate
          const findNode = (node: typeof tree, id: string): typeof tree | null => {
            if (node.id === id) return node;
            for (const child of node.children) {
              const found = findNode(child, id);
              if (found) return found;
            }
            return null;
          };

          const currentNode = findNode(tree, activeNodeId);
          if (!currentNode) return;

          if (e.key === 'ArrowUp' && currentNode.parent_id) {
            setActiveNode(currentNode.parent_id);
          } else if (e.key === 'ArrowDown' && currentNode.children.length > 0) {
            setActiveNode(currentNode.children[0].id);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearError]);

  const handleNodeClick = (nodeId: string) => {
    setActiveNode(nodeId);
  };

  return (
    <ErrorBoundary>
      <div
        className="h-screen flex flex-col"
        style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
      >
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
          {/* Graph Panel - responsive width */}
          <div
            className="flex-1 min-w-0"
            style={{ borderRight: '1px solid var(--border)' }}
          >
            <KnowledgeGraph onNodeClick={handleNodeClick} />
          </div>

          {/* Conversation Panel - fixed width on desktop, full on mobile */}
          <div
            className="w-full md:w-[420px] flex-shrink-0"
            style={{ backgroundColor: 'var(--bg-secondary)' }}
          >
            <ConversationPanel />
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}

export default App;
