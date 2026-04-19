# DeepMind_Query E2E Tests

End-to-end tests for DeepMind_Query using Playwright (Python).

## Setup

### 1. Install Playwright

```bash
pip install playwright
playwright install chromium
```

### 2. Install Test Dependencies

```bash
cd /Users/kieransworkstation/gt/DeepMind_Query/mayor/rig
pip install pytest pytest-asyncio
```

### 3. Start Backend and Frontend

```bash
# Terminal 1: Start backend
cd /Users/kieransworkstation/gt/DeepMind_Query/mayor/rig/backend
python main.py

# Terminal 2: Start frontend
cd /Users/kieransworkstation/gt/DeepMind_Query/mayor/rig/frontend
npm run dev
```

## Running Tests

### Run all tests
```bash
pytest tests/test_e2e.py -v
```

### Run specific test
```bash
pytest tests/test_e2e.py::test_create_region -v
```

### Skip slow tests
```bash
pytest tests/test_e2e.py -v -m "not slow"
```

### Run only tests that need backend
```bash
pytest tests/test_e2e.py -v -m "requires_backend"
```

### Show browser (headful mode)
For debugging, you can temporarily modify `conftest.py` to set `headless=False`.

## Test Cases

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `test_create_region` | Create knowledge region and verify in list |
| 2 | `test_create_session_and_chat` | Create session, send message, verify AI reply |
| 3 | `test_create_branch` | Create branch session, verify graph edge |
| 4 | `test_double_click_node` | Double-click node, verify child node created |
| 5 | `test_delete_node_cascade` | Delete node, verify cascade deletion |
| 6 | `test_switch_region` | Switch between regions, verify content change |
| 7 | `test_layout_toggle` | Toggle dagre layout, verify reorganization |
| 8 | `test_bigbang_analysis` | Trigger big bang analysis, verify result |
| 9 | `test_followup_suggestions` | After chat, verify follow-up suggestions |
| 10 | `test_rename_session` | Rename session title, verify update |

## Configuration

- **Backend URL**: `http://localhost:8000`
- **Frontend URL**: `http://localhost:5173`
- **Browser**: Chromium (headless by default)
- **Viewport**: 1400x900
- **Locale**: zh-CN

## Troubleshooting

### Tests timeout
Increase timeout in `conftest.py` or per-test with `@pytest.mark.timeout(60)`.

### Backend connection errors
Ensure backend is running on port 8000 before starting tests.

### LocalStorage state interference
Use `clean_state_page` fixture to start with fresh localStorage.
