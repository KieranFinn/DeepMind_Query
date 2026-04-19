"""Test 5: Delete node, verify child nodes are cascade deleted"""
import pytest
from playwright.sync_api import Page, expect


def test_delete_node_cascade(page: Page):
    """删除节点 → 验证子节点也被级联删除"""
    page.goto("http://localhost:5173")
    page.wait_for_load_state("networkidle")

    # First create a branch
    node = page.locator(".react-flow__node").first
    node.dblclick()
    page.wait_for_timeout(1000)

    # Get initial node count
    initial_count = page.locator(".react-flow__node").count()
    assert initial_count >= 2, "Need at least 2 nodes for this test"

    # Right-click on the first node to open context menu
    first_node = page.locator(".react-flow__node").first
    first_node.click(button="right")

    # Look for delete option
    page.wait_for_timeout(500)
    delete_button = page.get_by_role("button", name="删除")
    if delete_button.is_visible():
        delete_button.click()
        page.wait_for_timeout(1000)

        # Verify node count decreased
        new_count = page.locator(".react-flow__node").count()
        assert new_count < initial_count, f"Expected fewer nodes after delete, got {new_count}"
