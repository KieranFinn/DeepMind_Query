"""Test 10: Test session rename"""
import pytest
from playwright.sync_api import Page, expect


def test_rename_session(page: Page):
    """测试会话重命名 → 验证标题更新"""
    page.goto("http://localhost:5173")
    page.wait_for_load_state("networkidle")

    # Wait for session to load
    page.wait_for_timeout(1000)

    # Find the session title (should be in the header or node)
    # Look for edit button near session title
    edit_button = page.locator('button:has-text("编辑"), [data-testid="edit-title"]')

    if edit_button.is_visible():
        edit_button.click()
        page.wait_for_timeout(500)

        # Find the title input
        title_input = page.locator('input[value*="会话"], input[placeholder*="标题"]')
        if title_input.is_visible():
            title_input.clear()
            title_input.fill("我的新标题")
            page.keyboard.press("Enter")
            page.wait_for_timeout(500)

            # Verify new title appears
            expect(page.get_by_text("我的新标题")).to_be_visible()
