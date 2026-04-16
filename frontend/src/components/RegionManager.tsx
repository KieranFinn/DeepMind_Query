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

interface RegionManagerProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function RegionManager({ collapsed, onToggleCollapse }: RegionManagerProps) {
  const {
    regions, activeRegionId, activeNodeId,
    createRegion, deleteRegion, updateRegion, setActiveRegion,
    setActiveNode, createNode,
    selectedModel, setModel
  } = useStore();

  const [showNewRegion, setShowNewRegion] = useState(false);
  const [newRegionName, setNewRegionName] = useState('');
  const [editingRegionId, setEditingRegionId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deleteConfirmRegionId, setDeleteConfirmRegionId] = useState<string | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');

  const activeRegion = regions.find(r => r.id === activeRegionId);

  const handleCreateRegion = async () => {
    if (newRegionName.trim()) {
      const color = REGION_COLORS[regions.length % REGION_COLORS.length];
      await createRegion(newRegionName.trim(), '', color);
      setNewRegionName('');
      setShowNewRegion(false);
    }
  };

  const handleCreateNode = async () => {
    if (activeRegionId) {
      await createNode('新会话');
    }
  };

  const startEditing = (regionId: string, currentName: string) => {
    setEditingRegionId(regionId);
    setEditingName(currentName);
  };

  const saveEditing = () => {
    if (editingRegionId && editingName.trim()) {
      updateRegion(editingRegionId, editingName.trim());
    }
    setEditingRegionId(null);
    setEditingName('');
  };

  const cancelEditing = () => {
    setEditingRegionId(null);
    setEditingName('');
  };

  if (collapsed) {
    return (
      <div
        className="h-full flex flex-col items-center justify-center cursor-pointer"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          width: '32px',
        }}
        onClick={onToggleCollapse}
        title="展开侧边栏"
      >
        <div
          style={{
            width: '16px',
            height: '16px',
            borderRadius: '4px',
            backgroundColor: activeRegion?.color || 'var(--accent)',
          }}
        />
        <div
          style={{
            fontSize: '10px',
            color: 'var(--text-muted)',
            marginTop: '8px',
          }}
        >
          {regions.length}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      {/* Header with collapse button */}
      <div
        className="flex items-center justify-between p-2"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <span
          className="text-xs font-medium"
          style={{ color: 'var(--text-muted)' }}
        >
          知识区
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleCollapse}
            className="text-xs px-2 py-1 rounded"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
            }}
            title="收缩"
          >
            ◀
          </button>
          <button
            onClick={() => setShowNewRegion(true)}
            className="text-xs px-2 py-1 rounded transition-all hover:scale-105"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-primary)' }}
          >
            + 新建
          </button>
        </div>
      </div>

      {/* New Region Input */}
      {showNewRegion && (
        <div
          className="p-2 animate-fade-in"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex gap-2">
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
            <button
              onClick={handleCreateRegion}
              className="text-sm px-2 py-1 rounded"
              style={{ backgroundColor: 'var(--success)', color: '#fff' }}
            >
              ✓
            </button>
            <button
              onClick={() => setShowNewRegion(false)}
              className="text-sm px-2 py-1 rounded"
              style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Regions List */}
      <div className="p-2" style={{ maxHeight: '200px', overflowY: 'auto' }}>
        <div className="space-y-1">
          {regions.map(region => (
            <div key={region.id} className="flex items-center gap-2">
              {editingRegionId === region.id ? (
                <>
                  <input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEditing();
                      if (e.key === 'Escape') cancelEditing();
                    }}
                    autoFocus
                    className="flex-1 px-2 py-1 text-sm rounded"
                    style={{
                      backgroundColor: 'var(--bg-tertiary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--accent)'
                    }}
                  />
                  <button onClick={saveEditing} className="text-xs px-1" style={{ color: 'var(--success)' }}>✓</button>
                  <button onClick={cancelEditing} className="text-xs px-1" style={{ color: 'var(--text-muted)' }}>✕</button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setActiveRegion(region.id)}
                    onDoubleClick={() => startEditing(region.id, region.name)}
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
                    <span className="text-xs opacity-60 ml-auto">{region.graph.nodes.length}</span>
                  </button>
                  <button
                    onClick={() => startEditing(region.id, region.name)}
                    className="text-xs px-1 opacity-50 hover:opacity-100"
                    style={{ color: 'var(--text-muted)' }}
                    title="重命名"
                  >
                    ✎
                  </button>
                  {regions.length > 1 && (
                    <button
                      onClick={() => setDeleteConfirmRegionId(region.id)}
                      className="text-xs px-1 opacity-50 hover:opacity-100"
                      style={{ color: 'var(--error)' }}
                    >
                      🗑️
                    </button>
                  )}
                </>
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

      {/* Delete Confirmation Dialog */}
      {deleteConfirmRegionId && (() => {
        const regionToDelete = regions.find(r => r.id === deleteConfirmRegionId);
        if (!regionToDelete) return null;
        const isMatch = deleteConfirmName === regionToDelete.name;
        return (
          <div
            className="fixed inset-0 flex items-center justify-center z-50"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            onClick={() => { setDeleteConfirmRegionId(null); setDeleteConfirmName(''); }}
          >
            <div
              className="rounded-xl p-4 w-80 shadow-2xl"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                确认删除知识区
              </h3>
              <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                删除后无法恢复。请输入 <strong>{regionToDelete.name}</strong> 确认：
              </p>
              <input
                type="text"
                value={deleteConfirmName}
                onChange={e => setDeleteConfirmName(e.target.value)}
                placeholder="输入知识区名称"
                className="w-full px-3 py-2 text-sm rounded mb-3"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)'
                }}
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setDeleteConfirmRegionId(null); setDeleteConfirmName(''); }}
                  className="px-3 py-1.5 text-xs rounded"
                  style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    if (isMatch) {
                      deleteRegion(deleteConfirmRegionId);
                      setDeleteConfirmRegionId(null);
                      setDeleteConfirmName('');
                    }
                  }}
                  disabled={!isMatch}
                  className="px-3 py-1.5 text-xs rounded"
                  style={{
                    backgroundColor: isMatch ? 'var(--error)' : 'var(--bg-hover)',
                    color: isMatch ? '#fff' : 'var(--text-muted)',
                    cursor: isMatch ? 'pointer' : 'not-allowed'
                  }}
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Nodes List (in active region) */}
      {activeRegion && (
        <div className="flex-1 p-2 overflow-y-auto" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              会话 ({activeRegion.graph.nodes.length})
            </span>
            <button
              onClick={handleCreateNode}
              className="text-xs px-2 py-1 rounded transition-all hover:scale-105"
              style={{
                backgroundColor: 'var(--bg-hover)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)'
              }}
            >
              + 会话
            </button>
          </div>

          <div className="space-y-1">
            {activeRegion.graph.nodes.map(node => {
              const nodeIdStr = String(node.id);
              return (
                <button
                  key={node.id}
                  onClick={() => setActiveNode(nodeIdStr)}
                  className="w-full text-left px-2 py-2 rounded text-sm transition-all"
                  style={{
                    backgroundColor: nodeIdStr === activeNodeId ? 'var(--bg-tertiary)' : 'transparent',
                    color: nodeIdStr === activeNodeId ? 'var(--text-primary)' : 'var(--text-secondary)',
                    borderLeft: nodeIdStr === activeNodeId ? `2px solid ${activeRegion.color}` : '2px solid transparent'
                  }}
                >
                  <div className="truncate">{node.title}</div>
                  <div className="text-xs opacity-50">
                    {node.messages.length} 条消息
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Model Selector */}
      <div className="p-2 relative" style={{ borderTop: '1px solid var(--border)', zIndex: 50 }}>
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
