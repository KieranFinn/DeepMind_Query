import os
import httpx
import json
from typing import AsyncGenerator
from dotenv import load_dotenv

load_dotenv()

# MiniMax
MINIMAX_API_KEY = os.getenv("MINIMAX_API_KEY", "")
MINIMAX_BASE_URL = os.getenv("MINIMAX_BASE_URL", "https://api.minimax.chat/v1")

# OpenAI (fallback)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")

PROVIDER = os.getenv("PROVIDER", "minimax").lower()


def get_provider_config():
    if PROVIDER == "openai":
        return {"api_key": OPENAI_API_KEY, "base_url": OPENAI_BASE_URL}
    else:  # minimax
        return {"api_key": MINIMAX_API_KEY, "base_url": MINIMAX_BASE_URL}


async def stream_chat(model: str, messages: list[dict], api_key: str = None) -> AsyncGenerator[str, None]:
    """Stream chat completion from OpenAI-compatible API"""
    config = get_provider_config()
    key = api_key or config["api_key"]
    base_url = config["base_url"]

    if not key:
        yield "[Error] No API key configured. Set MINIMAX_API_KEY or OPENAI_API_KEY in .env"
        return

    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            "POST",
            f"{base_url}/chat/completions",
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
                        choices = chunk.get("choices", [{}])
                        if PROVIDER == "minimax":
                            # MiniMax format: choices[0].delta.content
                            delta = choices[0].get("delta", {})
                            content = delta.get("content", "")
                        else:
                            # OpenAI format: choices[0].delta.content
                            delta = choices[0].get("delta", {})
                            content = delta.get("content", "")
                        if content:
                            yield content
                    except Exception:
                        pass


async def chat(model: str, messages: list[dict], api_key: str = None) -> str:
    """Non-streaming chat completion"""
    full_response = ""
    async for chunk in stream_chat(model, messages, api_key):
        full_response += chunk
    return full_response
