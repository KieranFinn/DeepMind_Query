"""Graph-based conversation store using Dolt database - Region = Graph, Node = Session"""

import asyncio
import json
import uuid
from collections import deque
from datetime import datetime
from typing import Optional
from db import get_cursor
from models import KnowledgeRegion, Graph, Node, Edge, Message, KnowledgePoint, KnowledgePointSession, CreateKnowledgePointRequest


class ConversationStore:
    """Store using Dolt database for persistence"""

    def __init__(self):
        self.regions: dict[str, KnowledgeRegion] = {}
        self.active_region_id: Optional[str] = None
        self._lock = asyncio.Lock()
        self._loaded = False

    async def lock(self):
        return self._lock

    def _ensure_loaded(self):
        """Lazy load regions from database"""
        if self._loaded:
            return
        self._load_from_db()
        self._loaded = True

    def _load_from_db(self):
        """Load all regions from database"""
        self.regions = {}
        with get_cursor() as cursor:
            # Load regions
            cursor.execute("SELECT * FROM regions ORDER BY created_at")
            for row in cursor.fetchall():
                region_id = str(row['id'])
                region = self._row_to_region(row)
                self.regions[region_id] = region

            # Load nodes and edges for each region
            for region_id in self.regions:
                self.regions[region_id].graph = self._load_graph(region_id)

        # Set active region to first if not set
        if not self.active_region_id and self.regions:
            self.active_region_id = next(iter(self.regions.keys()))

    def _load_graph(self, region_id: str) -> Graph:
        """Load graph (nodes + edges) for a region"""
        graph = Graph(nodes=[], edges=[])

        with get_cursor() as cursor:
            # Load nodes
            cursor.execute(
                "SELECT * FROM nodes WHERE region_id = %s ORDER BY created_at",
                (region_id,)
            )
            for row in cursor.fetchall():
                node = self._row_to_node(row)
                graph.nodes.append(node)

            # Load edges
            cursor.execute(
                "SELECT * FROM edges WHERE region_id = %s",
                (region_id,)
            )
            for row in cursor.fetchall():
                edge = Edge(
                    id=str(row['id']),
                    source=str(row['source']),
                    target=str(row['target'])
                )
                graph.edges.append(edge)

        return graph

    def _row_to_region(self, row: dict) -> KnowledgeRegion:
        """Convert database row to KnowledgeRegion"""
        tags = json.loads(row['tags']) if row['tags'] else []
        return KnowledgeRegion(
            id=str(row['id']),
            name=row['name'],
            description=row['description'] or '',
            color=row['color'] or '#d4a574',
            tags=tags,
            graph=Graph(nodes=[], edges=[]),
            created_at=row['created_at'].isoformat() if row['created_at'] else datetime.utcnow().isoformat(),
            last_active_at=row['last_active_at'].isoformat() if row['last_active_at'] else datetime.utcnow().isoformat(),
        )

    def _row_to_node(self, row: dict) -> Node:
        """Convert database row to Node"""
        messages = self._load_messages(str(row['id'])) if row['id'] else []
        return Node(
            id=str(row['id']),
            title=row['title'],
            messages=messages,
            parent_id=str(row['parent_id']) if row['parent_id'] else None,
            created_at=row['created_at'].isoformat() if row['created_at'] else datetime.utcnow().isoformat(),
            last_active_at=row['last_active_at'].isoformat() if row['last_active_at'] else datetime.utcnow().isoformat(),
        )

    def _load_messages(self, node_id: str) -> list[Message]:
        """Load messages for a node"""
        messages = []
        with get_cursor() as cursor:
            cursor.execute(
                "SELECT * FROM messages WHERE node_id = %s ORDER BY created_at",
                (node_id,)
            )
            for row in cursor.fetchall():
                messages.append(Message(
                    role=row['role'],
                    content=row['content'],
                    created_at=row['created_at'].isoformat() if row['created_at'] else datetime.utcnow().isoformat(),
                ))
        return messages

    def _save_region_to_db(self, region: KnowledgeRegion):
        """Save a region to database (used for new regions)"""
        with get_cursor() as cursor:
            tags_json = json.dumps(region.tags)
            cursor.execute(
                """INSERT INTO regions (id, name, description, color, tags)
                   VALUES (%s, %s, %s, %s, %s)""",
                (region.id, region.name, region.description, region.color, tags_json)
            )

    def _save_node_to_db(self, node: Node, region_id: str):
        """Save a node to database"""
        with get_cursor() as cursor:
            cursor.execute(
                """INSERT INTO nodes (id, region_id, parent_id, title)
                   VALUES (%s, %s, %s, %s)""",
                (node.id, region_id, node.parent_id, node.title)
            )

    def _save_edge_to_db(self, edge: Edge, region_id: str):
        """Save an edge to database"""
        with get_cursor() as cursor:
            cursor.execute(
                """INSERT INTO edges (id, source, target, region_id)
                   VALUES (%s, %s, %s, %s)""",
                (edge.id, edge.source, edge.target, region_id)
            )

    # Region operations
    def create_region(self, name: str, description: str = "", color: str = "#d4a574", tags: list[str] = None) -> KnowledgeRegion:
        region_id = str(uuid.uuid4())
        region = KnowledgeRegion(
            id=region_id,
            name=name,
            description=description,
            color=color,
            tags=tags or [],
            graph=Graph(nodes=[], edges=[]),
        )

        # Save to database
        self._save_region_to_db(region)

        # Add to in-memory store BEFORE creating node (create_node needs self.regions[region_id])
        self.regions[region_id] = region

        # Create first node automatically (create_node handles adding to graph.nodes)
        self.create_node(region_id, f"第一个会话（{region.name}）")

        # Now the region's graph has the node (via create_node)

        if self.active_region_id is None:
            self.active_region_id = region_id

        return region

    def get_region(self, region_id: str) -> Optional[KnowledgeRegion]:
        self._ensure_loaded()
        return self.regions.get(region_id)

    def get_all_regions(self) -> list[KnowledgeRegion]:
        self._ensure_loaded()
        return list(self.regions.values())

    def set_active_region(self, region_id: str) -> bool:
        if region_id in self.regions:
            self.active_region_id = region_id
            return True
        return False

    def delete_region(self, region_id: str) -> bool:
        if region_id not in self.regions:
            return False

        with get_cursor() as cursor:
            cursor.execute("DELETE FROM regions WHERE id = %s", (region_id,))

        del self.regions[region_id]
        if self.active_region_id == region_id:
            self.active_region_id = next(iter(self.regions.keys()), None) if self.regions else None
        return True

    def update_region_name(self, region_id: str, name: str) -> bool:
        if region_id not in self.regions:
            return False
        with get_cursor() as cursor:
            cursor.execute("UPDATE regions SET name = %s WHERE id = %s", (name, region_id))
        self.regions[region_id].name = name
        return True

    # Node operations (Node = Session)
    def create_node(self, region_id: str, title: str = None, parent_id: str = None) -> Optional[Node]:
        if region_id not in self.regions:
            # Region might not be loaded yet, try to load
            self._ensure_loaded()
            if region_id not in self.regions:
                return None

        node_id = str(uuid.uuid4())
        node_title = title or f"会话 {len(self.regions[region_id].graph.nodes) + 1}"

        node = Node(
            id=node_id,
            title=node_title,
            messages=[],
            parent_id=parent_id,
        )

        # Save to database
        self._save_node_to_db(node, region_id)

        # If parent specified, create edge
        if parent_id:
            edge = Edge(id=str(uuid.uuid4()), source=parent_id, target=node_id)
            self._save_edge_to_db(edge, region_id)
            self.regions[region_id].graph.edges.append(edge)

        self.regions[region_id].graph.nodes.append(node)
        return node

    def get_node(self, region_id: str, node_id: str) -> Optional[Node]:
        if region_id not in self.regions:
            self._ensure_loaded()
            if region_id not in self.regions:
                return None
        for node in self.regions[region_id].graph.nodes:
            if node.id == node_id:
                return node
        return None

    def delete_node(self, region_id: str, node_id: str) -> bool:
        if region_id not in self.regions:
            return False

        graph = self.regions[region_id].graph

        # Find all descendant node IDs using BFS (cascade delete)
        to_delete = {node_id}
        queue = deque([node_id])
        while queue:
            current = queue.popleft()
            # Find all children of current node
            for edge in graph.edges:
                if edge.source == current and edge.target not in to_delete:
                    to_delete.add(edge.target)
                    queue.append(edge.target)

        # Delete from database - need to delete in correct order (children before parents)
        # Due to FK constraints, delete edges first, then nodes
        with get_cursor() as cursor:
            # Delete edges involving any node in to_delete
            placeholders = ','.join(['%s'] * len(to_delete))
            cursor.execute(
                f"DELETE FROM edges WHERE source IN ({placeholders}) OR target IN ({placeholders})",
                (*to_delete, *to_delete)
            )
            # Delete nodes
            cursor.execute(
                f"DELETE FROM nodes WHERE id IN ({placeholders})",
                tuple(to_delete)
            )

        # Update in-memory graph
        self.regions[region_id].graph.nodes = [
            n for n in self.regions[region_id].graph.nodes if n.id not in to_delete
        ]
        self.regions[region_id].graph.edges = [
            e for e in self.regions[region_id].graph.edges
            if e.source not in to_delete and e.target not in to_delete
        ]
        return True

    def update_node_title(self, region_id: str, node_id: str, title: str) -> bool:
        if region_id not in self.regions:
            return False
        with get_cursor() as cursor:
            cursor.execute("UPDATE nodes SET title = %s WHERE id = %s", (title, node_id))
        for node in self.regions[region_id].graph.nodes:
            if node.id == node_id:
                node.title = title
                return True
        return False

    def update_node_activity(self, region_id: str, node_id: str):
        if region_id not in self.regions:
            return
        with get_cursor() as cursor:
            cursor.execute(
                "UPDATE nodes SET last_active_at = NOW() WHERE id = %s",
                (node_id,)
            )
        for node in self.regions[region_id].graph.nodes:
            if node.id == node_id:
                node.last_active_at = datetime.utcnow().isoformat()
                break

    # Message operations
    def add_message_to_node(self, region_id: str, node_id: str, role: str, content: str) -> Optional[Message]:
        node = self.get_node(region_id, node_id)
        if not node:
            return None

        msg_id = str(uuid.uuid4())

        with get_cursor() as cursor:
            cursor.execute(
                """INSERT INTO messages (id, node_id, role, content)
                   VALUES (%s, %s, %s, %s)""",
                (msg_id, node_id, role, content)
            )

        msg = Message(role=role, content=content)
        node.messages.append(msg)
        self.update_node_activity(region_id, node_id)
        return msg

    def get_graph(self, region_id: str) -> Optional[Graph]:
        if region_id not in self.regions:
            self._ensure_loaded()
            if region_id not in self.regions:
                return None
        return self.regions[region_id].graph

    # Knowledge Point operations
    def create_knowledge_point(self, content: str, session_id: str = None, summary: str = None, source_session_id: str = None) -> Optional[KnowledgePoint]:
        """Create a new knowledge point and optionally link it to a session."""
        kp_id = str(uuid.uuid4())
        now = datetime.utcnow()

        with get_cursor() as cursor:
            cursor.execute(
                """INSERT INTO knowledge_points (id, content, summary, source_session_id, created_at, updated_at)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (kp_id, content, summary, source_session_id, now, now)
            )

        kp = KnowledgePoint(
            id=kp_id,
            content=content,
            summary=summary,
            source_session_id=source_session_id,
            created_at=now,
            updated_at=now,
        )

        # If session_id provided, link the knowledge point to the session
        if session_id:
            self.link_knowledge_point_to_session(kp_id, session_id)

        return kp

    def get_knowledge_point(self, kp_id: str) -> Optional[KnowledgePoint]:
        """Get a knowledge point by ID."""
        kp_id = str(kp_id)  # Ensure string for MySQL
        with get_cursor() as cursor:
            cursor.execute("SELECT * FROM knowledge_points WHERE id = %s", (kp_id,))
            row = cursor.fetchone()
            if not row:
                return None
            return KnowledgePoint(
                id=str(row['id']),
                content=row['content'],
                summary=row['summary'],
                source_session_id=str(row['source_session_id']) if row['source_session_id'] else None,
                created_at=row['created_at'],
                updated_at=row['updated_at'],
            )

    def get_knowledge_points_for_session(self, session_id: str) -> list[KnowledgePoint]:
        """Get all knowledge points linked to a session."""
        session_id = str(session_id)  # Ensure string for MySQL
        with get_cursor() as cursor:
            cursor.execute(
                """SELECT kp.* FROM knowledge_points kp
                   JOIN knowledge_point_sessions kps ON kp.id = kps.knowledge_point_id
                   WHERE kps.session_id = %s
                   ORDER BY kps.created_at""",
                (session_id,)
            )
            results = []
            for row in cursor.fetchall():
                results.append(KnowledgePoint(
                    id=str(row['id']),
                    content=row['content'],
                    summary=row['summary'],
                    source_session_id=str(row['source_session_id']) if row['source_session_id'] else None,
                    created_at=row['created_at'],
                    updated_at=row['updated_at'],
                ))
            return results

    def link_knowledge_point_to_session(self, kp_id: str, session_id: str) -> Optional[KnowledgePointSession]:
        """Link a knowledge point to a session."""
        kp_id = str(kp_id)  # Ensure string for MySQL
        session_id = str(session_id)  # Ensure string for MySQL
        kps_id = str(uuid.uuid4())
        now = datetime.utcnow()

        with get_cursor() as cursor:
            cursor.execute(
                """INSERT INTO knowledge_point_sessions (id, knowledge_point_id, session_id, created_at)
                   VALUES (%s, %s, %s, %s)""",
                (kps_id, kp_id, session_id, now)
            )

        return KnowledgePointSession(
            id=kps_id,
            knowledge_point_id=kp_id,
            session_id=session_id,
            created_at=now,
        )

    def delete_knowledge_point(self, kp_id: str) -> bool:
        """Delete a knowledge point and its session links."""
        kp_id = str(kp_id)  # Ensure string for MySQL
        with get_cursor() as cursor:
            # Delete the knowledge point (session links will cascade due to FK constraint)
            cursor.execute("DELETE FROM knowledge_points WHERE id = %s", (kp_id,))
            return cursor.rowcount > 0

    def get_knowledge_points_for_region(self, region_id: str) -> list[dict]:
        """
        Get all knowledge points for a region (from all sessions/nodes in that region).
        Returns list of dicts with 'id' and 'content' keys.
        """
        with get_cursor() as cursor:
            # Get all node IDs for this region
            cursor.execute(
                "SELECT id FROM nodes WHERE region_id = %s",
                (region_id,)
            )
            node_rows = cursor.fetchall()
            node_ids = [str(row['id']) for row in node_rows]

            if not node_ids:
                return []

            # Get knowledge_point_ids linked to those nodes via knowledge_point_sessions
            placeholders = ','.join(['%s'] * len(node_ids))
            cursor.execute(
                f"""SELECT DISTINCT kp.id, kp.content, kp.summary, kp.source_session_id,
                           kp.created_at, kp.updated_at
                    FROM knowledge_points kp
                    JOIN knowledge_point_sessions kps ON kp.id = kps.knowledge_point_id
                    WHERE kps.session_id IN ({placeholders})""",
                tuple(node_ids)
            )
            results = []
            for row in cursor.fetchall():
                results.append({
                    "id": str(row['id']),
                    "content": row['content'],
                    "summary": row['summary'],
                    "source_session_id": str(row['source_session_id']) if row['source_session_id'] else None,
                })
            return results


# Global store instance
store = ConversationStore()
