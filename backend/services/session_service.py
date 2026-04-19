"""Session Service - Business logic for node/session operations"""
from typing import Optional
from store import store
from models import Node, Graph


class SessionService:
    """Business logic for session (node) management"""

    @staticmethod
    def create_root_node(region_id: str, title: str = None) -> Node:
        """Create a root node (new conversation)"""
        return store.create_node(region_id, title, parent_id=None)

    @staticmethod
    def create_child_node(region_id: str, parent_id: str, title: str = None) -> Node:
        """Create a child node (branch conversation)"""
        parent = store.get_node(region_id, parent_id)
        if not parent:
            return None
        return store.create_node(region_id, title, parent_id=parent_id)

    @staticmethod
    def get_node(region_id: str, node_id: str) -> Optional[Node]:
        """Get a specific node"""
        return store.get_node(region_id, node_id)

    @staticmethod
    def get_graph(region_id: str) -> Optional[Graph]:
        """Get the graph for a region"""
        return store.get_graph(region_id)

    @staticmethod
    def delete_node(region_id: str, node_id: str) -> bool:
        """Delete a node (cascade deletes children)"""
        return store.delete_node(region_id, node_id)

    @staticmethod
    def update_node_title(region_id: str, node_id: str, title: str) -> bool:
        """Update a node's title"""
        return store.update_node_title(region_id, node_id, title)

    @staticmethod
    def add_message(
        region_id: str, node_id: str, role: str, content: str
    ):
        """Add a message to a node"""
        return store.add_message_to_node(region_id, node_id, role, content)

    @staticmethod
    def get_conversation_context(region_id: str, node_id: str) -> list[dict]:
        """Build conversation context for LLM"""
        node = store.get_node(region_id, node_id)
        if not node:
            return []
        messages = []
        for msg in node.messages:
            messages.append({"role": msg.role, "content": msg.content})
        return messages

    @staticmethod
    def validate_node_exists(region_id: str, node_id: str) -> bool:
        """Check if node exists"""
        return store.get_node(region_id, node_id) is not None


# Global instance
session_service = SessionService()
