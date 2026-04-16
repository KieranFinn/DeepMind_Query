import { useConversationStore } from '../store';

export default function Toolbar() {
  const { createRootConversation, tree, loadTree, isLoading } = useConversationStore();

  const handleNew = async () => {
    await createRootConversation('新对话');
  };

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-gray-200">
      <h1 className="font-semibold text-gray-800 mr-4">DeepMind_Query</h1>
      <button
        onClick={handleNew}
        disabled={isLoading}
        className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
      >
        新对话
      </button>
      <button
        onClick={() => loadTree()}
        disabled={isLoading}
        className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
      >
        刷新
      </button>
      <div className="flex-1" />
      <span className="text-xs text-gray-400">
        {tree ? '已连接' : '未连接'}
      </span>
    </div>
  );
}
