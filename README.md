# DeepMind_Query

知识蛛网 LLM 对话 UI - 让学习路径清晰可见。

## 核心概念

传统 LLM 对话 UI 的局限：用户一次只能问一个问题，新概念引申出新概念时形成蛛网，但传统 UI 无法呈现这种知识结构。

DeepMind_Query 核心功能：
- **分支对话**：从任意 AI 回复继续追问，创建新的对话分支
- **知识图谱**：React Flow 可视化呈现对话之间的层级关系
- **路径高亮**：清晰显示当前学习路径

## 项目结构

```
DeepMind_Query/
├── backend/          # FastAPI 后端
│   ├── main.py      # 应用入口
│   ├── models.py    # Pydantic 数据模型
│   ├── store.py     # 内存会话存储
│   ├── routes.py    # API 路由
│   ├── llm.py       # LLM API 集成
│   └── requirements.txt
└── frontend/         # React 前端 (开发中)
```

## 快速启动

### 后端

```bash
cd backend
cp .env.example .env  # 编辑 .env 填入你的 API Key
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 前端 (待实现)

```bash
cd frontend
npm install
npm run dev
```

访问 http://localhost:5173

## API 端点

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/conversations` | 创建新对话 |
| GET | `/api/conversations` | 获取完整对话树 |
| GET | `/api/conversations/{id}` | 获取节点及子树 |
| POST | `/api/conversations/{id}/message` | 发送消息 (流式响应) |
| POST | `/api/conversations/{id}/branch` | 创建分支 |

## 技术栈

- **后端**: FastAPI, Pydantic, httpx, SSE
- **前端**: React, React Flow, Zustand, Tailwind CSS
- **LLM**: OpenAI API (默认 gpt-4o-mini)

## License

MIT
