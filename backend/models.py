from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import datetime
from uuid import UUID, uuid4
from validators import (
    CONTENT_MAX_LENGTH,
    CONTEXT_WINDOW_MAX_MESSAGES,
    SYSTEM_PROMPT_MAX_LENGTH,
)


class Message(BaseModel):
    role: str  # "user" | "assistant"
    content: str = Field(max_length=CONTENT_MAX_LENGTH)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    @field_validator("content")
    @classmethod
    def content_length_validator(cls, v: str) -> str:
        if len(v) > CONTENT_MAX_LENGTH:
            raise ValueError(f"Content exceeds maximum length of {CONTENT_MAX_LENGTH} characters")
        return v


class Node(BaseModel):
    """A node in the graph = a session"""
    id: UUID = Field(default_factory=uuid4)
    title: str = "新会话"
    messages: list[Message] = Field(default_factory=list)
    parent_id: Optional[UUID] = None  # For edge drawing
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_active_at: datetime = Field(default_factory=datetime.utcnow)

    @field_validator("messages")
    @classmethod
    def messages_context_window_validator(cls, v: list[Message]) -> list[Message]:
        if len(v) > CONTEXT_WINDOW_MAX_MESSAGES:
            raise ValueError(f"Context window exceeds maximum of {CONTEXT_WINDOW_MAX_MESSAGES} messages")
        return v


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
    content: str = Field(max_length=CONTENT_MAX_LENGTH)
    model: str = "MiniMax-M2.7"

    @field_validator("content")
    @classmethod
    def content_length_validator(cls, v: str) -> str:
        if len(v) > CONTENT_MAX_LENGTH:
            raise ValueError(f"Content exceeds maximum length of {CONTENT_MAX_LENGTH} characters")
        return v


class KnowledgePoint(BaseModel):
    """A knowledge point extracted from a session"""
    id: UUID = Field(default_factory=uuid4)
    content: str = Field(max_length=CONTENT_MAX_LENGTH)
    summary: Optional[str] = None
    source_session_id: Optional[UUID] = None  # Which session extracted this
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    @field_validator("content")
    @classmethod
    def content_length_validator(cls, v: str) -> str:
        if len(v) > CONTENT_MAX_LENGTH:
            raise ValueError(f"Content exceeds maximum length of {CONTENT_MAX_LENGTH} characters")
        return v


class KnowledgePointSession(BaseModel):
    """Many-to-many relationship between knowledge points and sessions"""
    id: UUID = Field(default_factory=uuid4)
    knowledge_point_id: UUID
    session_id: UUID  # FK to nodes
    created_at: datetime = Field(default_factory=datetime.utcnow)


class CreateKnowledgePointRequest(BaseModel):
    content: str = Field(..., description="The knowledge point content", max_length=CONTENT_MAX_LENGTH)
    summary: Optional[str] = Field(None, max_length=500)
    source_session_id: Optional[UUID] = None

    @field_validator("content")
    @classmethod
    def content_length_validator(cls, v: str) -> str:
        if len(v) > CONTENT_MAX_LENGTH:
            raise ValueError(f"Content exceeds maximum length of {CONTENT_MAX_LENGTH} characters")
        return v


class MergeCheckRequest(BaseModel):
    """Request for checking if new content matches existing knowledge points"""
    content: str = Field(..., description="The new knowledge point content to check", max_length=CONTENT_MAX_LENGTH)
    threshold: Optional[float] = Field(0.8, description="Similarity threshold (0-1)")

    @field_validator("content")
    @classmethod
    def content_length_validator(cls, v: str) -> str:
        if len(v) > CONTENT_MAX_LENGTH:
            raise ValueError(f"Content exceeds maximum length of {CONTENT_MAX_LENGTH} characters")
        return v


class MergeSuggestion(BaseModel):
    """A suggested merge between two knowledge points"""
    existing_id: str
    existing_content: str
    new_content: str
    merge: bool
    merged_content: Optional[str] = None


class MergeCheckResponse(BaseModel):
    """Response from merge check"""
    suggestions: list[MergeSuggestion]
    has_merges: bool


class BatchMergePair(BaseModel):
    """A pair of knowledge points that could be merged"""
    id1: str
    id2: str
    content1: str
    content2: str
    merge: bool
    merged_content: Optional[str] = None


class BatchMergeResponse(BaseModel):
    """Response from batch merge check"""
    pairs: list[BatchMergePair]
    mergeable_pairs: list[BatchMergePair]
