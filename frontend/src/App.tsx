import { useEffect, Component, ReactNode, useState, useRef } from 'react';
import RegionManager from './components/RegionManager';
import ConversationPanel from './components/ConversationPanel';
import MapViewer from './components/MapViewer';
import DraggableKnowledgeGraph from './components/DraggableKnowledgeGraph';
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
  const { loadRegions, isHydrated, errorQueue, clearError } = useStore();
  const [activeTab, setActiveTab] = useState<'main' | 'browser'>('main');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Track which errors are fading out
  const [fadingIds, setFadingIds] = useState<Set<string>>(new Set());
  // Store timer IDs per error for cancellation
  const timersRef = useRef<Map<string, { fade: number; remove: number }>>(new Map());

  useEffect(() => {
    if (isHydrated) {
      loadRegions();
    }
  }, [isHydrated, loadRegions]);

  // Auto-dismiss errors after 4 seconds with fade-out
  useEffect(() => {
    errorQueue.forEach(error => {
      // Skip if already fading or already has timers
      if (fadingIds.has(error.id)) return;
      if (timersRef.current.has(error.id)) return;

      // Start fade-out at 3.5 seconds, remove at 4 seconds
      const fadeTimer = window.setTimeout(() => {
        setFadingIds(prev => new Set([...prev, error.id]));
      }, 3500);

      const removeTimer = window.setTimeout(() => {
        clearError(error.id);
        timersRef.current.delete(error.id);
        setFadingIds(prev => {
          const next = new Set(prev);
          next.delete(error.id);
          return next;
        });
      }, 4000);

      timersRef.current.set(error.id, { fade: fadeTimer, remove: removeTimer });
    });

    // Cleanup: clear all timers on unmount or when errorQueue is cleared
    return () => {
      timersRef.current.forEach((timers) => {
        clearTimeout(timers.fade);
        clearTimeout(timers.remove);
      });
      timersRef.current.clear();
    };
  }, [errorQueue, clearError, fadingIds]);

  const handleMouseEnter = (id: string) => {
    const timers = timersRef.current.get(id);
    if (timers) {
      clearTimeout(timers.fade);
      clearTimeout(timers.remove);
      timersRef.current.delete(id);
    }
  };

  const handleMouseLeave = (id: string) => {
    // Clear existing timers first to prevent duplicates
    const existingTimers = timersRef.current.get(id);
    if (existingTimers) {
      clearTimeout(existingTimers.fade);
      clearTimeout(existingTimers.remove);
    }

    // Start new timers
    const fadeTimer = window.setTimeout(() => {
      setFadingIds(prev => new Set([...prev, id]));
    }, 3500);

    const removeTimer = window.setTimeout(() => {
      clearError(id);
      timersRef.current.delete(id);
      setFadingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 4000);

    timersRef.current.set(id, { fade: fadeTimer, remove: removeTimer });
  };

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

  return (
    <ErrorBoundary>
      <div
        className="h-screen flex flex-col"
        style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
      >
        {/* Tab bar */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border)',
            backgroundColor: 'var(--bg-secondary)',
          }}
        >
          <button
            onClick={() => setActiveTab('main')}
            style={{
              padding: '10px 20px',
              border: 'none',
              borderBottom: activeTab === 'main' ? '2px solid var(--accent)' : '2px solid transparent',
              backgroundColor: 'transparent',
              color: activeTab === 'main' ? 'var(--accent)' : 'var(--text-muted)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            对话
          </button>
          <button
            onClick={() => setActiveTab('browser')}
            style={{
              padding: '10px 20px',
              border: 'none',
              borderBottom: activeTab === 'browser' ? '2px solid var(--accent)' : '2px solid transparent',
              backgroundColor: 'transparent',
              color: activeTab === 'browser' ? 'var(--accent)' : 'var(--text-muted)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            MapViewer
          </button>
        </div>

        {/* Content area */}
        <div className="flex-1 flex min-h-0">
          {activeTab === 'main' ? (
            <>
              {/* Left: Region & Session Manager - dynamic width */}
              <div
                style={{
                  width: sidebarCollapsed ? '32px' : '280px',
                  flexShrink: 0,
                  borderRight: '1px solid var(--border)',
                  transition: 'width 0.2s ease',
                }}
              >
                <RegionManager
                  collapsed={sidebarCollapsed}
                  onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
                />
              </div>

              {/* Right: Conversation - takes remaining space */}
              <div className="flex-1 min-w-0">
                <ConversationPanel />
              </div>

              {/* Floating Draggable Knowledge Graph */}
              <DraggableKnowledgeGraph sidebarCollapsed={sidebarCollapsed} />
            </>
          ) : (
            /* Map Viewer (full page) */
            <div className="flex-1">
              <MapViewer />
            </div>
          )}
        </div>

        {/* Error Banner Queue - show up to 3 errors */}
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 flex flex-col gap-2 z-50" style={{ pointerEvents: 'none' }}>
          {errorQueue.slice(0, 3).map((error, index) => (
            <div
              key={error.id}
              className={`px-6 py-3 rounded-xl shadow-lg flex items-center gap-4 ${fadingIds.has(error.id) ? 'animate-fade-out' : 'animate-fade-in'}`}
              style={{
                backgroundColor: 'var(--error)',
                color: '#fff',
                pointerEvents: 'auto',
                animationDelay: `${index * 0.1}s`
              }}
              onMouseEnter={() => handleMouseEnter(error.id)}
              onMouseLeave={() => handleMouseLeave(error.id)}
            >
              <span className="text-sm">{error.message}</span>
              <button
                onClick={() => {
                  // Clear timers first
                  const timers = timersRef.current.get(error.id);
                  if (timers) {
                    clearTimeout(timers.fade);
                    clearTimeout(timers.remove);
                    timersRef.current.delete(error.id);
                  }
                  clearError(error.id);
                  setFadingIds(prev => {
                    const next = new Set(prev);
                    next.delete(error.id);
                    return next;
                  });
                }}
                className="text-sm hover:underline"
              >
                关闭
              </button>
            </div>
          ))}
        </div>
      </div>
    </ErrorBoundary>
  );
}

export default App;
