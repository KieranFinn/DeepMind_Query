# DeepMind_Query

知识蛛网 LLM 对话 UI - 让学习路径清晰可见。

## 核心概念

传统 LLM 对话 UI 的局限：用户一次只能问一个问题，新概念引申出新概念时形成蛛网，但传统 UI 无法呈现这种知识结构。

DeepMind_Query 核心功能：
- **分支对话**：从任意 AI 回复继续追问，创建新的对话分支
- **知识图谱**：React Flow 可视化呈现对话之间的层级关系
- **路径高亮**：清晰显示当前学习路径
- **智能追问**：AI 自动分析对话内容，生成摘要和追问方向建议
- **大爆炸分析**：深度分析知识结构与思维模式（节点数 >= 3 时可用）
- **拖拽式图谱**：可停靠、可悬浮、可展开缩小的知识图谱
- **一键整理**：使用 dagre 自动布局算法整理图谱节点

## 项目结构

```
DeepMind_Query/
├── backend/          # FastAPI 后端
│   ├── main.py      # 应用入口 + CORS 配置
│   ├── models.py    # Pydantic 数据模型
│   ├── store.py     # Dolt 数据库持久化存储
│   ├── routes.py    # API 路由 (Regions/Graph/Messages/Analysis)
│   ├── analysis.py   # 大爆炸分析上下文构建
│   ├── llm.py       # MiniMax Anthropic API 集成
│   ├── db.py        # Dolt MySQL 连接管理
│   └── requirements.txt
├── frontend/         # React 前端
│   ├── src/
│   │   ├── components/
│   │   │   ├── ConversationPanel.tsx   # 对话面板
│   │   │   ├── DraggableKnowledgeGraph.tsx  # 可拖拽图谱
│   │   │   ├── MapViewer.tsx           # 全屏图谱视图
│   │   │   ├── BigBangModal.tsx        # 大爆炸分析弹窗
│   │   │   ├── FollowUpModal.tsx      # 智能追问弹窗
│   │   │   ├── RegionManager.tsx       # 知识区管理
│   │   │   └── NodeCard.tsx           # 圆形节点卡片
│   │   ├── store.ts      # Zustand 状态管理（含流式 SSE 工具）
│   │   ├── api.ts        # API 调用封装
│   │   ├── types.ts      # TypeScript 类型定义
│   │   └── App.tsx       # 主应用组件
│   └── package.json
```

## 快速启动

### 前置要求

- Node.js 18+
- Python 3.10+
- Dolt 数据库（MySQL 兼容端口 3307）
- MiniMax Anthropic API Key

### 后端

```bash
cd backend
cp .env.example .env  # 编辑 .env 填入你的 ANTHROPIC_API_KEY
pip install -r requirements.txt
python3 -c "import dolt; print('Dolt OK')"  # 验证 Dolt 可用
uvicorn main:app --reload --port 8000
```

后端运行在 http://localhost:8000

### 前端

```bash
cd frontend
npm install
npm run dev
```

访问 http://localhost:5173

## 功能说明

### 知识区 (Region)
- 创建、切换、重命名、删除知识区
- 每个知识区拥有独立的知识图谱
- 支持自定义颜色

### 会话节点 (Node)
- 每个节点代表一个对话会话
- 支持创建子节点（分支对话）
- 支持级联删除（删除节点时自动删除所有子节点）
- 双击图谱节点可快速创建分支

### 消息与对话
- 流式 AI 响应（SSE）
- Markdown 渲染（支持代码高亮、LaTeX 数学公式）
- 支持取消正在生成的响应

### 智能追问 (追问)
- 首次问答完成后自动在后台生成追问建议
- 显示对话摘要 + 2 个追问方向
- 支持自定义输入追问方向
- 可选择是否关联到当前会话

### 大爆炸分析 (大爆炸)
- 当知识区节点数 >= 3 时可用
- 深度分析知识结构、学习模式、认知盲区
- 支持后台运行，可随时切换区域
- 点击直接开始，无需确认

### 知识图谱
- **停靠模式**：固定在底部，避开模型选择框
- **悬浮模式**：可拖拽到任意位置
- **收起模式**：缩成圆形锚点
- **一键整理**：使用 dagre 自动布局算法排列节点
- **回到会话**：悬浮窗定位按钮，将当前节点居中

## API 端点

### Regions

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/regions` | 获取所有知识区 |
| POST | `/api/regions` | 创建知识区 |
| DELETE | `/api/regions/{region_id}` | 删除知识区 |
| PATCH | `/api/regions/{region_id}` | 更新知识区名称 |
| POST | `/api/regions/{region_id}/active` | 设置活跃知识区 |

### Graph / Nodes

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/regions/{region_id}/graph` | 获取知识区图谱 |
| POST | `/api/regions/{region_id}/graph/nodes` | 创建节点 |
| DELETE | `/api/regions/{region_id}/graph/nodes/{node_id}` | 删除节点（级联） |
| POST | `/api/regions/{region_id}/graph/nodes/{node_id}/children` | 创建子节点 |
| POST | `/api/regions/{region_id}/graph/nodes/{node_id}/message` | 发送消息（流式） |
| POST | `/api/regions/{region_id}/graph/nodes/{node_id}/suggest-branches` | 生成追问建议（流式） |
| POST | `/api/regions/{region_id}/analyze` | 大爆炸深度分析（流式） |

## 技术栈

- **后端**: FastAPI, Pydantic, httpx, SSE, MySQL/Dolt
- **前端**: React 18, React Flow, Zustand, Tailwind CSS, TypeScript, dagre
- **LLM**: MiniMax Anthropic API (默认模型 MiniMax-M2.7)
- **数据库**: Dolt (Git 版本化 SQL 数据库)

## 安全特性

- CORS 白名单限制
- SQL 参数化查询（防注入）
- XSS 防护（React 默认转义 + Markdown sanitization）
- AbortController 取消重复请求
- 输入长度验证

## 优化记录

### 2026-04-19 优化项

**后端：**
- 提取 `stream_response` 辅助函数，统一 SSE 流式响应处理
- BFS 级联删除使用 `deque` 提升效率
- 移除冗余的 `str()` 类型转换
- 大爆炸分析上下文构建移至锁外，避免阻塞

**前端：**
- 提取 `streamSSE` 工具函数，消除流式逻辑代码冗余（约 150 行）
- 移除 `loadGraph` 中冗余的 graph 同步
- `DraggableKnowledgeGraph` 移除 `draggedFlag` ref，简化拖拽逻辑
- `ConversationPanel` 合并重复的 useEffect，优化消息存在性检查

## License

MIT
