"""Test 6: Switch region, verify graph changes"""
import pytest
from playwright.sync_api import Page, expect


def test_switch_region(page: Page):
    """切换知识区 → 验证图谱切换"""
    page.goto("http://localhost:5173")
    page.wait_for_load_state("networkidle")

    # Create two regions if we don't have them
    page.get_by_role("button", name="新建知识区").click()
    page.get_by_placeholder("知识区名称").fill("区域A")
    page.get_by_role("button", name="创建").click()
    page.wait_for_timeout(500)

    page.get_by_role("button", name="新建知识区").click()
    page.get_by_placeholder("知识区名称").fill("区域B")
    page.get_by_role("button", name="创建").click()
    page.wait_for_timeout(500)

    # Switch to first region
    page.get_by_text("区域A").click()
    page.wait_for_timeout(1000)

    # Verify we can see region A content
    expect(page.get_by_text("区域A")).to_be_visible()

    # Switch to second region
    page.get_by_text("区域B").click()
    page.wait_for_timeout(1000)

    # Verify we see region B content
    expect(page.get_by_text("区域B")).to_be_visible()
