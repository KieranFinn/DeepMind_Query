"""Rate limiting for API requests.

Supports both IP-based and session-based rate limiting to prevent:
- DoS attacks
- API abuse
- Resource exhaustion
"""

import time
import logging
from collections import defaultdict
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


# Default limits
DEFAULT_IP_RATE_LIMIT_TOKENS = 30  # Max requests per IP
DEFAULT_IP_RATE_LIMIT_REFILL = 60  # Seconds to refill bucket

DEFAULT_SESSION_RATE_LIMIT_TOKENS = 20  # Max requests per session
DEFAULT_SESSION_RATE_LIMIT_REFILL = 60  # Seconds to refill bucket


@dataclass
class RateLimitResult:
    """Result of rate limit check."""
    allowed: bool
    remaining_tokens: float
    retry_after_seconds: Optional[float] = None


class RateLimiter:
    """
    Token bucket rate limiter supporting both IP and session based limiting.

    IP-based limiting: Prevents abuse from single IP addresses
    Session-based limiting: Prevents abuse from single user sessions
    """

    def __init__(
        self,
        ip_tokens: int = DEFAULT_IP_RATE_LIMIT_TOKENS,
        ip_refill_seconds: int = DEFAULT_IP_RATE_LIMIT_REFILL,
        session_tokens: int = DEFAULT_SESSION_RATE_LIMIT_TOKENS,
        session_refill_seconds: int = DEFAULT_SESSION_RATE_LIMIT_REFILL,
    ):
        self.ip_tokens = ip_tokens
        self.ip_refill_seconds = ip_refill_seconds
        self.session_tokens = session_tokens
        self.session_refill_seconds = session_refill_seconds

        # Token buckets: {key: {"tokens": float, "last_refill": float}}
        self._ip_buckets: dict = defaultdict(lambda: {"tokens": ip_tokens, "last_refill": time.time()})
        self._session_buckets: dict = defaultdict(lambda: {"tokens": session_tokens, "last_refill": time.time()})

    def check_ip(self, client_ip: str) -> RateLimitResult:
        """
        Check if IP-based rate limit allows the request.

        Args:
            client_ip: Client IP address

        Returns:
            RateLimitResult with allowed=True if request is allowed
        """
        return self._check_bucket(
            key=client_ip,
            buckets=self._ip_buckets,
            max_tokens=self.ip_tokens,
            refill_seconds=self.ip_refill_seconds,
        )

    def check_session(self, session_id: str) -> RateLimitResult:
        """
        Check if session-based rate limit allows the request.

        Args:
            session_id: Session identifier

        Returns:
            RateLimitResult with allowed=True if request is allowed
        """
        return self._check_bucket(
            key=session_id,
            buckets=self._session_buckets,
            max_tokens=self.session_tokens,
            refill_seconds=self.session_refill_seconds,
        )

    def check_both(self, client_ip: str, session_id: str) -> RateLimitResult:
        """
        Check both IP and session rate limits.

        Request is allowed only if BOTH limits permit it.

        Args:
            client_ip: Client IP address
            session_id: Session identifier

        Returns:
            RateLimitResult with allowed=True only if both limits permit
        """
        ip_result = self.check_ip(client_ip)
        if not ip_result.allowed:
            logger.warning(f"IP rate limit exceeded for {client_ip}")
            return ip_result

        session_result = self.check_session(session_id)
        if not session_result.allowed:
            logger.warning(f"Session rate limit exceeded for {session_id}")
            return session_result

        # Return the more restrictive remaining tokens
        remaining = min(ip_result.remaining_tokens, session_result.remaining_tokens)
        return RateLimitResult(allowed=True, remaining_tokens=remaining)

    def _check_bucket(
        self,
        key: str,
        buckets: dict,
        max_tokens: int,
        refill_seconds: float,
    ) -> RateLimitResult:
        """Check token bucket for a given key."""
        now = time.time()
        bucket = buckets[key]

        # Refill tokens based on time elapsed
        elapsed = now - bucket["last_refill"]
        tokens_to_add = (elapsed / refill_seconds) * max_tokens
        bucket["tokens"] = min(max_tokens, bucket["tokens"] + tokens_to_add)
        bucket["last_refill"] = now

        if bucket["tokens"] >= 1:
            bucket["tokens"] -= 1
            return RateLimitResult(
                allowed=True,
                remaining_tokens=bucket["tokens"],
            )

        # Calculate retry after time
        tokens_needed = 1 - bucket["tokens"]
        retry_after = (tokens_needed / max_tokens) * refill_seconds

        return RateLimitResult(
            allowed=False,
            remaining_tokens=0,
            retry_after_seconds=retry_after,
        )

    def reset_ip(self, client_ip: str) -> None:
        """Reset IP rate limit bucket."""
        if client_ip in self._ip_buckets:
            del self._ip_buckets[client_ip]

    def reset_session(self, session_id: str) -> None:
        """Reset session rate limit bucket."""
        if session_id in self._session_buckets:
            del self._session_buckets[session_id]

    def get_limits(self) -> dict:
        """Return current limits as dict."""
        return {
            "ip_tokens": self.ip_tokens,
            "ip_refill_seconds": self.ip_refill_seconds,
            "session_tokens": self.session_tokens,
            "session_refill_seconds": self.session_refill_seconds,
        }


# Global instance
rate_limiter = RateLimiter()