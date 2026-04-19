"""LLM module - Legacy wrapper delegating to LLMService"""
from typing import AsyncGenerator
from services.llm_service import llm_service

async def stream_chat(model: str, messages: list[dict], api_key: str = None) -> AsyncGenerator[str, None]:
    """Stream chat completion - delegates to LLMService"""
    async for chunk in llm_service.stream_chat(model, messages, api_key):
        yield chunk


async def chat(model: str, messages: list[dict], api_key: str = None) -> str:
    """Non-streaming chat completion - delegates to LLMService"""
    return await llm_service.chat(model, messages, api_key)
