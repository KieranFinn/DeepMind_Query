from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from uuid import UUID, uuid4


class Message(BaseModel):
    role: str  # "user" | "assistant"
    content: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ConversationNode(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    parent_id: Optional[UUID] = None
    title: str = "新对话"
    messages: list[Message] = Field(default_factory=list)
    children: list["ConversationNode"] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Session(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    title: str = "新会话"
    root_node: ConversationNode = Field(default_factory=lambda: ConversationNode())
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_active_at: datetime = Field(default_factory=datetime.utcnow)


class KnowledgeRegion(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    name: str = "新知识区"
    description: str = ""
    color: str = "#d4a574"
    sessions: list[Session] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_active_at: datetime = Field(default_factory=datetime.utcnow)
    tags: list[str] = Field(default_factory=list)


class CreateRegionRequest(BaseModel):
    name: str = "新知识区"
    description: Optional[str] = ""
    color: Optional[str] = "#d4a574"
    tags: Optional[list[str]] = []


class CreateSessionRequest(BaseModel):
    title: Optional[str] = None


class SendMessageRequest(BaseModel):
    content: str
    model: str = "gpt-4o-mini"
