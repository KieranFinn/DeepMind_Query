"""Content length validation for user input.

All user input content must have an upper limit to prevent:
- Memory exhaustion attacks
- Token limit overflow
- Resource exhaustion
"""

from dataclasses import dataclass
from typing import Optional


# Default limits (can be overridden via environment variables)
DEFAULT_MAX_CONTENT_LENGTH = 10000  # 10000 chars
DEFAULT_MAX_SYSTEM_PROMPT_LENGTH = 4000  # 4000 chars for system prompts
DEFAULT_MAX_KNOWLEDGE_POINT_LENGTH = 5000  # 5000 chars for knowledge points


@dataclass
class ValidationResult:
    """Result of content validation."""
    valid: bool
    error_message: Optional[str] = None
    truncated_value: Optional[str] = None


class ContentValidator:
    """Validates content length limits for user input."""

    def __init__(
        self,
        max_content_length: int = DEFAULT_MAX_CONTENT_LENGTH,
        max_system_prompt_length: int = DEFAULT_MAX_SYSTEM_PROMPT_LENGTH,
        max_knowledge_point_length: int = DEFAULT_MAX_KNOWLEDGE_POINT_LENGTH,
    ):
        self.max_content_length = max_content_length
        self.max_system_prompt_length = max_system_prompt_length
        self.max_knowledge_point_length = max_knowledge_point_length

    def validate_content(self, content: str, content_type: str = "content") -> ValidationResult:
        """
        Validate content length.

        Args:
            content: The content string to validate
            content_type: Type of content ("content", "system_prompt", "knowledge_point")

        Returns:
            ValidationResult with valid=True if within limits,
            or valid=False with error_message if over limit.
        """
        if content is None:
            return ValidationResult(valid=True)

        max_length = self._get_max_length(content_type)

        if len(content) > max_length:
            return ValidationResult(
                valid=False,
                error_message=f"{content_type} exceeds maximum length of {max_length} characters (got {len(content)} characters)"
            )

        return ValidationResult(valid=True)

    def truncate_content(self, content: str, content_type: str = "content") -> str:
        """
        Truncate content to maximum allowed length.

        Args:
            content: The content string to truncate
            content_type: Type of content ("content", "system_prompt", "knowledge_point")

        Returns:
            Truncated content string
        """
        max_length = self._get_max_length(content_type)
        return content[:max_length]

    def _get_max_length(self, content_type: str) -> int:
        """Get max length for content type."""
        if content_type == "system_prompt":
            return self.max_system_prompt_length
        elif content_type == "knowledge_point":
            return self.max_knowledge_point_length
        else:
            return self.max_content_length

    def get_limits(self) -> dict:
        """Return current limits as dict."""
        return {
            "max_content_length": self.max_content_length,
            "max_system_prompt_length": self.max_system_prompt_length,
            "max_knowledge_point_length": self.max_knowledge_point_length,
        }


# Global instance
content_validator = ContentValidator()