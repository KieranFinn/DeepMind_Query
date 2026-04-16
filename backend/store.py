import asyncio
from typing import Optional
from uuid import UUID
from models import ConversationNode, Message

MAX_TREE_DEPTH = 100  # Prevent infinite recursion


class ConversationStore:
    """In-memory store for conversation tree (v1)"""

    def __init__(self):
        self.nodes: dict[UUID, ConversationNode] = {}
        self.root_id: Optional[UUID] = None
        # Separate index for child UUIDs (to avoid circular reference in stored nodes)
        self.child_index: dict[UUID, list[UUID]] = {}
        self._lock = asyncio.Lock()

    async def lock(self):
        """Async lock for thread-safe access"""
        return self._lock

    def create_root(self, title: str = "新对话") -> ConversationNode:
        node = ConversationNode(title=title)
        self.nodes[node.id] = node
        self.child_index[node.id] = []
        self.root_id = node.id
        return node

    def get_node(self, node_id: UUID) -> Optional[ConversationNode]:
        return self.nodes.get(node_id)

    def node_exists(self, node_id: UUID) -> bool:
        return node_id in self.nodes

    def add_message(self, node_id: UUID, role: str, content: str) -> Message:
        msg = Message(role=role, content=content)
        node = self.nodes[node_id]
        node.messages.append(msg)
        return msg

    def create_branch(self, parent_id: UUID, title: str = None) -> ConversationNode:
        parent = self.nodes[parent_id]
        child_count = len(self.child_index[parent_id])
        node_title = title or f"分支 {child_count + 1}"
        node = ConversationNode(parent_id=parent_id, title=node_title)
        self.nodes[node.id] = node
        self.child_index[node.id] = []
        self.child_index[parent_id].append(node.id)
        return node

    def get_tree(self) -> Optional[ConversationNode]:
        if self.root_id is None:
            return None
        return self._build_tree(self.root_id, depth=0)

    def _build_tree(self, node_id: UUID, depth: int) -> Optional[ConversationNode]:
        if depth > MAX_TREE_DEPTH:
            raise RecursionError(f"Tree exceeded max depth {MAX_TREE_DEPTH}")
        node = self.nodes.get(node_id)
        if node is None:
            return None
        child_nodes = [
            self._build_tree(cid, depth + 1)
            for cid in self.child_index.get(node_id, [])
        ]
        return ConversationNode(
            id=node.id,
            parent_id=node.parent_id,
            title=node.title,
            messages=node.messages,
            children=[c for c in child_nodes if c is not None],
            created_at=node.created_at
        )

    def get_node_with_subtree(self, node_id: UUID) -> Optional[ConversationNode]:
        """Get a node and all its descendants as a tree"""
        if node_id not in self.nodes:
            return None
        return self._build_tree(node_id, depth=0)


# Global store instance
store = ConversationStore()
