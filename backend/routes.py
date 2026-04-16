import uuid
import json
from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse
from store import store
from models import (
    CreateRegionRequest,
    CreateSessionRequest,
    SendMessageRequest,
    KnowledgeRegion,
    Session,
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
        return region


@router.get("/regions/{region_id}", response_model=KnowledgeRegion)
async def get_region(region_id: uuid.UUID):
    """Get a specific region"""
    async with await store.lock():
        region = store.get_region(region_id)
        if not region:
            raise HTTPException(status_code=404, detail="Region not found")
        return region


@router.delete("/regions/{region_id}")
async def delete_region(region_id: uuid.UUID):
    """Delete a region"""
    async with await store.lock():
        if not store.delete_region(region_id):
            raise HTTPException(status_code=404, detail="Region not found")
        return {"success": True}


@router.post("/regions/{region_id}/active")
async def set_active_region(region_id: uuid.UUID):
    """Set active region"""
    async with await store.lock():
        if not store.set_active_region(region_id):
            raise HTTPException(status_code=404, detail="Region not found")
        return {"success": True}


# ============ Sessions ============

@router.get("/regions/{region_id}/sessions", response_model=list[Session])
async def get_sessions(region_id: uuid.UUID):
    """Get all sessions in a region"""
    async with await store.lock():
        region = store.get_region(region_id)
        if not region:
            raise HTTPException(status_code=404, detail="Region not found")
        return region.sessions


@router.post("/regions/{region_id}/sessions", response_model=Session)
async def create_session(region_id: uuid.UUID, req: CreateSessionRequest):
    """Create a new session in a region"""
    async with await store.lock():
        session = store.create_session(region_id, req.title)
        if not session:
            raise HTTPException(status_code=404, detail="Region not found")
        return session


@router.get("/regions/{region_id}/sessions/{session_id}", response_model=Session)
async def get_session(region_id: uuid.UUID, session_id: uuid.UUID):
    """Get a specific session"""
    async with await store.lock():
        session = store.get_session(region_id, session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        return session


# ============ Conversation Tree ============

@router.get("/regions/{region_id}/sessions/{session_id}/tree")
async def get_session_tree(region_id: uuid.UUID, session_id: uuid.UUID):
    """Get the conversation tree for a session"""
    async with await store.lock():
        tree = store.get_session_tree(region_id, session_id)
        if not tree:
            raise HTTPException(status_code=404, detail="Session not found")
        return tree


@router.post("/regions/{region_id}/sessions/{session_id}/message")
async def send_message(region_id: uuid.UUID, session_id: uuid.UUID, req: SendMessageRequest):
    """Send a message and stream the assistant response"""
    async with await store.lock():
        session = store.get_session(region_id, session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

    if not req.content or not req.content.strip():
        raise HTTPException(status_code=400, detail="Message content cannot be empty")

    # Add user message
    store.add_message_to_session(region_id, session_id, "user", req.content.strip())

    # Build messages for LLM
    tree = store.get_session_tree(region_id, session_id)
    messages = [{"role": msg.role, "content": msg.content} for msg in tree.messages]

    async def generate():
        full_response = ""
        try:
            async for chunk in stream_chat(req.model, messages):
                full_response += chunk
                yield {"event": "message", "data": json.dumps({"content": chunk})}

            if full_response:
                store.add_message_to_session(region_id, session_id, "assistant", full_response)
        except Exception as e:
            yield {"event": "error", "data": json.dumps({"error": str(e)})}

    return EventSourceResponse(generate())


@router.post("/regions/{region_id}/sessions/{session_id}/branch")
async def create_branch(
    region_id: uuid.UUID,
    session_id: uuid.UUID,
    parent_node_id: str,
    title: str = None
):
    """Create a branch from a node in the session's conversation tree"""
    async with await store.lock():
        try:
            parent_uuid = uuid.UUID(parent_node_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid node ID")

        node = store.create_branch_in_session(region_id, session_id, parent_uuid, title)
        if not node:
            raise HTTPException(status_code=404, detail="Parent node not found")
        return node


# ============ Health Check ============

@router.get("/")
async def root():
    return {
        "message": "DeepMind_Query API",
        "status": "running",
        "regions_count": len(store.regions)
    }
