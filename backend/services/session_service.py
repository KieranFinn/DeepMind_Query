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
    def get_conversation_context(
        region_id: str, node_id: str, include_parent_summary: bool = True, max_parent_depth: int = 3
    ) -> list[dict]:
        """
        Build conversation context for LLM.
        If include_parent_summary is True, recursively trace parent_id upward
        and inject summarized ancestor context as system messages.
        LangGraph's MessagesState shares full state; we simplify to "summary inheritance".
        """
        node = store.get_node(region_id, node_id)
        if not node:
            return []

        # Current node's own messages (filter out error responses)
        node_msgs = []
        for msg in node.messages:
            # Skip error messages that were accidentally saved
            if msg.role == 'assistant' and msg.content.startswith('[Error'):
                continue
            node_msgs.append({"role": msg.role, "content": msg.content})

        # Check if node already has a system message (e.g., seeded follow-up context)
        has_system = node_msgs and node_msgs[0]["role"] == "system"
        system_parts = []

        # Trace upward through parent chain
        if include_parent_summary and node.parent_id:
            current = node
            depth = 0
            ancestor_summaries = []

            while current.parent_id and depth < max_parent_depth:
                parent = store.get_node(region_id, str(current.parent_id))
                if not parent:
                    break

                parent_msgs = store._load_messages(str(parent.id))
                user_msg = next((m for m in parent_msgs if m.role == 'user'), None)
                assistant_msg = next((m for m in parent_msgs if m.role == 'assistant'), None)

                if user_msg and assistant_msg:
                    summary = (
                        f"【追问链条 | 父对话摘要】\n"
                        f"问：{user_msg.content[:80]}{'...' if len(user_msg.content) > 80 else ''}\n"
                        f"核心回答：{assistant_msg.content[:150]}{'...' if len(assistant_msg.content) > 150 else ''}"
                    )
                    ancestor_summaries.insert(0, summary)

                current = parent
                depth += 1

            if ancestor_summaries:
                system_parts.append("\n\n".join(ancestor_summaries))

        # Build final messages: merge all system content into one message
        if has_system:
            existing_system = node_msgs[0]["content"]
            if system_parts:
                combined = "\n\n".join([existing_system] + system_parts)
            else:
                combined = existing_system
            return [{"role": "system", "content": combined}] + node_msgs[1:]
        elif system_parts:
            combined = "\n\n".join(system_parts)
            return [{"role": "system", "content": combined}] + node_msgs
        else:
            return node_msgs

    @staticmethod
    def seed_follow_up_context(region_id: str, child_node_id: str, parent_node_id: str, direction: str) -> None:
        """
        Seed a child node with follow-up context:
        1. Role definition from direction (CrewAI role-based agent simplified)
        2. Parent conversation summary (LangGraph state inheritance simplified)
        """
        parent = store.get_node(region_id, parent_node_id)
        if not parent:
            return

        seed_parts = []

        # 1. Role definition: turn follow-up direction into system prompt
        if direction:
            seed_parts.append(
                f"【追问方向】你正在深入探讨「{direction}」。"
                f"请基于父对话的上下文，围绕这个具体方向回答，不要发散。"
            )

        # 2. Parent conversation summary
        parent_msgs = store._load_messages(str(parent.id))
        user_msg = next((m for m in parent_msgs if m.role == 'user'), None)
        assistant_msg = next((m for m in parent_msgs if m.role == 'assistant'), None)
        if user_msg and assistant_msg:
            seed_parts.append(
                f"【父对话上下文】\n"
                f"用户原问题：{user_msg.content[:100]}{'...' if len(user_msg.content) > 100 else ''}\n"
                f"核心回答：{assistant_msg.content[:200]}{'...' if len(assistant_msg.content) > 200 else ''}"
            )

        if seed_parts:
            seed = "\n\n".join(seed_parts)
            store.add_message_to_node(region_id, child_node_id, "system", seed)


# Global instance
session_service = SessionService()
