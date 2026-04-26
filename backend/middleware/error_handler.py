"""Exception Handler Middleware - Unified error handling for all routes"""

import logging
import traceback
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.status import HTTP_500_INTERNAL_SERVER_ERROR

logger = logging.getLogger(__name__)

# Error codes for client-safe error responses
class ErrorCode:
    INTERNAL_ERROR = "INTERNAL_ERROR"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    NOT_FOUND = "NOT_FOUND"
    AUTH_ERROR = "AUTH_ERROR"
    RATE_LIMITED = "RATE_LIMITED"
    LLM_ERROR = "LLM_ERROR"
    DATABASE_ERROR = "DATABASE_ERROR"
    INVALID_REQUEST = "INVALID_REQUEST"


def sanitize_error_for_client(error: Exception) -> dict:
    """
    Convert exception to client-safe error format.
    Returns {error: string, code: string} - NO internal details, NO stack traces.
    """
    if isinstance(error, HTTPException):
        # HTTP exceptions already have user-safe messages
        return {
            "error": error.detail,
            "code": _http_status_to_code(error.status_code)
        }

    # For other exceptions, return generic message based on type
    error_type = type(error).__name__

    if error_type == "ValidationError":
        return {"error": str(error), "code": ErrorCode.VALIDATION_ERROR}
    elif error_type == "IntegrityError":
        return {"error": "Database constraint violation", "code": ErrorCode.DATABASE_ERROR}
    elif error_type == "OperationalError":
        return {"error": "Database operation failed", "code": ErrorCode.DATABASE_ERROR}
    elif error_type == "JSONDecodeError":
        return {"error": "Invalid JSON format", "code": ErrorCode.INVALID_REQUEST}

    # Default: generic internal error message
    return {"error": "An internal error occurred", "code": ErrorCode.INTERNAL_ERROR}


def _http_status_to_code(status_code: int) -> str:
    """Map HTTP status codes to error codes"""
    mapping = {
        400: ErrorCode.VALIDATION_ERROR,
        401: ErrorCode.AUTH_ERROR,
        403: ErrorCode.AUTH_ERROR,
        404: ErrorCode.NOT_FOUND,
        422: ErrorCode.VALIDATION_ERROR,
        429: ErrorCode.RATE_LIMITED,
        500: ErrorCode.INTERNAL_ERROR,
    }
    return mapping.get(status_code, ErrorCode.INTERNAL_ERROR)


class ExceptionHandlerMiddleware(BaseHTTPMiddleware):
    """
    Middleware that catches unhandled exceptions and returns sanitized error responses.
    - Logs full error details at ERROR level
    - Returns only {error, code} to client - no stack traces or internal details
    """

    async def dispatch(self, request: Request, call_next):
        try:
            response = await call_next(request)
            return response
        except HTTPException:
            # Re-raise HTTPException to let FastAPI handle it normally
            raise
        except Exception as e:
            # Log full error details for debugging
            request_id = getattr(request.state, "request_id", "unknown")
            logger.error(
                f"Unhandled exception on {request.method} {request.url.path}",
                extra={
                    "request_id": request_id,
                    "error_type": type(e).__name__,
                    "error_message": str(e),
                    "traceback": traceback.format_exc(),
                    "client_ip": request.client.host if request.client else "unknown",
                }
            )

            # Return sanitized error to client
            sanitized = sanitize_error_for_client(e)
            return JSONResponse(
                status_code=HTTP_500_INTERNAL_SERVER_ERROR,
                content=sanitized
            )


def register_exception_handlers(app):
    """
    Register global exception handlers on the FastAPI app.
    Called during app initialization in main.py.
    """
    from fastapi import FastAPI

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        """Handle HTTPException - return sanitized format"""
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": exc.detail,
                "code": _http_status_to_code(exc.status_code)
            }
        )

    @app.exception_handler(Exception)
    async def general_exception_handler(request: Request, exc: Exception):
        """Handle all other unhandled exceptions"""
        request_id = getattr(request.state, "request_id", "unknown")
        logger.error(
            f"Unhandled exception on {request.method} {request.url.path}",
            extra={
                "request_id": request_id,
                "error_type": type(exc).__name__,
                "error_message": str(exc),
                "traceback": traceback.format_exc(),
                "client_ip": request.client.host if request.client else "unknown",
            }
        )

        sanitized = sanitize_error_for_client(exc)
        return JSONResponse(
            status_code=HTTP_500_INTERNAL_SERVER_ERROR,
            content=sanitized
        )
