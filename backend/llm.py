import os
import httpx
from typing import AsyncGenerator
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")


async def stream_chat(model: str, messages: list[dict], api_key: str = None) -> AsyncGenerator[str, None]:
    """Stream chat completion from OpenAI-compatible API"""
    key = api_key or OPENAI_API_KEY
    if not key:
        yield "[Error] No API key configured. Set OPENAI_API_KEY in .env"
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
            f"{OPENAI_BASE_URL}/chat/completions",
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
                        import json
                        chunk = json.loads(data)
                        delta = chunk.get("choices", [{}])[0].get("delta", {})
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
