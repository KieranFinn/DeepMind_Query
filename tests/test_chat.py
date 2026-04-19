"""Test 2: Create session, send message, verify AI response"""
import pytest
from playwright.sync_api import Page, expect


def test_create_session_and_chat(page: Page):
    """创建第一个会话 → 发送消息 → 验证 AI 回复流式输出"""
    page.goto("http://localhost:5173")
    page.wait_for_load_state("networkidle")

    # Wait for the first node to be visible
    page.wait_for_selector('[data-testid="conversation-input"], input[placeholder*="问"]', timeout=5000)

    # Type a message
    input_selector = 'input[placeholder*="问"], textarea'
    page.fill(input_selector, "什么是机器学习？")

    # Send message
    page.keyboard.press("Enter")

    # Verify streaming response appears
    page.wait_for_timeout(2000)
    # Look for any assistant message content
    assistant_content = page.locator(".assistant, [data-role='assistant'], .message-assistant")
    expect(assistant_content.first).to_be_visible(timeout=10000)
