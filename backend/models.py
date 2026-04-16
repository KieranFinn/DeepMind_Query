from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from uuid import UUID, uuid4


class Message(BaseModel):
    role: str  # "user" | "assistant"
    content: str
    created_at: datetime = None

    def __init__(self, **data):
        if 'created_at' not in data or data['created_at'] is None:
            data['created_at'] = datetime.utcnow()
        super().__init__(**data)


class ConversationNode(BaseModel):
    id: UUID = None
    parent_id: Optional[UUID] = None
    title: str = "新对话"
    messages: list[Message] = []
    children: list[UUID] = []
    created_at: datetime = None

    def __init__(self, **data):
        if 'id' not in data or data['id'] is None:
            data['id'] = uuid4()
        if 'created_at' not in data or data['created_at'] is None:
            data['created_at'] = datetime.utcnow()
        super().__init__(**data)


class CreateConversationRequest(BaseModel):
    title: Optional[str] = None


class SendMessageRequest(BaseModel):
    content: str
    model: str = "gpt-4o-mini"


class CreateBranchRequest(BaseModel):
    title: Optional[str] = None
