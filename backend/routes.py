"""API Routes - Thin layer for parameter validation and response formatting"""
import uuid
import json
import re
import logging
from collections.abc import AsyncGenerator
from fastapi import APIRouter, HTTPException, Query
from sse_starlette.sse import EventSourceResponse

from store import store

logger = logging.getLogger(__name__)


def error_response(error: str, code: str):
    """Return a sanitized error response without stack trace"""
    return {"error": error, "code": code}


def parse_llm_json_response(response: str, context: str = "unknown") -> list:
    """
    Parse LLM JSON response with robust fallback.
    Tries json.loads first, then regex extraction.

    Args:
        response: Raw LLM response text
        context: Context string for logging (e.g., "extract_knowledge", "batch_merge")

    Returns:
        Parsed JSON (list or dict), or empty list/dict on failure
    """
    if not response:
        return []

    # Try direct JSON parse first (most reliable)
    try:
        return json.loads(response)
    except json.JSONDecodeError:
        pass

    # Fallback: extract JSON array or object using regex
    json_match = re.search(r'\[.*\]', response, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group())
        except json.JSONDecodeError as e:
            logger.warning(f"JSON extract failed in {context}: {e}, response: {response[:200]}")
    else:
        # Try to find JSON object
        json_match = re.search(r'\{.*\}', response, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group())
            except json.JSONDecodeError as e:
                logger.warning(f"JSON extract failed in {context}: {e}, response: {response[:200]}")

    logger.warning(f"No JSON found in {context} response: {response[:200]}")
    return []


EXTRACTION_PROMPT = """你是一位知识管理专家。请从以下对话中提取关键知识点（实体、概念、技术等）。

要求：
- 只提取真正有价值的知识，不要提取通用常识
- 每个知识点简洁明了，20字以内
- 以JSON数组格式输出，每个元素是知识点字符串
- 如果没有有价值的知识点，返回空数组

对话内容：
{conversation}
"""


MATCH_PROMPT = """你是一位知识匹配专家。用户要开始一个新对话。

用户问题：{question}

相关知识点：
{knowledge_points_list}

请找出与用户问题最相关的知识点（最多5个）。

要求：
- 只返回确实相关的知识点
- 按相关度排序
- 以JSON数组格式输出，每个元素包含知识点ID和相关性理由
- 如果没有相关的，返回空数组
"""

# Batch version - checks all KPs against new content in a single LLM call (fixes N+1 bug)
MERGE_CHECK_BATCH_PROMPT = """你是一位知识管理专家。判断以下新知识点与列表中每个已有关知识点是否表达同一概念。

新知识点: {new_content}

已有关知识点列表：
{knowledge_points_list}

对于每个已有关知识点，判断它与新知识点是否表达同一概念。如果是，指定一个更好的合并表述。

以JSON数组格式输出，每个元素包含：
- existing_id: 已有关知识点的ID
- merge: true/false
- merged_content: 合并后的表述（如果merge为true）

格式：[{{"existing_id": "...", "merge": true/false, "merged_content": "..."}}, ...]

如果没有找到任何相似的，返回空数组。
"""


BATCH_MERGE_PROMPT = """你是一位知识管理专家。请分析以下知识点列表，找出可以合并的相似概念对。

知识点列表：
{knowledge_points_list}

对于每对相似知识点，判断它们是否表达同一个概念。
如果是，指定一个更好的合并表述。

以JSON数组格式输出，每对合并包含两个原始知识点的ID、是否合并、以及合并后的表述：
[{{"id1": "...", "id2": "...", "merge": true/false, "merged_content": "..."}}]

如果没有发现可合并的对，返回空数组。只返回确实相似的对，不要返回不相似的对。
"""


# Model name mapping: frontend ID -> actual API model name
MODEL_NAME_MAP = {
    "claude-sonnet-4.6": "claude-sonnet-4-20250514",
}


def resolve_model_name(model_id: str) -> str:
    """Resolve frontend model ID to actual API model name"""
    return MODEL_NAME_MAP.get(model_id, model_id)


async def stream_response(model: str, messages: list[dict], region_id: str = None, node_id: str = None) -> AsyncGenerator[dict, None]:
    """Streaming helper that yields SSE events and persists messages on completion."""
    full_response = ""
    try:
        async for chunk in llm_service.stream_chat(model, messages, session_id=node_id):
            full_response += chunk
            yield {"event": "message", "data": json.dumps({"content": chunk})}
        if full_response and region_id and node_id:
            session_service.add_message(region_id, node_id, "assistant", full_response)
    except Exception as e:
        logger.warning(f"stream_response error: {e}")
        yield {"event": "error", "data": json.dumps({"error": str(e), "code": "STREAM_ERROR"})}
from models import (
    CreateRegionRequest,
    CreateNodeRequest,
    SendMessageRequest,
    KnowledgeRegion,
    Graph,
    MergeCheckRequest,
    MergeSuggestion,
    MergeCheckResponse,
    BatchMergePair,
    BatchMergeResponse,
)
from services.region_service import region_service
from services.session_service import session_service
from services.llm_service import llm_service

router = APIRouter(prefix="/api", tags=["knowledge-regions"])


# ============ Regions ============

@router.get("/regions", response_model=list[KnowledgeRegion])
async def get_all_regions():
    """Get all knowledge regions"""
    return region_service.get_all_regions()


@router.post("/regions", response_model=KnowledgeRegion)
async def create_region(req: CreateRegionRequest):
    """Create a new knowledge region"""
    return region_service.create_region(
        name=req.name,
        description=req.description or "",
        color=req.color or "#d4a574",
        tags=req.tags or [],
    )


@router.delete("/regions/{region_id}")
async def delete_region(region_id: uuid.UUID):
    """Delete a region"""
    if not region_service.delete_region(str(region_id)):
        raise HTTPException(status_code=404, detail="Region not found")
    return {"success": True}


@router.patch("/regions/{region_id}")
async def update_region(region_id: uuid.UUID, name: str = Query(..., description="New name for the region")):
    """Update region name"""
    if not region_service.update_region_name(str(region_id), name):
        raise HTTPException(status_code=400, detail="Name cannot be empty or exceed 100 characters")
    return {"success": True}


@router.post("/regions/{region_id}/active")
async def set_active_region(region_id: uuid.UUID):
    """Set active region"""
    if not region_service.set_active_region(str(region_id)):
        raise HTTPException(status_code=404, detail="Region not found")
    return {"success": True}


# ============ Graph / Nodes ============

@router.get("/regions/{region_id}/graph", response_model=Graph)
async def get_graph(region_id: uuid.UUID):
    """Get the graph for a region"""
    graph = session_service.get_graph(str(region_id))
    if not graph:
        raise HTTPException(status_code=404, detail="Region not found")
    return graph


@router.get("/regions/{region_id}/graph/nodes", response_model=list)
async def get_nodes(region_id: uuid.UUID):
    """Get all nodes in a region's graph"""
    graph = session_service.get_graph(str(region_id))
    if not graph:
        raise HTTPException(status_code=404, detail="Region not found")
    return graph.nodes


@router.post("/regions/{region_id}/graph/nodes", response_model=dict)
async def create_node(region_id: uuid.UUID, req: CreateNodeRequest):
    """Create a new node (session) in the graph"""
    if not region_service.validate_region_exists(str(region_id)):
        raise HTTPException(status_code=404, detail="Region not found")
    node = session_service.create_root_node(str(region_id), req.title)
    return {"node": node, "success": True}


@router.get("/regions/{region_id}/graph/nodes/{node_id}")
async def get_node(region_id: uuid.UUID, node_id: uuid.UUID):
    """Get a specific node"""
    node = session_service.get_node(str(region_id), str(node_id))
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    return node


@router.delete("/regions/{region_id}/graph/nodes/{node_id}")
async def delete_node(region_id: uuid.UUID, node_id: uuid.UUID):
    """Delete a node"""
    if not session_service.delete_node(str(region_id), str(node_id)):
        raise HTTPException(status_code=404, detail="Node not found")
    return {"success": True}


@router.patch("/regions/{region_id}/graph/nodes/{node_id}")
async def update_node(region_id: uuid.UUID, node_id: uuid.UUID, title: str = Query(..., description="New title for the node")):
    """Update node title"""
    if not session_service.update_node_title(str(region_id), str(node_id), title):
        raise HTTPException(status_code=404, detail="Node not found")
    return {"success": True}


@router.get("/regions/{region_id}/graph/nodes/{node_id}/knowledge")
async def get_node_knowledge(region_id: uuid.UUID, node_id: uuid.UUID):
    """Get knowledge points linked to a specific node"""
    node = session_service.get_node(str(region_id), str(node_id))
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    # Get knowledge points linked to this session via knowledge_point_sessions
    knowledge_points = store.get_knowledge_points_for_session(str(node_id))

    # Format response to match frontend KnowledgePoint interface
    return [
        {
            "id": kp.id,
            "title": kp.summary or kp.content[:30],
            "content": kp.content,
            "score": None,  # Historical KPs don't have relevance scores
            "node_id": str(node_id)
        }
        for kp in knowledge_points
    ]


# ============ Messages ============

@router.post("/regions/{region_id}/graph/nodes/{node_id}/message")
async def send_message(region_id: uuid.UUID, node_id: uuid.UUID, req: SendMessageRequest):
    """Send a message to a node and stream the assistant response"""
    if not req.content or not req.content.strip():
        raise HTTPException(status_code=400, detail="Message content cannot be empty")

    node = session_service.get_node(str(region_id), str(node_id))
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    messages = session_service.get_conversation_context(str(region_id), str(node_id))
    session_service.add_message(str(region_id), str(node_id), "user", req.content.strip())
    messages.append({"role": "user", "content": req.content.strip()})

    # Resolve model name (frontend ID -> API model name)
    resolved_model = resolve_model_name(req.model)
    return EventSourceResponse(stream_response(resolved_model, messages, str(region_id), str(node_id)))


@router.post("/regions/{region_id}/graph/nodes/{node_id}/children", response_model=dict)
async def create_child_node(region_id: uuid.UUID, node_id: uuid.UUID, title: str = Query(None, description="Title for the new child node")):
    """Create a child node (branch) - creates edge from parent to child"""
    # Get parent node for knowledge matching
    parent = session_service.get_node(str(region_id), str(node_id))
    if not parent:
        raise HTTPException(status_code=404, detail="Parent node not found")

    # Create the child node
    child = session_service.create_child_node(str(region_id), str(node_id), title)
    if not child:
        raise HTTPException(status_code=404, detail="Node not found or failed to create child")

    # Match knowledge points from parent's first user message
    matched_knowledge_points = []
    if parent.messages:
        # Get the first user message as the question
        question = None
        for msg in parent.messages:
            if msg.role == "user":
                question = msg.content
                break

        if question:
            # Get all knowledge points for this region
            knowledge_points = store.get_knowledge_points_for_region(str(region_id))

            if knowledge_points:
                # Build knowledge points list for the prompt
                knowledge_points_list = []
                for kp in knowledge_points:
                    knowledge_points_list.append(f"ID: {kp['id']}\n内容: {kp['content']}")

                kp_list_str = "\n\n".join(knowledge_points_list)

                # Call LLM to find relevant knowledge points
                prompt = MATCH_PROMPT.format(
                    question=question,
                    knowledge_points_list=kp_list_str
                )
                llm_messages = [
                    {"role": "system", "content": "You are a helpful knowledge management assistant that outputs valid JSON."},
                    {"role": "user", "content": prompt}
                ]

                # Call LLM (non-streaming)
                try:
                    llm_response = await llm_service.chat("MiniMax-M2.7", llm_messages)

                    # Parse LLM response using helper
                    matches = parse_llm_json_response(llm_response, "match_knowledge")
                    if not isinstance(matches, list):
                        matches = []

                    # Build final response with content
                    kp_dict = {kp['id']: kp for kp in knowledge_points}
                    for match in matches[:5]:  # Limit to 5
                        if isinstance(match, dict) and 'id' in match:
                            kp_id = match['id']
                            if kp_id in kp_dict:
                                matched_knowledge_points.append({
                                    "id": kp_id,
                                    "content": kp_dict[kp_id]['content'],
                                    "reason": match.get('reason', '')
                                })
                except Exception as e:
                    # If LLM fails, still return child node with empty matched_knowledge_points
                    logger.warning(f"LLM matching failed in create_child_node: {e}")

    return {"node": child, "matched_knowledge_points": matched_knowledge_points}


@router.post("/regions/{region_id}/graph/nodes/{node_id}/suggest-branches")
async def suggest_branches(region_id: uuid.UUID, node_id: uuid.UUID):
    """Generate follow-up suggestions based on conversation history"""
    node = session_service.get_node(str(region_id), str(node_id))
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    messages = node.messages
    has_user_msg = any(m.role == "user" for m in messages)
    has_assistant_msg = any(m.role == "assistant" for m in messages)
    if not has_user_msg or not has_assistant_msg:
        raise HTTPException(status_code=400, detail="Need at least one user and assistant message")

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

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": conversation}
    ]
    return EventSourceResponse(stream_response("MiniMax-M2.7", messages))


# ============ Knowledge Extraction ============

@router.post("/regions/{region_id}/graph/nodes/{node_id}/extract-knowledge")
async def extract_knowledge(region_id: uuid.UUID, node_id: uuid.UUID):
    """Extract knowledge points from a session using LLM"""
    # 1. Validate node exists
    node = session_service.get_node(str(region_id), str(node_id))
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    # 2. Check if there are messages to analyze
    messages = session_service.get_conversation_context(str(region_id), str(node_id))
    has_user_msg = any(m["role"] == "user" for m in messages)
    has_assistant_msg = any(m["role"] == "assistant" for m in messages)
    if not has_user_msg or not has_assistant_msg:
        raise HTTPException(status_code=400, detail="Need at least one user and assistant message")

    # 3. Build conversation context for LLM
    conv_lines = []
    for msg in messages:
        role = "用户" if msg["role"] == "user" else "助手"
        content = msg["content"][:1000].replace('\n', ' ')
        conv_lines.append(f"[{role}]: {content}")

    conversation = "\n".join(conv_lines)

    # 4. Call LLM to extract knowledge points
    prompt = EXTRACTION_PROMPT.format(conversation=conversation)
    llm_messages = [
        {"role": "system", "content": "You are a helpful knowledge management assistant that outputs valid JSON."},
        {"role": "user", "content": prompt}
    ]

    try:
        # Initialize knowledge points tables if they don't exist
        from db import init_knowledge_points_tables
        init_knowledge_points_tables()
    except Exception as e:
        logger.warning(f"Failed to init knowledge points tables: {e}")

    # Call LLM (non-streaming)
    llm_response = await llm_service.chat("MiniMax-M2.7", llm_messages)

    # 5. Parse LLM response to get knowledge points
    knowledge_points = parse_llm_json_response(llm_response, "extract_knowledge")
    if not isinstance(knowledge_points, list):
        knowledge_points = []

    # 6. Save knowledge points and link to session
    saved_points = []
    for content in knowledge_points:
        if not content or not isinstance(content, str):
            continue
        content = content.strip()
        if not content:
            continue

        kp_id = str(uuid.uuid4())
        summary = content[:50] if len(content) > 50 else content

        # Save to knowledge_points table
        from db import execute_write
        execute_write(
            """INSERT INTO knowledge_points (id, content, summary, source_session_id)
               VALUES (?, ?, ?, ?)""",
            (kp_id, content, summary, str(node_id))
        )

        # Link to session in knowledge_point_sessions table
        kps_id = str(uuid.uuid4())
        execute_write(
            """INSERT INTO knowledge_point_sessions (id, knowledge_point_id, session_id)
               VALUES (?, ?, ?)""",
            (kps_id, kp_id, str(node_id))
        )

        saved_points.append({
            "id": kp_id,
            "content": content,
            "summary": summary
        })

    return {"knowledge_points": saved_points}


# ============ Knowledge Match ============

@router.post("/regions/{region_id}/knowledge/match")
async def match_knowledge(region_id: uuid.UUID, question: str = Query(..., description="User's new session question")):
    """
    Match relevant knowledge points for a new session question.
    1. Get all knowledge points for this region
    2. Call LLM to find relevant ones
    3. Return matched knowledge points with their IDs
    """
    # 1. Validate region exists
    region = region_service.get_region(str(region_id))
    if not region:
        raise HTTPException(status_code=404, detail="Region not found")

    # 2. Get all knowledge points for this region
    knowledge_points = store.get_knowledge_points_for_region(str(region_id))

    if not knowledge_points:
        return {"matches": []}

    # 3. Build knowledge points list for the prompt
    knowledge_points_list = []
    for kp in knowledge_points:
        knowledge_points_list.append(f"ID: {kp['id']}\n内容: {kp['content']}")

    kp_list_str = "\n\n".join(knowledge_points_list)

    # 4. Call LLM to find relevant knowledge points
    prompt = MATCH_PROMPT.format(
        question=question,
        knowledge_points_list=kp_list_str
    )
    llm_messages = [
        {"role": "system", "content": "You are a helpful knowledge management assistant that outputs valid JSON."},
        {"role": "user", "content": prompt}
    ]

    # Call LLM (non-streaming)
    llm_response = await llm_service.chat("MiniMax-M2.7", llm_messages)

    # 5. Parse LLM response using helper
    matches = parse_llm_json_response(llm_response, "match_knowledge")
    if not isinstance(matches, list):
        matches = []

    # 6. Ensure response format
    if not isinstance(matches, list):
        matches = []

    # Build final response with content
    final_matches = []
    kp_dict = {kp['id']: kp for kp in knowledge_points}
    for match in matches[:5]:  # Limit to 5
        if isinstance(match, dict) and 'id' in match:
            kp_id = match['id']
            if kp_id in kp_dict:
                final_matches.append({
                    "id": kp_id,
                    "content": kp_dict[kp_id]['content'],
                    "reason": match.get('reason', '')
                })

    return final_matches


# ============ Knowledge Merge ============

@router.post("/regions/{region_id}/knowledge/merge-check", response_model=MergeCheckResponse)
async def merge_check(region_id: uuid.UUID, req: MergeCheckRequest):
    """
    Check if new content is similar to existing knowledge points in the region.
    Uses LLM to determine if any existing points represent the same concept.

    Returns suggestions for merging with existing knowledge points.
    """
    # 1. Validate region exists
    region = region_service.get_region(str(region_id))
    if not region:
        raise HTTPException(status_code=404, detail="Region not found")

    # 2. Get all knowledge points for this region
    knowledge_points = store.get_knowledge_points_for_region(str(region_id))

    if not knowledge_points:
        return {"suggestions": [], "has_merges": False}

    # 3. Build knowledge points list for batch comparison (single LLM call - fixes N+1 bug)
    knowledge_points_list = []
    for kp in knowledge_points:
        knowledge_points_list.append(f"ID: {kp['id']}\n内容: {kp['content']}")
    kp_list_str = "\n\n".join(knowledge_points_list)

    prompt = MERGE_CHECK_BATCH_PROMPT.format(
        new_content=req.content,
        knowledge_points_list=kp_list_str
    )
    llm_messages = [
        {"role": "system", "content": "You are a helpful knowledge management assistant that outputs valid JSON."},
        {"role": "user", "content": prompt}
    ]

    # Single LLM call for all knowledge points
    try:
        llm_response = await llm_service.chat("MiniMax-M2.7", llm_messages)
    except Exception as e:
        logger.warning(f"LLM call failed in merge_check: {e}")
        return {"suggestions": [], "has_merges": False}

    # Parse LLM response
    suggestions = []
    try:
        results = json.loads(llm_response)
        if isinstance(results, list):
            for item in results:
                if isinstance(item, dict) and item.get('merge'):
                    existing_id = str(item.get('existing_id', ''))
                    # Find the matching KP
                    matching_kp = next((kp for kp in knowledge_points if kp['id'] == existing_id), None)
                    if matching_kp:
                        suggestions.append(MergeSuggestion(
                            existing_id=existing_id,
                            existing_content=matching_kp['content'],
                            new_content=req.content,
                            merge=True,
                            merged_content=item.get('merged_content')
                        ))
    except json.JSONDecodeError as e:
        logger.warning(f"JSON parse failed in merge_check: {e}, response: {llm_response[:500]}")
        return {"suggestions": [], "has_merges": False}

    return MergeCheckResponse(
        suggestions=suggestions,
        has_merges=len(suggestions) > 0
    )


@router.post("/regions/{region_id}/knowledge/batch-merge", response_model=BatchMergeResponse)
async def batch_merge(region_id: uuid.UUID):
    """
    Find all knowledge point pairs in a region that could be merged.
    Uses LLM to identify similar concepts across all points in the region.

    Returns a list of pairs that are similar enough to potentially merge.
    """
    # 1. Validate region exists
    region = region_service.get_region(str(region_id))
    if not region:
        raise HTTPException(status_code=404, detail="Region not found")

    # 2. Get all knowledge points for this region
    knowledge_points = store.get_knowledge_points_for_region(str(region_id))

    if len(knowledge_points) < 2:
        return {"pairs": [], "mergeable_pairs": []}

    # 3. Build knowledge points list for the prompt
    knowledge_points_list = []
    for i, kp in enumerate(knowledge_points):
        knowledge_points_list.append(f"[{i}] ID: {kp['id']}\n内容: {kp['content']}")

    kp_list_str = "\n\n".join(knowledge_points_list)

    # 4. Call LLM to find similar pairs
    prompt = BATCH_MERGE_PROMPT.format(knowledge_points_list=kp_list_str)
    llm_messages = [
        {"role": "system", "content": "You are a helpful knowledge management assistant that outputs valid JSON."},
        {"role": "user", "content": prompt}
    ]

    # Call LLM (non-streaming)
    llm_response = await llm_service.chat("MiniMax-M2.7", llm_messages)

    # 5. Parse LLM response using helper
    pairs = []
    mergeable_pairs = []
    kp_dict = {kp['id']: kp for kp in knowledge_points}

    results = parse_llm_json_response(llm_response, "batch_merge")
    if isinstance(results, list):
        for item in results:
            if isinstance(item, dict) and item.get('merge'):
                id1 = str(item.get('id1', ''))
                id2 = str(item.get('id2', ''))
                if id1 in kp_dict and id2 in kp_dict:
                    pair = BatchMergePair(
                        id1=id1,
                        id2=id2,
                        content1=kp_dict[id1]['content'],
                        content2=kp_dict[id2]['content'],
                        merge=True,
                        merged_content=item.get('merged_content')
                    )
                    pairs.append(pair)
                    mergeable_pairs.append(pair)
            elif isinstance(item, dict):
                # Include non-merge pairs for reference
                id1 = str(item.get('id1', ''))
                id2 = str(item.get('id2', ''))
                if id1 in kp_dict and id2 in kp_dict:
                    pairs.append(BatchMergePair(
                        id1=id1,
                        id2=id2,
                        content1=kp_dict[id1]['content'],
                        content2=kp_dict[id2]['content'],
                        merge=False,
                        merged_content=None
                    ))

    return BatchMergeResponse(pairs=pairs, mergeable_pairs=mergeable_pairs)


@router.post("/regions/{region_id}/knowledge/merge")
async def merge_knowledge_points(
    region_id: uuid.UUID,
    existing_id: str = Query(..., description="ID of existing knowledge point to merge into"),
    new_content: str = Query(..., description="New content to merge (or merged content)"),
    delete_source: bool = Query(True, description="Whether to delete the source after merging")
):
    """
    Merge new content into an existing knowledge point.
    Updates the existing point's content and optionally deletes the source.
    """
    # Validate region exists
    region = region_service.get_region(str(region_id))
    if not region:
        raise HTTPException(status_code=404, detail="Region not found")

    # Update the existing knowledge point
    from db import execute_write
    from datetime import datetime
    now = datetime.utcnow()
    execute_write(
        """UPDATE knowledge_points SET content = ?, summary = ?, updated_at = ?
           WHERE id = ?""",
        (new_content, new_content[:50] if len(new_content) > 50 else new_content, now, existing_id)
    )

    if delete_source:
        # Get the existing point's source_session_id to potentially relink
        existing_kp = store.get_knowledge_point(existing_id)
        if existing_kp:
            # Delete all knowledge point session links for this point
            from db import execute_write
            execute_write("DELETE FROM knowledge_point_sessions WHERE knowledge_point_id = ?", (existing_id,))

    return {"success": True, "existing_id": existing_id, "merged_content": new_content}


# ============ LLM Analysis ============

@router.post("/regions/{region_id}/analyze")
async def analyze_region(region_id: uuid.UUID):
    """Deep LLM analysis of the knowledge graph"""
    region = region_service.get_region(str(region_id))
    if not region:
        raise HTTPException(status_code=404, detail="Region not found")

    graph_data = {
        "name": region.name,
        "nodes": [
            {
                "id": str(n.id),
                "title": n.title,
                "messages": [
                    (m.role, m.content[:200]) for m in n.messages[-3:]
                ]
            }
            for n in region.graph.nodes
        ],
        "edges": [
            {"source": str(e.source), "target": str(e.target)}
            for e in region.graph.edges
        ]
    }

    from analysis import build_analysis_context, ANALYSIS_PROMPT
    context = build_analysis_context(graph_data)

    messages = [
        {"role": "system", "content": ANALYSIS_PROMPT},
        {"role": "user", "content": context}
    ]
    return EventSourceResponse(stream_response("MiniMax-M2.7", messages))


# ============ Health Check ============

@router.get("/")
async def root():
    return {
        "message": "DeepMind_Query API",
        "status": "running",
        "regions_count": len(region_service.get_all_regions())
    }
