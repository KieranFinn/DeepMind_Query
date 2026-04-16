import os
import httpx
import json
import logging
from typing import AsyncGenerator
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

load_dotenv()

# MiniMax Anthropic API (compatible with Anthropic SDK format)
MINIMAX_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
MINIMAX_BASE_URL = os.getenv("ANTHROPIC_BASE_URL", "https://api.minimaxi.com/anthropic")


async def stream_chat(model: str, messages: list[dict], api_key: str = None) -> AsyncGenerator[str, None]:
    """Stream chat completion from MiniMax Anthropic API"""
    key = api_key or MINIMAX_API_KEY

    if not key:
        yield "[Error] No API key configured. Set ANTHROPIC_API_KEY in .env"
        return

    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
    }

    endpoint = f"{MINIMAX_BASE_URL}/v1/messages"
    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
        "max_tokens": 4096,
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            "POST",
            endpoint,
            headers=headers,
            json=payload,
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
                        # Anthropic streaming format
                        type_ = chunk.get("type", "")
                        if type_ == "content_block_delta":
                            delta = chunk.get("delta", {})
                            # Skip thinking blocks, only output text
                            if delta.get("type") == "text_delta":
                                yield delta.get("text", "")
                        elif type_ == "message_delta":
                            # Final message with usage info - ignore
                            pass
                    except json.JSONDecodeError:
                        # Malformed JSON in stream - skip silently (normal for partial chunks)
                        pass
                    except Exception as e:
                        logger.warning(f"Stream processing error: {e}")


async def chat(model: str, messages: list[dict], api_key: str = None) -> str:
    """Non-streaming chat completion"""
    full_response = ""
    async for chunk in stream_chat(model, messages, api_key):
        full_response += chunk
    return full_response
