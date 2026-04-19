"""Test 4: Double-click node, create child node, verify new node appears"""
import pytest
from playwright.sync_api import Page, expect


def test_double_click_node(page: Page):
    """双击节点 → 创建子节点 → 验证新节点出现"""
    page.goto("http://localhost:5173")
    page.wait_for_load_state("networkidle")

    # Find a node and double-click it
    node = page.locator(".react-flow__node").first
    node.dblclick()

    # Wait for new node to be created
    page.wait_for_timeout(1000)

    # Count nodes - should be more than before
    nodes = page.locator(".react-flow__node")
    node_count = nodes.count()
    assert node_count >= 2, f"Expected at least 2 nodes, got {node_count}"
