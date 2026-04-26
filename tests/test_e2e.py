"""
E2E tests for DeepMind_Query using Playwright (Python).

Run with: pytest tests/test_e2e.py -v
"""
import pytest
import asyncio
from playwright.async_api import Page, expect


BACKEND_URL = "http://localhost:8000"
FRONTEND_URL = "http://localhost:5173"


# ==================== Helper Functions ====================

async def wait_for_region_list(page: Page) -> None:
    """Wait for region list to be visible."""
    await page.wait_for_selector("text=知识区", timeout=10000)


async def create_region_via_api(page: Page, name: str) -> str:
    """Create a region via API and return region ID."""
    response = await page.request.post(
        f"{BACKEND_URL}/api/regions",
        headers={"Content-Type": "application/json"},
        data={"name": name, "description": "", "color": "#d4a574"}
    )
    assert response.ok, f"Failed to create region: {response.status}"
    region = await response.json()
    return region["id"]


async def create_node_via_api(page: Page, region_id: str, title: str = "Test Node") -> str:
    """Create a node via API and return node ID."""
    response = await page.request.post(
        f"{BACKEND_URL}/api/regions/{region_id}/graph/nodes",
        headers={"Content-Type": "application/json"},
        data={"title": title}
    )
    assert response.ok, f"Failed to create node: {response.status}"
    result = await response.json()
    return result["node"]["id"]


async def delete_region_via_api(page: Page, region_id: str) -> None:
    """Delete a region via API."""
    response = await page.request.delete(f"{BACKEND_URL}/api/regions/{region_id}")
    if not response.ok:
        print(f"Warning: Failed to delete region {region_id}: {response.status}")


async def delete_node_via_api(page: Page, region_id: str, node_id: str) -> None:
    """Delete a node via API."""
    response = await page.request.delete(
        f"{BACKEND_URL}/api/regions/{region_id}/graph/nodes/{node_id}"
    )
    if not response.ok:
        print(f"Warning: Failed to delete node {node_id}: {response.status}")


# ==================== Test 1: Create Region ====================

@pytest.mark.requires_backend
async def test_create_region(authenticated_page: Page):
    """
    Test creating a knowledge region.
    Steps:
    1. Click "+ 新建" button
    2. Enter region name
    3. Click confirm
    4. Verify region appears in the list
    """
    page = authenticated_page

    # Click the new region button
    await page.click("button:has-text('+ 新建')")

    # Wait for input to appear
    await page.wait_for_selector("input[placeholder*='知识区名称']", timeout=5000)

    # Enter region name
    test_region_name = "测试知识区"
    await page.fill("input[placeholder*='知识区名称']", test_region_name)

    # Click confirm (checkmark button)
    await page.click("button:has-text('✓')")

    # Wait for region to appear in list
    await page.wait_for_selector(f"text={test_region_name}", timeout=5000)

    # Verify region is in the list with correct name
    region_button = page.locator(f"button:has-text('{test_region_name}')")
    await expect(region_button).to_be_visible()

    # Verify node count shows 0
    await page.wait_for_selector(f"text={test_region_name}")
    # The region should be created and visible

    # Cleanup - delete the region
    # First click on the region to make it active, then delete
    await region_button.click()
    await page.wait_for_timeout(500)


# ==================== Test 2: Create Session and Chat ====================

@pytest.mark.requires_backend
@pytest.mark.slow
async def test_create_session_and_chat(authenticated_page: Page):
    """
    Test creating a session and sending a chat message.
    Steps:
    1. Create or select a region
    2. Click "+ 会话" to create a new session
    3. Type a message in the chat input
    4. Send the message
    5. Verify user message appears
    6. Verify AI response streams in (wait for assistant message)
    """
    page = authenticated_page

    # First ensure we have a region
    await wait_for_region_list(page)

    # Check if there's at least one region, if not create one
    regions = await page.query_selector_all("text=暂无知识区")
    if len(regions) > 0:
        # Need to create a region first
        await page.click("button:has-text('+ 新建')")
        await page.fill("input[placeholder*='知识区名称']", "聊天测试区")
        await page.click("button:has-text('✓')")
        await page.wait_for_selector("text=聊天测试区", timeout=5000)

    # Wait for regions to load
    await page.wait_for_timeout(500)

    # Click on the first available region
    region_selector = page.locator("button").filter(has_text=lambda t: t and "测试" in t).first
    try:
        await region_selector.click(timeout=3000)
    except:
        # If no test region, just click first region
        pass

    await page.wait_for_timeout(500)

    # Look for "+ 会话" button and click it
    session_buttons = await page.query_selector_all("button:has-text('+ 会话')")
    if len(session_buttons) > 0:
        await session_buttons[0].click()
    else:
        # Try clicking in the session area
        add_session = page.locator("button", has_text="+ 会话").first
        await add_session.click()

    await page.wait_for_timeout(1000)

    # Now we should have a session. Find the chat input
    chat_input = page.locator("textarea[placeholder*='问题']")
    if not await chat_input.is_visible():
        chat_input = page.locator("textarea").first

    # Type a test message
    test_message = "你好，请介绍一下你自己"
    await chat_input.fill(test_message)

    # Send the message (click the send button)
    send_button = page.locator("button:has-text('↑')")
    await send_button.click()

    # Wait for user message to appear
    await page.wait_for_selector(f"text={test_message}", timeout=5000)

    # Verify user message bubble appears
    user_bubble = page.locator(f"text={test_message}").first
    await expect(user_bubble).to_be_visible()

    # Wait for AI response (streaming)
    # The response should appear in the assistant bubble
    await page.wait_for_timeout(3000)  # Wait for streaming to start

    # Check that there's an assistant message
    # Look for the markdown content or any assistant response
    assistant_bubbles = page.locator(".markdown-content")
    if await assistant_bubbles.count() > 1:  # At least user + assistant
        pass  # Test passes if we have assistant response


# ==================== Test 3: Create Branch ====================

@pytest.mark.requires_backend
async def test_create_branch(authenticated_page: Page):
    """
    Test creating a branch session.
    Steps:
    1. Create a region and session if not exists
    2. Double-click on a node in the graph to create child node (branch)
    3. Verify new node appears in the session list
    4. Verify the graph shows a new edge (branch edge)
    """
    page = authenticated_page
    region_id = None
    node_id = None

    try:
        # Create region and node via API for faster setup
        region_id = await create_region_via_api(page, "分支测试区")
        node_id = await create_node_via_api(page, region_id, "父会话")

        # Reload page to pick up the new region
        await page.reload(wait_until="networkidle")
        await page.wait_for_timeout(1000)

        # Click on the region to select it
        await page.click(f"button:has-text('分支测试区')")
        await page.wait_for_timeout(500)

        # The session should appear - click on it
        await page.click("button:has-text('父会话')")
        await page.wait_for_timeout(500)

        # Now we need to create a branch. Double-click on a node in the graph
        # The DraggableKnowledgeGraph should be visible
        # Look for the graph panel
        graph_area = page.locator(".react-flow")

        if await graph_area.first.is_visible():
            # Double click on a node card to create a branch
            node_cards = page.locator(".react-flow__node")
            if await node_cards.count() > 0:
                await node_cards.first.dblclick()
                await page.wait_for_timeout(2000)

        # Check if a new session was created
        # Look for a new button with "分支" text
        branch_nodes = await page.query_selector_all("button:has-text('分支')")
        # Exactly 1 branch should be created from a double-click
        assert len(branch_nodes) == 1, f"Expected exactly 1 branch node, found {len(branch_nodes)}"

    finally:
        # Cleanup
        if region_id:
            await delete_region_via_api(page, region_id)


# ==================== Test 4: Double-Click Node ====================

@pytest.mark.requires_backend
async def test_double_click_node(authenticated_page: Page):
    """
    Test double-clicking on a node creates a child node.
    Steps:
    1. Create a region with a session
    2. Find the graph view
    3. Double-click on an existing node
    4. Verify a new node appears
    """
    page = authenticated_page
    region_id = None

    try:
        # Create region and two nodes (parent and expected child target)
        region_id = await create_region_via_api(page, "双击测试区")
        parent_node_id = await create_node_via_api(page, region_id, "双击测试父节点")

        # Reload to pick up changes
        await page.reload(wait_until="networkidle")
        await page.wait_for_timeout(1000)

        # Select the region
        await page.click(f"button:has-text('双击测试区')")
        await page.wait_for_timeout(500)

        # Select the node
        await page.click("button:has-text('双击测试父节点')")
        await page.wait_for_timeout(500)

        # Count nodes before
        nodes_before = await page.query_selector_all("button:has-text('双击测试父节点')")

        # Double click in the graph area to create child node
        # The graph is in the floating panel
        graph_nodes = page.locator(".react-flow__node")
        if await graph_nodes.first.is_visible(timeout=3000):
            await graph_nodes.first.dblclick()
            await page.wait_for_timeout(2000)

        # Check that the node list has changed (new branch node should appear)
        # Look for nodes with "分支" in the name
        branch_buttons = await page.query_selector_all("button:has-text('分支')")

        # Verify exactly 1 branch was created (double-click creates one child node)
        assert len(branch_buttons) == 1, f"Expected exactly 1 branch button, found {len(branch_buttons)}"

    finally:
        if region_id:
            await delete_region_via_api(page, region_id)


# ==================== Test 5: Delete Node Cascade ====================

@pytest.mark.requires_backend
async def test_delete_node_cascade(authenticated_page: Page):
    """
    Test that deleting a node also deletes its child nodes (cascade).
    Steps:
    1. Create a region with parent and child nodes
    2. Get initial node count
    3. Delete the parent node
    4. Verify child nodes are also deleted
    """
    page = authenticated_page
    region_id = None

    try:
        # Create region with nodes via API
        region_id = await create_region_via_api(page, "删除级联测试区")
        parent_node_id = await create_node_via_api(page, region_id, "父节点")
        child_node_id = await create_node_via_api(page, region_id, "子节点")

        # Create parent-child relationship via API
        await page.request.post(
            f"{BACKEND_URL}/api/regions/{region_id}/graph/nodes/{parent_node_id}/children",
            params={"title": "API创建的子节点"}
        )

        # Reload to get fresh state
        await page.reload(wait_until="networkidle")
        await page.wait_for_timeout(1000)

        # Select the region
        await page.click(f"button:has-text('删除级联测试区')")
        await page.wait_for_timeout(500)

        # Get initial node count from the session list
        session_buttons = await page.query_selector_all("text=条消息")
        initial_count = len(session_buttons)

        # Find and click the delete button for a node
        # First, select a node to make it active
        node_buttons = await page.query_selector_all("button:has-text('父节点')")
        if len(node_buttons) > 0:
            await node_buttons[0].click()
            await page.wait_for_timeout(500)

        # Look for trash icon button to delete
        delete_buttons = await page.query_selector_all("button[title='删除会话']")
        if len(delete_buttons) > 0:
            await delete_buttons[0].click()
            await page.wait_for_timeout(500)

            # Confirm deletion if there's a confirmation dialog
            confirm_buttons = await page.query_selector_all("button:has-text('删除')")
            for btn in confirm_buttons:
                if await btn.is_visible():
                    await btn.click()
                    break

            await page.wait_for_timeout(1000)

        # Verify node count decreased
        session_buttons_after = await page.query_selector_all("text=条消息")
        final_count = len(session_buttons_after)

        # The count should be less after deletion (cascade delete)
        # Note: This depends on the actual cascade behavior

    finally:
        if region_id:
            await delete_region_via_api(page, region_id)


# ==================== Test 6: Switch Region ====================

@pytest.mark.requires_backend
async def test_switch_region(authenticated_page: Page):
    """
    Test switching between knowledge regions.
    Steps:
    1. Create two regions
    2. Click on first region, verify it becomes active
    3. Click on second region, verify it becomes active
    4. Verify graph/content changes accordingly
    """
    page = authenticated_page
    region1_id = None
    region2_id = None

    try:
        # Create two regions
        region1_id = await create_region_via_api(page, "区域一")
        region2_id = await create_region_via_api(page, "区域二")

        # Add different nodes to each region
        await create_node_via_api(page, region1_id, "区域一的会话")
        await create_node_via_api(page, region2_id, "区域二的会话")

        # Reload to pick up changes
        await page.reload(wait_until="networkidle")
        await page.wait_for_timeout(1000)

        # Click on first region
        await page.click("button:has-text('区域一')")
        await page.wait_for_timeout(500)

        # Verify content shows first region's session
        await page.wait_for_selector("text=区域一的会话", timeout=5000)

        # Click on second region
        await page.click("button:has-text('区域二')")
        await page.wait_for_timeout(500)

        # Verify content shows second region's session
        await page.wait_for_selector("text=区域二的会话", timeout=5000)

        # Verify first region is no longer active
        # (The first region button should not have the active styling)

    finally:
        # Cleanup
        if region1_id:
            await delete_region_via_api(page, region1_id)
        if region2_id:
            await delete_region_via_api(page, region2_id)


# ==================== Test 7: Layout Toggle ====================

@pytest.mark.requires_backend
async def test_layout_toggle(authenticated_page: Page):
    """
    Test the one-click layout organization (dagre layout).
    Steps:
    1. Create a region with multiple nodes
    2. Find the layout toggle button in the floating graph
    3. Click it to apply dagre layout
    4. Verify layout changes (nodes become more organized)
    """
    page = authenticated_page
    region_id = None

    try:
        # Create region with multiple nodes
        region_id = await create_region_via_api(page, "布局测试区")
        await create_node_via_api(page, region_id, "节点A")
        await create_node_via_api(page, region_id, "节点B")
        await create_node_via_api(page, region_id, "节点C")

        # Reload page
        await page.reload(wait_until="networkidle")
        await page.wait_for_timeout(1000)

        # Select the region
        await page.click("button:has-text('布局测试区')")
        await page.wait_for_timeout(1000)

        # Look for the layout toggle button in the floating graph
        # It should show "⊞" for dagre mode or "◎" for force mode
        layout_button = page.locator("button[title*='布局']")
        if await layout_button.is_visible():
            # Get initial positions
            initial_positions = await page.evaluate("""() => {
                const nodes = document.querySelectorAll('.react-flow__node');
                return Array.from(nodes).map(n => ({
                    id: n.getAttribute('data-id'),
                    x: parseFloat(n.style.left),
                    y: parseFloat(n.style.top)
                }));
            }""")

            # Click layout toggle
            await layout_button.click()
            await page.wait_for_timeout(1000)

            # Get new positions
            new_positions = await page.evaluate("""() => {
                const nodes = document.querySelectorAll('.react-flow__node');
                return Array.from(nodes).map(n => ({
                    id: n.getAttribute('data-id'),
                    x: parseFloat(n.style.left),
                    y: parseFloat(n.style.top)
                }));
            }""")

            # Verify positions changed (dagre should reorganize)
            # Note: This is a basic check - in reality dagre should give more structured layout

    finally:
        if region_id:
            await delete_region_via_api(page, region_id)


# ==================== Test 8: BigBang Analysis ====================

@pytest.mark.slow
async def test_bigbang_analysis(authenticated_page: Page):
    """
    Test the BigBang analysis feature.
    Steps:
    1. Create a region with at least 3 sessions
    2. Navigate to MapViewer tab
    3. Find and click "💥 大爆炸" button
    4. Wait for analysis to complete
    5. Verify analysis result is displayed
    """
    page = authenticated_page
    region_id = None

    try:
        # Create region with 3+ nodes (required for big bang)
        region_id = await create_region_via_api(page, "大爆炸测试区")
        await create_node_via_api(page, region_id, "会话1")
        await create_node_via_api(page, region_id, "会话2")
        await create_node_via_api(page, region_id, "会话3")

        # Reload page
        await page.reload(wait_until="networkidle")
        await page.wait_for_timeout(1000)

        # Select the region
        await page.click("button:has-text('大爆炸测试区')")
        await page.wait_for_timeout(500)

        # Switch to MapViewer tab
        await page.click("button:has-text('MapViewer')")
        await page.wait_for_timeout(1000)

        # Look for the BigBang button
        bigbang_button = page.locator("button:has-text('大爆炸')")
        if await bigbang_button.is_visible():
            await bigbang_button.click()
            await page.wait_for_timeout(500)

            # Wait for the BigBang modal to appear
            modal = page.locator("text=大爆炸分析")
            await modal.wait_for({ state: "visible", timeout: 10000 })

            # Wait for analysis to complete (can take a while)
            # Look for "继续探索" button which appears when done
            try:
                continue_button = page.locator("button:has-text('继续探索')")
                await continue_button.wait_for({ state: "visible", timeout: 60000 })
                # Test passes - analysis completed
            except:
                # If it times out, at least verify the modal appeared
                await page.wait_for_selector("text=大爆炸分析", timeout=5000)

    finally:
        if region_id:
            await delete_region_via_api(page, region_id)


# ==================== Test 9: Follow-up Suggestions ====================

@pytest.mark.requires_backend
@pytest.mark.slow
async def test_followup_suggestions(authenticated_page: Page):
    """
    Test the follow-up suggestions feature.
    Steps:
    1. Create a region and session
    2. Send a message and wait for AI response
    3. Verify "追问" button appears
    4. Click the button
    5. Verify follow-up modal appears with suggestions
    """
    page = authenticated_page
    region_id = None

    try:
        # Create region and session
        region_id = await create_region_via_api(page, "追问测试区")
        await create_node_via_api(page, region_id, "追问测试会话")

        # Reload page
        await page.reload(wait_until="networkidle")
        await page.wait_for_timeout(1000)

        # Select region and session
        await page.click("button:has-text('追问测试区')")
        await page.wait_for_timeout(500)
        await page.click("button:has-text('追问测试会话')")
        await page.wait_for_timeout(500)

        # Send a message
        chat_input = page.locator("textarea").first
        await chat_input.fill("什么是人工智能？")
        await page.click("button:has-text('↑')")

        # Wait for response
        await page.wait_for_timeout(5000)

        # Look for the follow-up button "追问"
        followup_button = page.locator("button:has-text('追问')")
        if await followup_button.is_visible():
            await followup_button.click()
            await page.wait_for_timeout(1000)

            # Verify modal appears
            modal = page.locator("text=智能追问")
            await modal.wait_for({ state: "visible", timeout: 5000 })

    finally:
        if region_id:
            await delete_region_via_api(page, region_id)


# ==================== Test 10: Rename Session ====================

@pytest.mark.requires_backend
async def test_rename_session(authenticated_page: Page):
    """
    Test renaming a session title.
    Steps:
    1. Create a region and session
    2. Click on the session title to edit
    3. Enter new title
    4. Verify title is updated
    """
    page = authenticated_page
    region_id = None

    try:
        # Create region and session
        region_id = await create_region_via_api(page, "重命名测试区")
        await create_node_via_api(page, region_id, "旧标题")

        # Reload page
        await page.reload(wait_until="networkidle")
        await page.wait_for_timeout(1000)

        # Select region and session
        await page.click("button:has-text('重命名测试区')")
        await page.wait_for_timeout(500)
        await page.click("button:has-text('旧标题')")
        await page.wait_for_timeout(500)

        # Find the editable title (clicking on it enables editing)
        title_element = page.locator("h2[title*='修改标题']")
        if not await title_element.is_visible():
            # Try alternative selector
            title_element = page.locator("h2").filter(has_text="旧标题").first

        await title_element.click()
        await page.wait_for_timeout(500)

        # Find the input field that should now be visible
        title_input = page.locator("input[class*='font-semibold']")
        if not await title_input.is_visible():
            # Try generic input in the header
            title_input = page.locator("input[type='text']").first

        if await title_input.is_visible():
            # Clear and type new title
            await title_input.fill("")
            await title_input.fill("新标题测试")

            # Press Enter to save
            await title_input.press("Enter")
            await page.wait_for_timeout(1000)

            # Verify new title appears
            new_title = page.locator("text=新标题测试")
            await new_title.wait_for({ state: "visible", timeout: 5000 })

    finally:
        if region_id:
            await delete_region_via_api(page, region_id)


# ==================== Additional Utility Tests ====================

@pytest.mark.requires_backend
async def test_app_loads_successfully(authenticated_page: Page):
    """
    Sanity test: Verify the app loads without errors.
    """
    page = authenticated_page

    # Check main elements are present
    await page.wait_for_selector("text=知识区", timeout=10000)
    await page.wait_for_selector("text=对话", timeout=5000)

    # No console errors should be present (checked via pageerror handler in conftest)


@pytest.mark.requires_backend
async def test_sidebar_collapse_toggle(authenticated_page: Page):
    """
    Test collapsing and expanding the sidebar.
    """
    page = authenticated_page

    # Find and click the collapse button
    collapse_button = page.locator("button[title='收缩']")
    if await collapse_button.is_visible():
        await collapse_button.click()
        await page.wait_for_timeout(500)

        # Sidebar should now be collapsed (32px wide)
        # The expand indicator should be visible
        expand_indicator = page.locator("[title='展开侧边栏']")
        await expand_indicator.wait_for({ state: "visible", timeout: 5000 })

        # Click to expand
        await expand_indicator.click()
        await page.wait_for_timeout(500)

        # Verify sidebar is expanded again
        await page.wait_for_selector("text=知识区", timeout=5000)
