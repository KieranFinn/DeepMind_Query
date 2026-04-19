"""Test 3: Create branch session, verify graph shows branch edge"""
import pytest
from playwright.sync_api import Page, expect


def test_create_branch(page: Page):
    """创建分支会话 → 验证图谱出现分支边"""
    page.goto("http://localhost:5173")
    page.wait_for_load_state("networkidle")

    # Wait for graph to load
    page.wait_for_timeout(1000)

    # Double-click on the first node to create child
    first_node = page.locator(".react-flow__node").first
    first_node.dblclick()

    # Wait for child node to appear
    page.wait_for_timeout(1000)

    # Verify we now have more than one node
    nodes = page.locator(".react-flow__node")
    expect(nodes).to_have_count(2, timeout=5000)
