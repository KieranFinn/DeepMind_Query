"""LLM Service - MiniMax provider only, hard-coded config"""
import os
import httpx
import json
import hashlib
import logging
from typing import AsyncGenerator, Optional

logger = logging.getLogger(__name__)

# Hard-coded MiniMax config
BASE_URL = os.getenv("MINIMAX_BASE_URL", "https://api.minimaxi.com/anthropic")
API_KEY = os.getenv("MINIMAX_API_KEY", "") or os.getenv("ANTHROPIC_AUTH_TOKEN", "")

# Thinking mode: enabled with max budget
THINKING_CONFIG = {"type": "enabled", "budget_tokens": 32000}
MAX_TOKENS = 64000

# Cache settings
LLM_CACHE_TTL_SECONDS = 24 * 60 * 60


def _get_messages_hash(model: str, messages: list[dict], session_id: str) -> str:
    content = json.dumps({"session_id": session_id, "model": model, "messages": messages}, sort_keys=True)
    return hashlib.sha256(content.encode()).hexdigest()


def _get_cache_entry(session_id: str, model: str, messages_hash: str) -> Optional[str]:
    from db import get_cursor
    try:
        with get_cursor() as cursor:
            cursor.execute(
                """SELECT response FROM llm_cache
                   WHERE session_id = ? AND model = ? AND messages_hash = ?
                   AND datetime(created_at) > datetime('now', '-' || ? || ' seconds')""",
                (session_id, model, messages_hash, LLM_CACHE_TTL_SECONDS)
            )
            row = cursor.fetchone()
            if row:
                cursor.execute(
                    """UPDATE llm_cache SET last_accessed_at = datetime('now')
                       WHERE session_id = ? AND model = ? AND messages_hash = ?""",
                    (session_id, model, messages_hash)
                )
                logger.info(f"LLM cache hit for {model}")
                return row[0]
    except Exception as e:
        logger.warning(f"LLM cache lookup failed: {e}")
    return None


def _set_cache_entry(session_id: str, model: str, messages_hash: str, response: str) -> None:
    from db import get_cursor
    from datetime import datetime
    try:
        cache_id = hashlib.sha256(f"{session_id}:{model}:{messages_hash}".encode()).hexdigest()
        with get_cursor() as cursor:
            cursor.execute(
                """INSERT OR REPLACE INTO llm_cache (id, session_id, model, messages_hash, response, created_at, last_accessed_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (cache_id, session_id, model, messages_hash, response, datetime.utcnow().isoformat(), datetime.utcnow().isoformat())
            )
        logger.info(f"LLM cache stored for {model}")
    except Exception as e:
        logger.warning(f"LLM cache store failed: {e}")


async def stream_chat(
    model: str, messages: list[dict], session_id: str = ""
) -> AsyncGenerator[str, None]:
    """Stream chat completion from MiniMax API"""
    messages_hash = _get_messages_hash(model, messages, session_id)
    cached = _get_cache_entry(session_id, model, messages_hash)
    if cached:
        for i in range(0, len(cached), 10):
            yield cached[i:i + 10]
        return

    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            "POST",
            f"{BASE_URL}/v1/messages",
            headers=headers,
            json={
                "model": model,
                "messages": messages,
                "stream": True,
                "max_tokens": MAX_TOKENS,
                "thinking": THINKING_CONFIG,
            },
        ) as response:
            if response.status_code != 200:
                error_text = await response.aread()
                yield f"[Error {response.status_code}] {error_text.decode()}"
                return

            full_response = ""
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data = line[6:]
                    if data == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data)
                        if chunk.get("type") == "content_block_delta":
                            delta = chunk.get("delta", {})
                            if delta.get("type") == "text_delta":
                                text = delta.get("text", "")
                                full_response += text
                                yield text
                    except (json.JSONDecodeError, Exception):
                        pass

    _set_cache_entry(session_id, model, messages_hash, full_response)


async def chat(model: str, messages: list[dict], session_id: str = "") -> str:
    """Non-streaming chat completion"""
    messages_hash = _get_messages_hash(model, messages, session_id)
    cached = _get_cache_entry(session_id, model, messages_hash)
    if cached:
        return cached

    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            f"{BASE_URL}/v1/messages",
            headers=headers,
            json={
                "model": model,
                "messages": messages,
                "stream": False,
                "max_tokens": MAX_TOKENS,
                "thinking": THINKING_CONFIG,
            },
        )
        if response.status_code != 200:
            return f"[Error {response.status_code}] {response.text}"

        result = response.json()
        content_blocks = result.get("content", [])
        text_parts = []
        for block in content_blocks:
            if block.get("type") == "text":
                text_parts.append(block.get("text", ""))

        response_text = "".join(text_parts)
        _set_cache_entry(session_id, model, messages_hash, response_text)
        return response_text


class LLMService:
    """Thin wrapper for backward compatibility"""

    async def stream_chat(self, model: str, messages: list[dict], api_key=None, session_id: str = ""):
        async for chunk in stream_chat(model, messages, session_id):
            yield chunk

    async def chat(self, model: str, messages: list[dict], api_key=None, session_id: str = ""):
        return await chat(model, messages, session_id)


llm_service = LLMService()
