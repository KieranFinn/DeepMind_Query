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
