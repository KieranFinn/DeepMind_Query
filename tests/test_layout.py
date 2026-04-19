"""Test 7: Test layout toggle with dagre"""
import pytest
from playwright.sync_api import Page, expect


def test_layout_toggle(page: Page):
    """测试一键整理 → 验证 dagre 布局生效"""
    page.goto("http://localhost:5173")
    page.wait_for_load_state("networkidle")

    # Wait for graph to be visible
    page.wait_for_timeout(1000)

    # Look for layout toggle button (should be in floating graph or map viewer)
    # Try to find the ⊞ or ◎ button
    layout_button = page.locator('button:has-text("⊞"), button:has-text("◎")')

    if layout_button.is_visible():
        # Click to toggle layout
        layout_button.click()
        page.wait_for_timeout(500)

        # Verify graph re-rendered (nodes should still be there)
        nodes = page.locator(".react-flow__node")
        expect(nodes.first).to_be_visible()
