# Security Specification

This document outlines security best practices and implementation requirements for the DeepMind_Query backend.

## 1. API Key Comparison

**Requirement:** Always use `secrets.compare_digest()` for timing-safe string comparison.

**Rationale:** Regular string equality (`==`) is vulnerable to timing attacks. An attacker can measure response times to deduce the correct API key character by character. `secrets.compare_digest()` performs constant-time comparison, preventing such attacks.

**Implementation:**
```python
import secrets

# Correct - constant-time comparison
if not secrets.compare_digest(provided_key, API_KEY):
    return JSONResponse(status_code=401, content={"detail": "Invalid API key"})
```

**Anti-patterns (do not use):**
```python
# WRONG - vulnerable to timing attacks
if provided_key == API_KEY:
    ...

# WRONG - also vulnerable
if provided_key.encode() == API_KEY.encode():
    ...
```

**Reference:** `backend/main.py` - `api_key_auth` middleware (line 65)

---

## 2. API Key Management

**Requirement:** API keys must be retrieved from environment variables only.

**Implementation:**
```python
import os

API_KEY = os.getenv("API_KEY", "")
API_KEY_NAME = os.getenv("API_KEY_NAME", "X-API-Key")
```

**Security Guidelines:**
- Never hardcode API keys in source code
- Never commit `.env` files containing real keys
- Use `.env.example` as a template for required environment variables
- In production, use a secrets manager (e.g., AWS Secrets Manager, HashiCorp Vault)

**Required Environment Variables:**
| Variable | Description | Required |
|----------|-------------|----------|
| `API_KEY` | Primary API key for authentication | Yes |
| `API_KEY_NAME` | Header name for API key (default: `X-API-Key`) | No |
| `ANTHROPIC_API_KEY` | Anthropic API key for LLM calls | Yes (if using Claude models) |
| `MINIMAX_API_KEY` | MiniMax API key for LLM calls | Yes (if using MiniMax models) |

**Reference:** `backend/main.py` (line 13-14), `backend/services/llm_service.py`

---

## 3. CORS Configuration

**Requirement:** CORS origins must be configured via environment variables, never hardcoded for production.

**Implementation:**
```python
import os

_cors_env = os.getenv("CORS_ORIGINS", "")
if _cors_env:
    _cors_origins = [origin.strip() for origin in _cors_env.split(",") if origin.strip()]
else:
    _cors_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
```

**Security Guidelines:**
- In production, explicitly set `CORS_ORIGINS` to specific allowed origins
- Do not use wildcard `*` with credentials enabled
- Separate multiple origins with commas
- Examples:
  ```
  CORS_ORIGINS=https://example.com
  CORS_ORIGINS=https://app.example.com,https://admin.example.com
  ```

**Reference:** `backend/main.py` (lines 112-132)

---

## 4. Rate Limiting

**Requirement:** Rate limiting must use a distributed solution (Redis) for production deployments to handle multiple instances correctly.

**Current Implementation (in-memory, single-instance):**
```python
from collections import defaultdict
from time import time

RATE_LIMIT_TOKENS = 10  # Max requests
RATE_LIMIT_REFILL = 60  # Seconds to refill bucket

rate_limit_data = defaultdict(lambda: {"tokens": RATE_LIMIT_TOKENS, "last_refill": time()})
```

**Limitation:** The current in-memory implementation only works for single-instance deployments. In a distributed environment with multiple API instances, each instance maintains its own rate limit state, allowing attackers to bypass limits by distributing requests across instances.

**Production Requirement:** Implement Redis-based distributed rate limiting with sliding window or token bucket algorithm.

**Recommended Redis-based Implementation Pattern:**
```python
import redis
import os

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
redis_client = redis.from_url(REDIS_URL)

async def check_rate_limit_redis(client_ip: str, max_requests: int = 10, window_seconds: int = 60) -> bool:
    """
    Distributed rate limiting using Redis sliding window.
    Returns True if request is allowed, False if rate limited.
    """
    key = f"rate_limit:{client_ip}"
    now = time.time()
    window_start = now - window_seconds

    # Remove old entries outside the window
    redis_client.zremrangebyscore(key, 0, window_start)

    # Count requests in current window
    current_count = redis_client.zcard(key)

    if current_count < max_requests:
        # Add new request
        redis_client.zadd(key, {str(now): now})
        redis_client.expire(key, window_seconds)
        return True

    return False
```

**Environment Variable:**
| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |

**Reference:** `backend/main.py` (lines 135-176) - current in-memory implementation
