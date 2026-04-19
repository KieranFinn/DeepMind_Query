"""LLM Service Layer - Abstract provider interface for multi-model support"""
import os
import httpx
import json
import logging
import warnings
from abc import ABC, abstractmethod
from typing import AsyncGenerator, Optional
from dotenv import load_dotenv

logger = logging.getLogger(__name__)
load_dotenv()

# Provider selection
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "minimax").lower()


class LLMProvider(ABC):
    """Abstract LLM provider interface"""

    @abstractmethod
    async def stream_chat(
        self, model: str, messages: list[dict], api_key: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        """Stream chat completion"""
        pass

    @abstractmethod
    async def chat(
        self, model: str, messages: list[dict], api_key: Optional[str] = None
    ) -> str:
        """Non-streaming chat completion"""
        pass


class MiniMaxProvider(LLMProvider):
    """MiniMax Anthropic API provider"""

    def __init__(self):
        self.base_url = os.getenv("ANTHROPIC_BASE_URL", "https://api.minimaxi.com/anthropic")

    async def stream_chat(
        self, model: str, messages: list[dict], api_key: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        """Stream chat completion from MiniMax Anthropic API"""
        # Check for new MINIMAX_API_KEY first, fall back to ANTHROPIC_API_KEY with warning
        key = api_key or os.getenv("MINIMAX_API_KEY", "")
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
        self, model: str, messages: list[dict], api_key: Optional[str] = None
    ) -> str:
        """Non-streaming chat completion"""
        full_response = ""
        async for chunk in self.stream_chat(model, messages, api_key):
            full_response += chunk
        return full_response


class AnthropicProvider(LLMProvider):
    """Official Anthropic API provider"""

    def __init__(self):
        self.base_url = "https://api.anthropic.com"

    async def stream_chat(
        self, model: str, messages: list[dict], api_key: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        """Stream chat completion from official Anthropic API"""
        key = api_key or os.getenv("ANTHROPIC_API_KEY", "")

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
        self, model: str, messages: list[dict], api_key: Optional[str] = None
    ) -> str:
        """Non-streaming chat completion"""
        full_response = ""
        async for chunk in self.stream_chat(model, messages, api_key):
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
        self, model: str, messages: list[dict], api_key: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        """Delegate to appropriate provider based on model"""
        provider = self._get_provider_for_model(model)
        async for chunk in provider.stream_chat(model, messages, api_key):
            yield chunk

    async def chat(
        self, model: str, messages: list[dict], api_key: Optional[str] = None
    ) -> str:
        """Delegate to appropriate provider based on model"""
        provider = self._get_provider_for_model(model)
        return await provider.chat(model, messages, api_key)

    async def stream_chat_with_fallback(
        self,
        model: str,
        messages: list[dict],
        fallback_models: list[str] = None,
        api_key: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        """Try primary model, fall back to alternatives on error"""
        models = [model] + (fallback_models or [])

        for attempt_model in models:
            try:
                async for chunk in self.stream_chat(attempt_model, messages, api_key):
                    yield chunk
                return
            except Exception as e:
                if attempt_model == models[-1]:
                    yield f"[Error] All models failed: {e}"
                else:
                    logger.warning(f"Model {attempt_model} failed, trying next...")


# Global instance
llm_service = LLMService()
