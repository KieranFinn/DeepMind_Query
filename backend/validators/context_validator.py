"""Context window validation for conversation history.

The get_conversation_context must have a message count limit to prevent:
- Context overflow
- Memory exhaustion
- LLM token limit overflow
"""

from dataclasses import dataclass
from typing import Optional


# Default limits
DEFAULT_MAX_MESSAGES = 100  # Maximum messages in conversation context
DEFAULT_MAX_TOTAL_TOKENS = 80000  # Rough estimate: 100 messages * ~800 tokens avg


@dataclass
class ContextValidationResult:
    """Result of context validation."""
    valid: bool
    error_message: Optional[str] = None
    message_count: int = 0
    truncated_messages: Optional[list] = None


class ContextValidator:
    """Validates conversation context/window limits."""

    def __init__(
        self,
        max_messages: int = DEFAULT_MAX_MESSAGES,
        max_total_tokens: int = DEFAULT_MAX_TOTAL_TOKENS,
    ):
        self.max_messages = max_messages
        self.max_total_tokens = max_total_tokens

    def validate_messages(self, messages: list) -> ContextValidationResult:
        """
        Validate that message list doesn't exceed limits.

        Args:
            messages: List of message dicts with 'role' and 'content' keys

        Returns:
            ContextValidationResult with valid=True if within limits,
            or valid=False with error_message if over limit.
        """
        if not messages:
            return ContextValidationResult(valid=True, message_count=0)

        message_count = len(messages)

        if message_count > self.max_messages:
            return ContextValidationResult(
                valid=False,
                error_message=f"Conversation context exceeds maximum of {self.max_messages} messages (got {message_count} messages)",
                message_count=message_count,
            )

        return ContextValidationResult(valid=True, message_count=message_count)

    def truncate_messages(self, messages: list, keep_recent: bool = True) -> list:
        """
        Truncate message list to maximum allowed count.

        Args:
            messages: List of message dicts
            keep_recent: If True, keep most recent messages; if False, keep oldest

        Returns:
            Truncated message list
        """
        if len(messages) <= self.max_messages:
            return messages

        if keep_recent:
            return messages[-self.max_messages:]
        else:
            return messages[:self.max_messages]

    def get_limits(self) -> dict:
        """Return current limits as dict."""
        return {
            "max_messages": self.max_messages,
            "max_total_tokens": self.max_total_tokens,
        }


# Global instance
context_validator = ContextValidator()