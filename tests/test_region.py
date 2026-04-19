"""Test 1: Create region and verify it appears in list"""
import pytest
from playwright.sync_api import Page, expect


def test_create_region(page: Page):
    """创建知识区 → 验证出现在列表"""
    page.goto("http://localhost:5173")
    page.wait_for_load_state("networkidle")

    # Click create region button
    page.get_by_role("button", name="新建知识区").click()

    # Fill in region name
    page.get_by_placeholder("知识区名称").fill("测试知识区")
    page.get_by_role("button", name="创建").click()

    # Verify region appears in list
    page.wait_for_timeout(500)
    expect(page.get_by_text("测试知识区")).to_be_visible()
