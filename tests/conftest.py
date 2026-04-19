"""
pytest configuration and fixtures for DeepMind_Query e2e tests.
"""
import pytest
import asyncio
from playwright.async_api import async_playwright, Browser, BrowserContext, Page


# Configuration
BACKEND_URL = "http://localhost:8000"
FRONTEND_URL = "http://localhost:5173"


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
async def browser():
    """Launch browser for all tests (session-scoped for performance)."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"]
        )
        yield browser
        await browser.close()


@pytest.fixture(scope="session")
async def browser_context(browser: Browser):
    """Create a browser context for all tests."""
    context = await browser.new_context(
        viewport={"width": 1400, "height": 900},
        locale="zh-CN",
    )
    yield context
    await context.close()


@pytest.fixture
async def page(browser_context: BrowserContext) -> Page:
    """Create a new page for each test with proper cleanup."""
    page = await browser_context.new_page()

    # Set default timeout
    page.set_default_timeout(30000)

    # Capture console errors
    page.on("console", lambda msg: print(f"[Browser Console] {msg.type}: {msg.text}"))
    page.on("pageerror", lambda exc: print(f"[Page Error] {exc}"))

    yield page

    # Cleanup after test
    await page.close()


@pytest.fixture
async def authenticated_page(page: Page) -> Page:
    """
    Navigate to the app and wait for it to be ready.
    This fixture ensures the app is loaded before each test.
    """
    await page.goto(FRONTEND_URL, wait_until="networkidle")

    # Wait for app to hydrate (Zustand persisted state)
    await page.wait_for_selector("[class*='h-screen']", timeout=10000)

    # Wait for initial load
    await page.wait_for_timeout(1000)

    yield page


@pytest.fixture
async def clean_state_page(authenticated_page: Page) -> Page:
    """
    Page with a fresh state - clears localStorage before test.
    Use this for tests that need a clean slate.
    """
    await authenticated_page.evaluate("() => localStorage.clear()")
    await authenticated_page.reload(wait_until="networkidle")
    await authenticated_page.wait_for_timeout(1000)
    yield authenticated_page


def pytest_configure(config):
    """Register custom markers."""
    config.addinivalue_line(
        "markers", "slow: marks tests as slow (deselect with '-m \"not slow\"')"
    )
    config.addinivalue_line(
        "markers", "requires_backend: marks tests that require backend to be running"
    )


def pytest_collection_modifyitems(config, items):
    """Add markers to tests automatically based on their names."""
    for item in items:
        if "bigbang" in item.nodeid.lower():
            item.add_marker(pytest.mark.slow)
        if "chat" in item.nodeid.lower() or "message" in item.nodeid.lower():
            item.add_marker(pytest.mark.requires_backend)
