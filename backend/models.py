from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from uuid import UUID, uuid4


class Message(BaseModel):
    role: str  # "user" | "assistant"
    content: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Node(BaseModel):
    """A node in the graph = a session"""
    id: UUID = Field(default_factory=uuid4)
    title: str = "新会话"
    messages: list[Message] = Field(default_factory=list)
    parent_id: Optional[UUID] = None  # For edge drawing
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_active_at: datetime = Field(default_factory=datetime.utcnow)


class Edge(BaseModel):
    """Connection between nodes"""
    id: UUID = Field(default_factory=uuid4)
    source: UUID  # 起始节点
    target: UUID  # 目标节点


class Graph(BaseModel):
    """A graph containing nodes and edges"""
    nodes: list[Node] = Field(default_factory=list)
    edges: list[Edge] = Field(default_factory=list)


class KnowledgeRegion(BaseModel):
    """A region = a graph of nodes"""
    id: UUID = Field(default_factory=uuid4)
    name: str = "新知识区"
    description: str = ""
    color: str = "#d4a574"
    graph: Graph = Field(default_factory=Graph)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_active_at: datetime = Field(default_factory=datetime.utcnow)
    tags: list[str] = Field(default_factory=list)


class CreateRegionRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Region name")
    description: Optional[str] = ""
    color: Optional[str] = "#d4a574"
    tags: Optional[list[str]] = []


class CreateNodeRequest(BaseModel):
    title: Optional[str] = None
    parent_id: Optional[UUID] = None


class SendMessageRequest(BaseModel):
    content: str
    model: str = "MiniMax-M2.7"
