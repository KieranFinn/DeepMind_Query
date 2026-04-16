import { useEffect, Component, ReactNode } from 'react';
import RegionManager from './components/RegionManager';
import KnowledgeGraph from './components/KnowledgeGraph';
import ConversationPanel from './components/ConversationPanel';
import { useStore } from './store';

// Error Boundary
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

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="h-screen flex items-center justify-center"
          style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
        >
          <div className="text-center p-8 rounded-xl" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
            <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--error)' }}>出错了</h2>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>{this.state.error?.message || '发生了未知错误'}</p>
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
  const { loadRegions, isHydrated, error, clearError, getActiveRegion } = useStore();

  useEffect(() => {
    if (isHydrated) {
      loadRegions();
    }
  }, [isHydrated, loadRegions]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        const input = document.querySelector('textarea') as HTMLTextAreaElement;
        if (input && !input.disabled) {
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        }
      }
      if (e.key === 'Escape') {
        const { cancelStreaming, isLoading } = useStore.getState();
        if (isLoading) cancelStreaming();
        clearError();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearError]);

  const activeRegion = getActiveRegion();

  return (
    <ErrorBoundary>
      <div
        className="h-screen flex"
        style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
      >
        {/* Left: Region & Session Manager */}
        <div
          className="w-[280px] flex-shrink-0"
          style={{ borderRight: '1px solid var(--border)' }}
        >
          <RegionManager />
        </div>

        {/* Center: Knowledge Graph */}
        <div
          className="w-[400px] flex-shrink-0"
          style={{ borderRight: '1px solid var(--border)' }}
        >
          <KnowledgeGraph />
        </div>

        {/* Right: Conversation */}
        <div className="flex-1 min-w-0">
          <ConversationPanel />
        </div>

        {/* Error Banner */}
        {error && (
          <div
            className="fixed bottom-4 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-xl shadow-lg animate-fade-in flex items-center gap-4"
            style={{ backgroundColor: 'var(--error)', color: '#fff', zIndex: 100 }}
          >
            <span className="text-sm">{error}</span>
            <button onClick={clearError} className="text-sm hover:underline">关闭</button>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

export default App;
