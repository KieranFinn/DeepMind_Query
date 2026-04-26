"""
Global exception handling middleware for DeepMind_Query API.

Provides unified error responses and proper logging without exposing
internal stack traces to clients.
"""

import logging
import traceback
from typing import Union

from fastapi import Request, FastAPI
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)


class ErrorResponse:
    """Standard error response format."""

    def __init__(self, error: str, code: str):
        self.error = error
        self.code = code

    def to_dict(self) -> dict:
        return {"error": self.error, "code": self.code}


async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Catch-all exception handler for unhandled exceptions.

    Returns unified error format without exposing stack traces.
    Logs full error details at ERROR level.
    """
    # Log full error details at ERROR level
    logger.error(
        "Unhandled exception",
        extra={
            "error_type": type(exc).__name__,
            "error_message": str(exc),
            "error_traceback": traceback.format_exc(),
            "path": request.url.path,
            "method": request.method,
            "client_ip": request.client.host if request.client else "unknown",
        }
    )

    # Return safe error response without stack trace
    error_response = ErrorResponse(
        error="Internal server error",
        code="INTERNAL_ERROR"
    )

    return JSONResponse(
        status_code=500,
        content=error_response.to_dict()
    )


def register_exception_handlers(app: FastAPI) -> None:
    """
    Register global exception handlers to the FastAPI application.

    This should be called after the app is created but before
    including routers.
    """
    # Register catch-all exception handler
    app.add_exception_handler(Exception, global_exception_handler)


class ErrorHandlerMiddleware(BaseHTTPMiddleware):
    """
    Middleware for handling exceptions at the middleware level.

    This catches any exceptions that escape the route handlers
    and ensures they are logged properly and return a safe response.
    """

    async def dispatch(self, request: Request, call_next):
        try:
            response = await call_next(request)
            return response
        except Exception as e:
            # Log the exception with full details
            logger.error(
                "Middleware exception",
                extra={
                    "error_type": type(e).__name__,
                    "error_message": str(e),
                    "error_traceback": traceback.format_exc(),
                    "path": request.url.path,
                    "method": request.method,
                    "client_ip": request.client.host if request.client else "unknown",
                }
            )

            # Return unified error response
            error_response = ErrorResponse(
                error="Internal server error",
                code="INTERNAL_ERROR"
            )

            return JSONResponse(
                status_code=500,
                content=error_response.to_dict()
            )
