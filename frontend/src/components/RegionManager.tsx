import { useState } from 'react';
import { useStore, MODELS } from '../store';

const REGION_COLORS = [
  '#d4a574', // warm cream (default)
  '#7d9a6a', // sage green
  '#6a8fa7', // slate blue
  '#a77d7d', // dusty rose
  '#9a8fa7', // lavender
  '#a7986a', // golden brown
];

export default function RegionManager() {
  const {
    regions, activeRegionId, activeSessionId,
    createRegion, deleteRegion, setActiveRegion,
    createSession, setActiveSession,
    selectedModel, setModel
  } = useStore();

  const [showNewRegion, setShowNewRegion] = useState(false);
  const [newRegionName, setNewRegionName] = useState('');

  const activeRegion = regions.find(r => r.id === activeRegionId);

  const handleCreateRegion = () => {
    if (newRegionName.trim()) {
      const color = REGION_COLORS[regions.length % REGION_COLORS.length];
      createRegion(newRegionName.trim(), '', color);
      setNewRegionName('');
      setShowNewRegion(false);
    }
  };

  const handleCreateSession = () => {
    if (activeRegionId) {
      createSession(activeRegionId, '新会话');
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      {/* Regions List */}
      <div className="p-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            知识区 ({regions.length})
          </span>
          <button
            onClick={() => setShowNewRegion(true)}
            className="text-xs px-2 py-1 rounded transition-all hover:scale-105"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-primary)' }}
          >
            + 新建
          </button>
        </div>

        {/* New Region Input */}
        {showNewRegion && (
          <div className="flex gap-2 mb-2 animate-fade-in">
            <input
              value={newRegionName}
              onChange={(e) => setNewRegionName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateRegion()}
              placeholder="知识区名称..."
              autoFocus
              className="flex-1 px-2 py-1 text-sm rounded"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)'
              }}
            />
            <button onClick={handleCreateRegion} className="text-sm px-2 py-1 rounded" style={{ backgroundColor: 'var(--success)', color: '#fff' }}>✓</button>
            <button onClick={() => setShowNewRegion(false)} className="text-sm px-2 py-1 rounded" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}>✕</button>
          </div>
        )}

        {/* Region Items */}
        <div className="space-y-1 max-h-[200px] overflow-y-auto">
          {regions.map(region => (
            <div key={region.id} className="flex items-center gap-2">
              <button
                onClick={() => setActiveRegion(region.id)}
                className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-all"
                style={{
                  backgroundColor: region.id === activeRegionId ? 'var(--active-path)' : 'transparent',
                  color: region.id === activeRegionId ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: region.color }}
                />
                <span className="truncate">{region.name}</span>
                <span className="text-xs opacity-60 ml-auto">{region.sessions.length}</span>
              </button>
              {regions.length > 1 && (
                <button
                  onClick={() => deleteRegion(region.id)}
                  className="text-xs px-1 opacity-50 hover:opacity-100"
                  style={{ color: 'var(--error)' }}
                >
                  🗑️
                </button>
              )}
            </div>
          ))}
          {regions.length === 0 && (
            <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>
              暂无知识区
            </p>
          )}
        </div>
      </div>

      {/* Sessions List */}
      {activeRegion && (
        <div className="flex-1 p-3 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              会话 ({activeRegion.sessions.length})
            </span>
            <button
              onClick={handleCreateSession}
              className="text-xs px-2 py-1 rounded transition-all hover:scale-105"
              style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              + 会话
            </button>
          </div>

          <div className="space-y-1">
            {activeRegion.sessions.map(session => (
              <button
                key={session.id}
                onClick={() => setActiveSession(session.id)}
                className="w-full text-left px-2 py-2 rounded text-sm transition-all"
                style={{
                  backgroundColor: session.id === activeSessionId ? 'var(--bg-tertiary)' : 'transparent',
                  color: session.id === activeSessionId ? 'var(--text-primary)' : 'var(--text-secondary)',
                  borderLeft: session.id === activeSessionId ? `2px solid ${activeRegion.color}` : '2px solid transparent'
                }}
              >
                <div className="truncate">{session.title}</div>
                <div className="text-xs opacity-50">
                  {session.root_node.messages.length} 条消息 · {session.root_node.children.length} 个分支
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Model Selector */}
      <div className="p-3" style={{ borderTop: '1px solid var(--border)' }}>
        <select
          value={selectedModel}
          onChange={(e) => setModel(e.target.value)}
          className="w-full px-2 py-1.5 text-xs rounded"
          style={{
            backgroundColor: 'var(--bg-tertiary)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border)'
          }}
        >
          {MODELS.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
