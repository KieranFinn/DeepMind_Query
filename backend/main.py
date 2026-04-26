from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from routes import router
from contextlib import asynccontextmanager
import os
import secrets
import logging

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
    yield
    # Shutdown
    print("DeepMind_Query API shutting down...")


app = FastAPI(
    title="DeepMind_Query API",
    description="知识蛛网 LLM 对话后端 API",
    version="1.0.0",
    lifespan=lifespan,
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
        logger.warning(f"Invalid API key attempt from {request.client.host}")
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


# CORS middleware - use explicit origins, not wildcard with credentials
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", API_KEY_NAME],
)


# Simple rate limiting middleware (token bucket per IP)
from collections import defaultdict
from time import time

RATE_LIMIT_TOKENS = 10  # Max requests
RATE_LIMIT_REFILL = 60  # Seconds to refill bucket

rate_limit_data = defaultdict(lambda: {"tokens": RATE_LIMIT_TOKENS, "last_refill": time()})


def check_rate_limit(client_ip: str) -> bool:
    """Returns True if request is allowed, False if rate limited"""
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
