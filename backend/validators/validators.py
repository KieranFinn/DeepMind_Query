"""
Validators for DeepMind_Query input validation layer.

This module provides validators for:
- content: max 10000 characters
- context window: max 100 messages
- system prompt: max 5000 characters
"""

from pydantic import Field, field_validator
from typing import Any

# Validation constants
CONTENT_MAX_LENGTH = 10000
CONTEXT_WINDOW_MAX_MESSAGES = 100
SYSTEM_PROMPT_MAX_LENGTH = 5000


def content_validator(value: str) -> str:
    """Validate content length."""
    if len(value) > CONTENT_MAX_LENGTH:
        raise ValueError(f"Content exceeds maximum length of {CONTENT_MAX_LENGTH} characters")
    return value


def context_window_validator(value: list) -> list:
    """Validate context window message count."""
    if len(value) > CONTEXT_WINDOW_MAX_MESSAGES:
        raise ValueError(f"Context window exceeds maximum of {CONTEXT_WINDOW_MAX_MESSAGES} messages")
    return value


def system_prompt_validator(value: str) -> str:
    """Validate system prompt length."""
    if len(value) > SYSTEM_PROMPT_MAX_LENGTH:
        raise ValueError(f"System prompt exceeds maximum length of {SYSTEM_PROMPT_MAX_LENGTH} characters")
    return value


class ContentField:
    """Field descriptor for validated content."""

    @staticmethod
    def max_length() -> Field:
        return Field(max_length=CONTENT_MAX_LENGTH)


class ContextWindowField:
    """Field descriptor for validated context window."""

    @staticmethod
    def max_messages() -> Field:
        return Field(max_length=CONTEXT_WINDOW_MAX_MESSAGES)


class SystemPromptField:
    """Field descriptor for validated system prompt."""

    @staticmethod
    def max_length() -> Field:
        return Field(max_length=SYSTEM_PROMPT_MAX_LENGTH)
