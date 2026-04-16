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


class CreateConversationRequest(BaseModel):
    title: Optional[str] = None


class SendMessageRequest(BaseModel):
    content: str
    model: str = "gpt-4o-mini"


class CreateBranchRequest(BaseModel):
    title: Optional[str] = None
