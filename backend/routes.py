import uuid
import json
from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse
from store import store
from models import (
    CreateConversationRequest,
    SendMessageRequest,
    CreateBranchRequest,
    ConversationNode,
)
from llm import stream_chat

router = APIRouter(prefix="/api", tags=["conversations"])


@router.post("/conversations", response_model=ConversationNode)
async def create_conversation(req: CreateConversationRequest):
    """Create a new root conversation node"""
    async with await store.lock():
        title = req.title or "新对话"
        node = store.create_root(title)
        return node


@router.get("/conversations/{node_id}", response_model=ConversationNode)
async def get_conversation(node_id: uuid.UUID):
    """Get a conversation node with its subtree"""
    async with await store.lock():
        node = store.get_node_with_subtree(node_id)
        if node is None:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return node


@router.get("/conversations")
async def get_tree():
    """Get the full conversation tree"""
    async with await store.lock():
        tree = store.get_tree()
        if tree is None:
            return {"nodes": {}, "root": None}
        return {"root": tree}


@router.post("/conversations/{node_id}/message")
async def send_message(node_id: uuid.UUID, req: SendMessageRequest):
    """Send a message and stream the assistant response"""
    # Validate node exists first (before adding user message)
    if not store.node_exists(node_id):
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Validate content
    if not req.content or not req.content.strip():
        raise HTTPException(status_code=400, detail="Message content cannot be empty")

    # Add user message
    user_msg = store.add_message(node_id, "user", req.content.strip())

    # Build messages for LLM
    node = store.get_node(node_id)
    messages = [{"role": msg.role, "content": msg.content} for msg in node.messages]

    async def generate():
        full_response = ""
        assistant_saved = False

        try:
            async for chunk in stream_chat(req.model, messages):
                full_response += chunk
                # Yield as SSE data: JSON with content field
                yield {"event": "message", "data": json.dumps({"content": chunk})}

            # Only save assistant message after streaming completes successfully
            if full_response:
                store.add_message(node_id, "assistant", full_response)
                assistant_saved = True

        except Exception as e:
            # If LLM call fails, yield error and don't leave incomplete state
            yield {"event": "error", "data": json.dumps({"error": str(e)})}

    return EventSourceResponse(generate())


@router.post("/conversations/{node_id}/branch", response_model=ConversationNode)
async def create_branch(node_id: uuid.UUID, req: CreateBranchRequest):
    """Create a child branch from a conversation node"""
    async with await store.lock():
        parent = store.get_node(node_id)
        if parent is None:
            raise HTTPException(status_code=404, detail="Conversation not found")

        # Use child_index for correct count
        child_count = len(store.child_index.get(node_id, []))
        title = req.title or f"分支 {child_count + 1}"
        node = store.create_branch(node_id, title)
        return node


@router.get("/")
async def root():
    return {"message": "DeepMind_Query API", "status": "running"}
