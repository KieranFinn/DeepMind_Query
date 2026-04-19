"""Backend Integration Tests for DeepMind_Query API"""
import pytest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from httpx import AsyncClient, ASGITransport
from main import app
from db import init_all_tables, get_db_connection


@pytest.fixture(autouse=True)
def setup_db():
    """Reset database before each test"""
    init_all_tables()
    # Clear all tables
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM knowledge_point_sessions")
    cursor.execute("DELETE FROM knowledge_points")
    cursor.execute("DELETE FROM messages")
    cursor.execute("DELETE FROM edges")
    cursor.execute("DELETE FROM nodes")
    cursor.execute("DELETE FROM regions")
    conn.commit()
    conn.close()
    yield


@pytest.fixture
async def client():
    """Async test client"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_health_check(client):
    """Test health endpoint"""
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"


@pytest.mark.asyncio
async def test_create_and_get_region(client):
    """Test region creation and retrieval"""
    # Create region
    response = await client.post(
        "/api/regions",
        json={"name": "Test Region", "description": "Test description"}
    )
    assert response.status_code == 200
    region = response.json()
    assert region["name"] == "Test Region"
    region_id = region["id"]

    # Get region
    response = await client.get("/api/regions")
    assert response.status_code == 200
    regions = response.json()
    assert len(regions) == 1
    assert regions[0]["id"] == region_id


@pytest.mark.asyncio
async def test_create_root_node(client):
    """Test node creation"""
    # Create region first
    response = await client.post(
        "/api/regions",
        json={"name": "Test Region"}
    )
    region_id = response.json()["id"]

    # Create node
    response = await client.post(
        f"/api/regions/{region_id}/graph/nodes",
        json={"title": "Test Node"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["node"]["title"] == "Test Node"


@pytest.mark.asyncio
async def test_create_child_node(client):
    """Test child node creation"""
    # Create region with root node
    response = await client.post("/api/regions", json={"name": "Test Region"})
    region_id = response.json()["id"]
    root_node_id = response.json()["graph"]["nodes"][0]["id"]

    # Create child node
    response = await client.post(
        f"/api/regions/{region_id}/graph/nodes/{root_node_id}/children?title=Child Node"
    )
    assert response.status_code == 200
    data = response.json()
    assert "node" in data
    assert data["node"]["title"] == "Child Node"


@pytest.mark.asyncio
async def test_get_graph(client):
    """Test graph retrieval"""
    # Create region
    response = await client.post("/api/regions", json={"name": "Test Region"})
    region_id = response.json()["id"]

    # Get graph
    response = await client.get(f"/api/regions/{region_id}/graph")
    assert response.status_code == 200
    graph = response.json()
    assert "nodes" in graph
    assert "edges" in graph
    assert len(graph["nodes"]) == 1  # Auto-created root node


@pytest.mark.asyncio
async def test_delete_region(client):
    """Test region deletion"""
    # Create region
    response = await client.post("/api/regions", json={"name": "Test Region"})
    region_id = response.json()["id"]

    # Delete region
    response = await client.delete(f"/api/regions/{region_id}")
    assert response.status_code == 200

    # Verify deleted
    response = await client.get("/api/regions")
    regions = response.json()
    assert not any(r["id"] == region_id for r in regions)


@pytest.mark.asyncio
async def test_update_node_title(client):
    """Test node title update"""
    # Create region
    response = await client.post("/api/regions", json={"name": "Test Region"})
    region_id = response.json()["id"]
    node_id = response.json()["graph"]["nodes"][0]["id"]

    # Update title
    response = await client.patch(
        f"/api/regions/{region_id}/graph/nodes/{node_id}/title",
        params={"title": "New Title"}
    )
    assert response.status_code == 200

    # Verify update
    response = await client.get(f"/api/regions/{region_id}/graph")
    graph = response.json()
    updated_node = next(n for n in graph["nodes"] if n["id"] == node_id)
    assert updated_node["title"] == "New Title"


@pytest.mark.asyncio
async def test_region_not_found(client):
    """Test 404 for non-existent region"""
    response = await client.get("/api/regions/00000000-0000-0000-0000-000000000000/graph")
    assert response.status_code == 404
