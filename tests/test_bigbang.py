"""Test 8: Test BigBang analysis"""
import pytest
from playwright.sync_api import Page, expect


def test_bigbang_analysis(page: Page):
    """测试大爆炸分析 → 验证分析结果展示"""
    page.goto("http://localhost:5173")
    page.wait_for_load_state("networkidle")

    # First create multiple branches to have 3+ nodes
    node = page.locator(".react-flow__node").first
    for _ in range(3):
        node.dblclick()
        page.wait_for_timeout(800)

    # Look for BigBang button (💥 大爆炸)
    bigbang_button = page.locator('button:has-text("大爆炸")')

    if bigbang_button.is_visible():
        bigbang_button.click()
        page.wait_for_timeout(2000)

        # Verify modal or result appears
        modal = page.locator(".modal, [data-testid='bigbang-modal']")
        expect(modal.first).to_be_visible(timeout=5000)
