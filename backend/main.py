from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from routes import router
from contextlib import asynccontextmanager
from middleware.error_handler import register_exception_handlers
import os
import secrets
import logging
import traceback

logger = logging.getLogger(__name__)

# API Key configuration
API_KEY = os.getenv("API_KEY", "")
API_KEY_NAME = os.getenv("API_KEY_NAME", "X-API-Key")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("DeepMind_Query API starting...")
    # Initialize SQLite database tables
    from db import init_all_tables
    init_all_tables()
    print("Database tables initialized.")
    if API_KEY:
        print(f"API Key authentication ENABLED")
    else:
        print("API Key authentication DISABLED (set API_KEY env var to enable)")
    if USE_REDIS:
        print(f"Redis rate limiting ENABLED ({REDIS_URL})")
    else:
        print("Redis rate limiting DISABLED (set REDIS_URL env var to enable for multi-instance deployments)")
    yield
    # Shutdown
    print("DeepMind_Query API shutting down...")


app = FastAPI(
    title="DeepMind_Query API",
    description="知识蛛网 LLM 对话后端 API",
    version="1.0.0",
    lifespan=lifespan,
)

# Register global exception handlers
register_exception_handlers(app)


# Global exception handler - prevents stack trace leakage
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch all unhandled exceptions and return sanitized error response"""
    # Log the full error server-side for debugging
    logger.error(f"Unhandled exception: {exc}\n{traceback.format_exc()}")
    # Return sanitized error to client - no stack trace
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "code": "INTERNAL_ERROR"}
    )


# HTTPException handler - ensures consistent {error, code} format
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Return HTTPException errors in consistent {error, code} format"""
    # Map status codes to error codes
    error_codes = {
        400: "BAD_REQUEST",
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        405: "METHOD_NOT_ALLOWED",
        422: "VALIDATION_ERROR",
        429: "RATE_LIMITED",
        500: "INTERNAL_ERROR",
    }
    code = error_codes.get(exc.status_code, f"HTTP_{exc.status_code}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail, "code": code}
    )


# API Key authentication middleware
@app.middleware("http")
async def api_key_auth(request: Request, call_next):
    # Skip auth for OPTIONS (CORS preflight) requests
    if request.method == "OPTIONS":
        return await call_next(request)

    # Skip auth for docs and health endpoints
    if request.url.path in ["/docs", "/redoc", "/openapi.json", "/health"]:
        return await call_next(request)

    # Skip auth if no API_KEY is configured
    if not API_KEY:
        return await call_next(request)

    # Check API key in header
    provided_key = request.headers.get(API_KEY_NAME)
    if not provided_key:
        return JSONResponse(
            status_code=401,
            content={"detail": f"Missing {API_KEY_NAME} header"}
        )

    if not secrets.compare_digest(provided_key, API_KEY):
        return JSONResponse(
            status_code=401,
            content={"detail": "Invalid API key"}
        )

    return await call_next(request)


# Request ID middleware - generates unique ID for each request
import uuid


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    request.state.request_id = request_id

    # Log request start
    logger.info(
        f"request_start",
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "client_ip": request.client.host if request.client else "unknown",
        }
    )

    response = await call_next(request)

    # Add request ID to response headers
    response.headers["X-Request-ID"] = request_id

    # Log request end
    logger.info(
        f"request_end",
        extra={
            "request_id": request_id,
            "status_code": response.status_code,
        }
    )

    return response


# CORS configuration from environment variable (comma-separated list)
# Default to localhost for development
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

# CORS middleware - use explicit origins, not wildcard with credentials
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", API_KEY_NAME],
)


# Rate limiting middleware (token bucket per IP)
# Supports both in-memory (single instance) and Redis (distributed multi-instance)
from collections import defaultdict
from time import time
import os

RATE_LIMIT_TOKENS = 10  # Max requests
RATE_LIMIT_REFILL = 60  # Seconds to refill bucket

# Redis configuration for distributed rate limiting
REDIS_URL = os.getenv("REDIS_URL", "")
USE_REDIS = bool(REDIS_URL)

# Redis client (lazy initialization)
_redis_client = None


def _get_redis_client():
    """Get or create Redis client (lazy initialization)."""
    global _redis_client
    if _redis_client is None and USE_REDIS:
        try:
            import redis
            _redis_client = redis.from_url(REDIS_URL, decode_responses=True)
            _redis_client.ping()  # Test connection
            logger.info(f"Redis rate limiting enabled: {REDIS_URL}")
        except Exception as e:
            logger.warning(f"Redis connection failed, falling back to in-memory rate limiting: {e}")
            _redis_client = None
    return _redis_client


def _check_rate_limit_redis(client_ip: str) -> bool:
    """Check rate limit using Redis sliding window counter."""
    import redis
    client = _get_redis_client()
    if client is None:
        return _check_rate_limit_memory(client_ip)

    key = f"rate_limit:{client_ip}"
    now = time()
    window_start = now - RATE_LIMIT_REFILL

    pipe = client.pipeline()
    # Remove old entries outside the window
    pipe.zremrangebyscore(key, 0, window_start)
    # Count requests in current window
    pipe.zcard(key)
    # Add current request
    pipe.zadd(key, {str(now): now})
    # Set expiry on the key
    pipe.expire(key, RATE_LIMIT_REFILL * 2)
    results = pipe.execute()

    request_count = results[1]
    if request_count >= RATE_LIMIT_TOKENS:
        return False
    return True


# In-memory fallback rate limiting
rate_limit_data = defaultdict(lambda: {"tokens": RATE_LIMIT_TOKENS, "last_refill": time()})


def _check_rate_limit_memory(client_ip: str) -> bool:
    """Check rate limit using in-memory token bucket (single instance only)."""
    now = time()
    data = rate_limit_data[client_ip]

    # Refill tokens based on time elapsed
    elapsed = now - data["last_refill"]
    tokens_to_add = (elapsed / RATE_LIMIT_REFILL) * RATE_LIMIT_TOKENS
    data["tokens"] = min(RATE_LIMIT_TOKENS, data["tokens"] + tokens_to_add)
    data["last_refill"] = now

    if data["tokens"] >= 1:
        data["tokens"] -= 1
        return True
    return False


def check_rate_limit(client_ip: str) -> bool:
    """Returns True if request is allowed, False if rate limited."""
    if USE_REDIS:
        return _check_rate_limit_redis(client_ip)
    return _check_rate_limit_memory(client_ip)


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    # Only rate limit the message endpoint
    if "/message" not in request.url.path:
        return await call_next(request)

    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(client_ip):
        logger.warning(f"Rate limit exceeded for {client_ip}")
        return JSONResponse(
            status_code=429,
            content={"detail": "Rate limit exceeded. Try again later."}
        )

    return await call_next(request)


# Health check endpoint
@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": "1.0.0"}


# Include routes
app.include_router(router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
