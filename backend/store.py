from typing import Optional
from uuid import UUID
from models import ConversationNode, Message


class ConversationStore:
    """In-memory store for conversation tree (v1)"""

    def __init__(self):
        self.nodes: dict[UUID, ConversationNode] = {}
        self.root_id: Optional[UUID] = None
        # Separate index for child UUIDs (to avoid circular reference in stored nodes)
        self.child_index: dict[UUID, list[UUID]] = {}

    def create_root(self, title: str = "新对话") -> ConversationNode:
        node = ConversationNode(title=title)
        self.nodes[node.id] = node
        self.child_index[node.id] = []
        self.root_id = node.id
        return node

    def get_node(self, node_id: UUID) -> Optional[ConversationNode]:
        return self.nodes.get(node_id)

    def add_message(self, node_id: UUID, role: str, content: str) -> Message:
        msg = Message(role=role, content=content)
        node = self.nodes[node_id]
        node.messages.append(msg)
        return msg

    def create_branch(self, parent_id: UUID, title: str = None) -> ConversationNode:
        parent = self.nodes[parent_id]
        node_title = title or f"分支 {len(self.child_index[parent_id]) + 1}"
        node = ConversationNode(parent_id=parent_id, title=node_title)
        self.nodes[node.id] = node
        self.child_index[node.id] = []
        self.child_index[parent_id].append(node.id)
        return node

    def get_tree(self) -> Optional[ConversationNode]:
        if self.root_id is None:
            return None
        return self._build_tree(self.root_id)

    def _build_tree(self, node_id: UUID) -> ConversationNode:
        node = self.nodes[node_id]
        child_nodes = [self._build_tree(cid) for cid in self.child_index.get(node_id, [])]
        return ConversationNode(
            id=node.id,
            parent_id=node.parent_id,
            title=node.title,
            messages=node.messages,
            children=child_nodes,
            created_at=node.created_at
        )

    def get_node_with_subtree(self, node_id: UUID) -> Optional[ConversationNode]:
        """Get a node and all its descendants as a tree"""
        if node_id not in self.nodes:
            return None
        return self._build_tree(node_id)


# Global store instance
store = ConversationStore()
