"""LLM Service Layer - Abstract provider interface for multi-model support"""
import os
import httpx
import json
import hashlib
import logging
import warnings
import contextvars
from abc import ABC, abstractmethod
from typing import AsyncGenerator, Optional
from dotenv import load_dotenv

logger = logging.getLogger(__name__)
load_dotenv()

# Context variable for secure API key storage - avoids passing via function parameters
# which can leak into logs, stack traces, or monitoring systems
_api_key_ctx: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("api_key", default=None)


def set_api_key(api_key: Optional[str]) -> None:
    """Set the API key in the current context (secure, no function parameters)."""
    _api_key_ctx.set(api_key)


def get_api_key() -> Optional[str]:
    """Get the API key from the current context."""
    return _api_key_ctx.get()


def clear_api_key() -> None:
    """Clear the API key from the current context."""
    _api_key_ctx.set(None)

# Cache settings
LLM_CACHE_TTL_SECONDS = 24 * 60 * 60  # 24 hours
LLM_CACHE_ENABLED = os.getenv("LLM_CACHE_ENABLED", "true").lower() == "true"


def _get_messages_hash(model: str, messages: list[dict]) -> str:
    """Create a hash of model + messages for cache key"""
    content = json.dumps({"model": model, "messages": messages}, sort_keys=True)
    return hashlib.sha256(content.encode()).hexdigest()


def _get_cache_entry(model: str, messages_hash: str) -> Optional[str]:
    """Get cached response if exists and not expired"""
    if not LLM_CACHE_ENABLED:
        return None

    from db import get_cursor
    try:
        with get_cursor() as cursor:
            cursor.execute(
                """SELECT response FROM llm_cache
                   WHERE model = ? AND messages_hash = ?
                   AND datetime(created_at) > datetime('now', '-' || ? || ' seconds')""",
                (model, messages_hash, LLM_CACHE_TTL_SECONDS)
            )
            row = cursor.fetchone()
            if row:
                # Update last accessed
                cursor.execute(
                    """UPDATE llm_cache SET last_accessed_at = datetime('now')
                       WHERE model = ? AND messages_hash = ?""",
                    (model, messages_hash)
                )
                logger.info(f"LLM cache hit for {model}")
                return row[0]
    except Exception as e:
        logger.warning(f"LLM cache lookup failed: {e}")
    return None


def _set_cache_entry(model: str, messages_hash: str, response: str) -> None:
    """Store response in cache"""
    if not LLM_CACHE_ENABLED:
        return

    from db import get_cursor
    from datetime import datetime

    try:
        cache_id = hashlib.sha256(f"{model}:{messages_hash}".encode()).hexdigest()
        with get_cursor() as cursor:
            cursor.execute(
                """INSERT OR REPLACE INTO llm_cache (id, model, messages_hash, response, created_at, last_accessed_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (cache_id, model, messages_hash, response, datetime.utcnow().isoformat(), datetime.utcnow().isoformat())
            )
        logger.info(f"LLM cache stored for {model}")
    except Exception as e:
        logger.warning(f"LLM cache store failed: {e}")


class LLMProvider(ABC):
    """Abstract LLM provider interface"""

    @abstractmethod
    async def stream_chat(
        self, model: str, messages: list[dict]
    ) -> AsyncGenerator[str, None]:
        """Stream chat completion"""
        pass

    @abstractmethod
    async def chat(
        self, model: str, messages: list[dict]
    ) -> str:
        """Non-streaming chat completion"""
        pass


class MiniMaxProvider(LLMProvider):
    """MiniMax Anthropic API provider"""

    def __init__(self):
        self.base_url = os.getenv("ANTHROPIC_BASE_URL", "https://api.minimaxi.com/anthropic")

    async def stream_chat(
        self, model: str, messages: list[dict]
    ) -> AsyncGenerator[str, None]:
        """Stream chat completion from MiniMax Anthropic API"""
        # Check context first, then fall back to env var
        key = get_api_key() or os.getenv("MINIMAX_API_KEY", "")
        if not key:
            old_key = os.getenv("ANTHROPIC_API_KEY", "")
            if old_key:
                warnings.warn(
                    "ANTHROPIC_API_KEY is deprecated for MiniMax. Use MINIMAX_API_KEY instead.",
                    DeprecationWarning
                )
                logger.warning("ANTHROPIC_API_KEY is deprecated. Please use MINIMAX_API_KEY.")
                key = old_key

        if not key:
            yield "[Error] No API key configured. Set MINIMAX_API_KEY in .env"
            return

        headers = {
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
        }

        endpoint = f"{self.base_url}/v1/messages"
        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "max_tokens": 4096,
        }

        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST", endpoint, headers=headers, json=payload
            ) as response:
                if response.status_code != 200:
                    error_text = await response.aread()
                    yield f"[Error {response.status_code}] {error_text.decode()}"
                    return

                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data = line[6:]
                        if data == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data)
                            type_ = chunk.get("type", "")
                            if type_ == "content_block_delta":
                                delta = chunk.get("delta", {})
                                if delta.get("type") == "text_delta":
                                    yield delta.get("text", "")
                            elif type_ == "message_delta":
                                pass
                        except json.JSONDecodeError:
                            pass
                        except Exception as e:
                            logger.warning(f"Stream processing error: {e}")

    async def chat(
        self, model: str, messages: list[dict]
    ) -> str:
        """Non-streaming chat completion"""
        full_response = ""
        async for chunk in self.stream_chat(model, messages):
            full_response += chunk
        return full_response


class AnthropicProvider(LLMProvider):
    """Official Anthropic API provider"""

    def __init__(self):
        self.base_url = "https://api.anthropic.com"

    async def stream_chat(
        self, model: str, messages: list[dict]
    ) -> AsyncGenerator[str, None]:
        """Stream chat completion from official Anthropic API"""
        key = get_api_key() or os.getenv("ANTHROPIC_API_KEY", "")

        if not key:
            yield "[Error] No API key configured. Set ANTHROPIC_API_KEY in .env"
            return

        headers = {
            "x-api-key": key,
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
        }

        endpoint = f"{self.base_url}/v1/messages"
        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "max_tokens": 1024,
        }

        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST", endpoint, headers=headers, json=payload
            ) as response:
                if response.status_code != 200:
                    error_text = await response.aread()
                    yield f"[Error {response.status_code}] {error_text.decode()}"
                    return

                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data = line[6:]
                        if data == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data)
                            type_ = chunk.get("type", "")
                            if type_ == "content_block_delta":
                                delta = chunk.get("delta", {})
                                if delta.get("type") == "text_delta":
                                    yield delta.get("text", "")
                            elif type_ == "message_delta":
                                pass
                        except json.JSONDecodeError:
                            pass
                        except Exception as e:
                            logger.warning(f"Stream processing error: {e}")

    async def chat(
        self, model: str, messages: list[dict]
    ) -> str:
        """Non-streaming chat completion"""
        full_response = ""
        async for chunk in self.stream_chat(model, messages):
            full_response += chunk
        return full_response


class LLMService:
    """LLM Service with model-based provider routing"""

    # Model name prefixes for routing
    CLAUDE_PREFIX = "claude-"
    MINIMAX_PREFIX = "MiniMax-"

    def __init__(self):
        self._minimax_provider = MiniMaxProvider()
        self._anthropic_provider = AnthropicProvider()

    def _get_provider_for_model(self, model: str) -> LLMProvider:
        """Route to the appropriate provider based on model name"""
        if model.startswith(self.CLAUDE_PREFIX):
            return self._anthropic_provider
        return self._minimax_provider

    async def stream_chat(
        self, model: str, messages: list[dict]
    ) -> AsyncGenerator[str, None]:
        """Delegate to appropriate provider based on model"""
        provider = self._get_provider_for_model(model)
        async for chunk in provider.stream_chat(model, messages):
            yield chunk

    async def chat(
        self, model: str, messages: list[dict]
    ) -> str:
        """Delegate to appropriate provider based on model, with caching"""
        # Check cache first
        messages_hash = _get_messages_hash(model, messages)
        cached = _get_cache_entry(model, messages_hash)
        if cached:
            return cached

        # Call provider (API key retrieved from context via get_api_key())
        provider = self._get_provider_for_model(model)
        response = await provider.chat(model, messages)

        # Store in cache
        _set_cache_entry(model, messages_hash, response)

        return response


# Global instance
llm_service = LLMService()
