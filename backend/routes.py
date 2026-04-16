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
    title = req.title or "新对话"
    node = store.create_root(title)
    return node


@router.get("/conversations/{node_id}", response_model=ConversationNode)
async def get_conversation(node_id: uuid.UUID):
    """Get a conversation node with its subtree"""
    node = store.get_node_with_subtree(node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return node


@router.get("/conversations")
async def get_tree():
    """Get the full conversation tree"""
    tree = store.get_tree()
    if tree is None:
        return {"nodes": {}, "root": None}
    return {"root": tree}


@router.post("/conversations/{node_id}/message")
async def send_message(node_id: uuid.UUID, req: SendMessageRequest):
    """Send a message and stream the assistant response"""
    node = store.get_node(node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Add user message
    store.add_message(node_id, "user", req.content)

    # Build messages for LLM
    messages = [{"role": msg.role, "content": msg.content} for msg in node.messages]

    async def generate():
        full_response = ""
        async for chunk in stream_chat(req.model, messages):
            full_response += chunk
            # Yield as SSE data: JSON with content field
            yield {"event": "message", "data": json.dumps({"content": chunk})}

        # Save assistant message after streaming complete
        if full_response:
            store.add_message(node_id, "assistant", full_response)

    return EventSourceResponse(generate())


@router.post("/conversations/{node_id}/branch", response_model=ConversationNode)
async def create_branch(node_id: uuid.UUID, req: CreateBranchRequest):
    """Create a child branch from a conversation node"""
    parent = store.get_node(node_id)
    if parent is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    title = req.title or f"分支 {len(parent.children) + 1}"
    node = store.create_branch(node_id, title)
    return node


@router.get("/")
async def root():
    return {"message": "DeepMind_Query API", "status": "running"}
