import uuid
import json
from fastapi import APIRouter, HTTPException, Query
from sse_starlette.sse import EventSourceResponse
from store import store
from models import (
    CreateRegionRequest,
    CreateNodeRequest,
    SendMessageRequest,
    KnowledgeRegion,
    Graph,
)
from llm import stream_chat

router = APIRouter(prefix="/api", tags=["knowledge-regions"])


# ============ Regions ============

@router.get("/regions", response_model=list[KnowledgeRegion])
async def get_all_regions():
    """Get all knowledge regions"""
    async with await store.lock():
        return store.get_all_regions()


@router.post("/regions", response_model=KnowledgeRegion)
async def create_region(req: CreateRegionRequest):
    """Create a new knowledge region"""
    async with await store.lock():
        region = store.create_region(
            name=req.name,
            description=req.description or "",
            color=req.color or "#d4a574",
            tags=req.tags or []
        )
        # First node is created automatically inside create_region
        return region


@router.get("/regions/{region_id}", response_model=KnowledgeRegion)
async def get_region(region_id: uuid.UUID):
    """Get a specific region"""
    async with await store.lock():
        region = store.get_region(str(region_id))
        if not region:
            raise HTTPException(status_code=404, detail="Region not found")
        return region


@router.delete("/regions/{region_id}")
async def delete_region(region_id: uuid.UUID):
    """Delete a region"""
    async with await store.lock():
        if not store.delete_region(str(region_id)):
            raise HTTPException(status_code=404, detail="Region not found")
        return {"success": True}


@router.patch("/regions/{region_id}")
async def update_region(region_id: uuid.UUID, name: str = Query(..., description="New name for the region")):
    """Update region name"""
    if not name or not name.strip():
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    if len(name.strip()) > 100:
        raise HTTPException(status_code=400, detail="Name cannot exceed 100 characters")
    async with await store.lock():
        if not store.update_region_name(str(region_id), name.strip()):
            raise HTTPException(status_code=404, detail="Region not found")
        return {"success": True}


@router.post("/regions/{region_id}/active")
async def set_active_region(region_id: uuid.UUID):
    """Set active region"""
    async with await store.lock():
        if not store.set_active_region(str(region_id)):
            raise HTTPException(status_code=404, detail="Region not found")
        return {"success": True}


# ============ Graph / Nodes ============

@router.get("/regions/{region_id}/graph", response_model=Graph)
async def get_graph(region_id: uuid.UUID):
    """Get the graph for a region"""
    async with await store.lock():
        graph = store.get_graph(str(region_id))
        if not graph:
            raise HTTPException(status_code=404, detail="Region not found")
        return graph


@router.get("/regions/{region_id}/graph/nodes", response_model=list)
async def get_nodes(region_id: uuid.UUID):
    """Get all nodes in a region's graph"""
    async with await store.lock():
        graph = store.get_graph(str(region_id))
        if not graph:
            raise HTTPException(status_code=404, detail="Region not found")
        return graph.nodes


@router.post("/regions/{region_id}/graph/nodes", response_model=dict)
async def create_node(region_id: uuid.UUID, req: CreateNodeRequest):
    """Create a new node (session) in the graph"""
    async with await store.lock():
        node = store.create_node(str(region_id), req.title, req.parent_id)
        if not node:
            raise HTTPException(status_code=404, detail="Region not found")
        return {"node": node, "success": True}


@router.get("/regions/{region_id}/graph/nodes/{node_id}")
async def get_node(region_id: uuid.UUID, node_id: uuid.UUID):
    """Get a specific node"""
    async with await store.lock():
        node = store.get_node(str(region_id), str(node_id))
        if not node:
            raise HTTPException(status_code=404, detail="Node not found")
        return node


@router.delete("/regions/{region_id}/graph/nodes/{node_id}")
async def delete_node(region_id: uuid.UUID, node_id: uuid.UUID):
    """Delete a node"""
    async with await store.lock():
        if not store.delete_node(str(region_id), str(node_id)):
            raise HTTPException(status_code=404, detail="Node not found")
        return {"success": True}


# ============ Messages ============

@router.post("/regions/{region_id}/graph/nodes/{node_id}/message")
async def send_message(region_id: uuid.UUID, node_id: uuid.UUID, req: SendMessageRequest):
    """Send a message to a node and stream the assistant response"""
    if not req.content or not req.content.strip():
        raise HTTPException(status_code=400, detail="Message content cannot be empty")

    async with await store.lock():
        node = store.get_node(str(region_id), str(node_id))
        if not node:
            raise HTTPException(status_code=404, detail="Node not found")

        # Build context from node's messages
        messages = []
        for msg in node.messages:
            messages.append({"role": msg.role, "content": msg.content})

        # Add user message
        store.add_message_to_node(str(region_id), str(node_id), "user", req.content.strip())
        messages.append({"role": "user", "content": req.content.strip()})

    async def generate():
        full_response = ""
        try:
            async for chunk in stream_chat(req.model, messages):
                full_response += chunk
                yield {"event": "message", "data": json.dumps({"content": chunk})}

            if full_response:
                async with await store.lock():
                    store.add_message_to_node(str(region_id), str(node_id), "assistant", full_response)
        except Exception as e:
            yield {"event": "error", "data": json.dumps({"error": str(e)})}

    return EventSourceResponse(generate())


@router.post("/regions/{region_id}/graph/nodes/{node_id}/children", response_model=dict)
async def create_child_node(region_id: uuid.UUID, node_id: uuid.UUID, title: str = Query(None, description="Title for the new child node")):
    """Create a child node (branch) - creates edge from parent to child"""
    async with await store.lock():
        parent = store.get_node(str(region_id), str(node_id))
        if not parent:
            raise HTTPException(status_code=404, detail="Node not found")

        child = store.create_node(str(region_id), title, parent_id=str(node_id))
        if not child:
            raise HTTPException(status_code=404, detail="Failed to create child node")

        return {"node": child, "success": True}


@router.post("/regions/{region_id}/graph/nodes/{node_id}/suggest-branches")
async def suggest_branches(region_id: uuid.UUID, node_id: uuid.UUID):
    """Generate follow-up suggestions based on conversation history"""
    async with await store.lock():
        node = store.get_node(str(region_id), str(node_id))
        if not node:
            raise HTTPException(status_code=404, detail="Node not found")

        # Check if there's enough conversation for suggestions
        messages = node.messages
        has_user_msg = any(m.role == "user" for m in messages)
        has_assistant_msg = any(m.role == "assistant" for m in messages)
        if not has_user_msg or not has_assistant_msg:
            raise HTTPException(status_code=400, detail="Need at least one user and assistant message")

        # Build conversation context for LLM
        conv_lines = []
        for msg in messages:
            role = "用户" if msg.role == "user" else "助手"
            content = msg.content[:500].replace('\n', ' ')
            conv_lines.append(f"[{role}]: {content}")

        conversation = "\n".join(conv_lines)

    system_prompt = """你是一位专业的知识探索助手。你的任务是根据对话内容，生成两个可能有价值的追问方向。

请分析对话内容，找出：
1. 用户最关心的核心问题或主题
2. 对话中提到的但未深入探讨的相关领域
3. 用户可能想要进一步了解的延伸方向

请用中文输出，格式如下：
- 一段50字左右的对话摘要
- 两个可能的追问方向（每个10字以内，简洁有力）

例如输出格式：
【摘要】用户询问了机器学习中的监督学习和无监督学习的区别...
【方向1】强化学习基础
【方向2】神经网络原理"""

    async def generate():
        full_response = ""
        try:
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": conversation}
            ]
            async for chunk in stream_chat("MiniMax-M2.7", messages):
                full_response += chunk
                yield {"event": "message", "data": json.dumps({"content": chunk})}

            # Parse the response to extract summary and directions
            if full_response:
                summary = ""
                directions = []
                for line in full_response.split('\n'):
                    if line.startswith('【摘要】'):
                        summary = line[4:].strip()
                    elif line.startswith('【方向1】'):
                        directions.append(line[4:].strip())
                    elif line.startswith('【方向2】'):
                        directions.append(line[4:].strip())

                # Store structured result
                store._last_suggestion = {
                    "node_id": str(node_id),
                    "summary": summary,
                    "directions": directions,
                }
        except Exception as e:
            yield {"event": "error", "data": json.dumps({"error": str(e)})}

    return EventSourceResponse(generate())


# ============ LLM Analysis ============

@router.post("/regions/{region_id}/analyze")
async def analyze_region(region_id: uuid.UUID):
    """Deep LLM analysis of the knowledge graph"""
    async with await store.lock():
        region = store.get_region(str(region_id))
        if not region:
            raise HTTPException(status_code=404, detail="Region not found")

        # Build comprehensive context for LLM
        graph = region.graph
        context_lines = [
            f"# 知识区分析报告：{region.name}",
            f"共 {len(graph.nodes)} 个会话，{len(graph.edges)} 条关联",
            "",
            "## 知识结构",
        ]

        # Build parent->children map from edges
        children_map: dict[str, list[str]] = {}
        for edge in graph.edges:
            src, tgt = str(edge.source), str(edge.target)
            if src not in children_map:
                children_map[src] = []
            children_map[src].append(tgt)

        # Find root nodes
        all_targets = {str(e.target) for e in graph.edges}
        roots = [n for n in graph.nodes if str(n.id) not in all_targets]

        # Build tree representation with content
        def describe_node(node_id: str, depth: int = 0) -> list[str]:
            node = next((n for n in graph.nodes if str(n.id) == node_id), None)
            if not node:
                return []
            indent = "  " * depth
            lines = [f"{indent}- **{node.title}** ({len(node.messages)} 条消息)"]
            if node.messages:
                # Show last message summary
                last_msg = node.messages[-1]
                preview = last_msg.content[:100].replace('\n', ' ')
                lines.append(f"{indent}  最新: {preview}...")
            for child_id in children_map.get(node_id, []):
                lines.extend(describe_node(child_id, depth + 1))
            return lines

        for root in roots:
            context_lines.extend(describe_node(str(root.id), 0))

        # Conversation content summary
        context_lines.append("")
        context_lines.append("## 对话内容摘要")
        for node in graph.nodes:
            if node.messages:
                context_lines.append(f"\n### {node.title}")
                for msg in node.messages[-3:]:  # Last 3 messages per node
                    role = "用户" if msg.role == "user" else "助手"
                    content = msg.content[:300].replace('\n', ' ')
                    context_lines.append(f"[{role}]: {content}")

        context = "\n".join(context_lines)

    system_prompt = """你是一位专业的知识管理顾问和思维模式分析师。你的任务是对用户的知识图谱进行深度分析。

请从以下几个维度进行深度分析：

1. **知识结构诊断**
   - 分析会话之间的关联是否合理
   - 识别主题的深浅分布
   - 发现知识网络的结构性问题

2. **学习模式识别**
   - 判断用户是习惯深度钻研还是广泛探索
   - 分析追问的层次和深度
   - 识别用户的思维习惯

3. **认知盲区发现**
   - 找出用户从未触及的相关领域
   - 识别理解不完整的概念
   - 发现论证链条的薄弱环节

4. **个性化建议**
   - 针对具体内容给出下一步探索方向
   - 提供补全知识网络的具体问题建议
   - 给出深化理解的具体路径

请用中文输出，分析要深入、具体、有见地，不要泛泛而谈。"""

    async def generate():
        full_response = ""
        try:
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": context}
            ]
            async for chunk in stream_chat("MiniMax-M2.7", messages):
                full_response += chunk
                yield {"event": "message", "data": json.dumps({"content": chunk})}

            # Store analysis result
            if full_response:
                async with await store.lock():
                    # Store the last analysis in memory (could be extended to DB)
                    store._last_analysis = {
                        "region_id": str(region_id),
                        "content": full_response,
                        "timestamp": str(region_id)  # simplified
                    }
        except Exception as e:
            yield {"event": "error", "data": json.dumps({"error": str(e)})}

    return EventSourceResponse(generate())


# ============ Health Check ============

@router.get("/")
async def root():
    async with await store.lock():
        regions_count = len(store.regions)
    return {
        "message": "DeepMind_Query API",
        "status": "running",
        "regions_count": regions_count
    }
