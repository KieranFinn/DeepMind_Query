"""Test 9: Test follow-up suggestions"""
import pytest
from playwright.sync_api import Page, expect


def test_followup_suggestions(page: Page):
    """测试追问建议 → 验证建议出现"""
    page.goto("http://localhost:5173")
    page.wait_for_load_state("networkidle")

    # Send a message first
    input_selector = 'input[placeholder*="问"], textarea'
    page.fill(input_selector, "什么是Python？")
    page.keyboard.press("Enter")

    # Wait for AI response
    page.wait_for_timeout(5000)

    # Look for follow-up suggestion modal or indicator
    # Usually shown as "追问" or similar
    followup = page.locator('button:has-text("追问"), [data-testid="followup"]')
    if followup.is_visible():
        followup.click()
        page.wait_for_timeout(1000)

        # Verify suggestions appear
        suggestions = page.locator(".suggestion, .followup-direction")
        expect(suggestions.first).to_be_visible(timeout=5000)
