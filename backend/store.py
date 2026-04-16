import asyncio
from typing import Optional
from uuid import UUID
from models import KnowledgeRegion, Session, ConversationNode, Message

MAX_TREE_DEPTH = 100


class ConversationStore:
    """Multi-region conversation store for knowledge management"""

    def __init__(self):
        self.regions: dict[UUID, KnowledgeRegion] = {}
        self.active_region_id: Optional[UUID] = None
        self._lock = asyncio.Lock()

    async def lock(self):
        return self._lock

    # Region operations
    def create_region(self, name: str, description: str = "", color: str = "#d4a574", tags: list[str] = None) -> KnowledgeRegion:
        region = KnowledgeRegion(
            name=name,
            description=description,
            color=color,
            tags=tags or []
        )
        self.regions[region.id] = region
        if self.active_region_id is None:
            self.active_region_id = region.id
        return region

    def get_region(self, region_id: UUID) -> Optional[KnowledgeRegion]:
        return self.regions.get(region_id)

    def get_all_regions(self) -> list[KnowledgeRegion]:
        return list(self.regions.values())

    def set_active_region(self, region_id: UUID) -> bool:
        if region_id in self.regions:
            self.active_region_id = region_id
            return True
        return False

    def delete_region(self, region_id: UUID) -> bool:
        if region_id not in self.regions:
            return False
        del self.regions[region_id]
        if self.active_region_id == region_id:
            self.active_region_id = next(iter(self.regions.keys()), None)
        return True

    # Session operations
    def create_session(self, region_id: UUID, title: str = None) -> Optional[Session]:
        region = self.regions.get(region_id)
        if not region:
            return None

        session = Session(title=title or f"会话 {len(region.sessions) + 1}")
        region.sessions.append(session)
        region.last_active_at = datetime.utcnow()
        return session

    def get_session(self, region_id: UUID, session_id: UUID) -> Optional[Session]:
        region = self.regions.get(region_id)
        if not region:
            return None
        for session in region.sessions:
            if session.id == session_id:
                return session
        return None

    def get_active_session(self) -> tuple[Optional[KnowledgeRegion], Optional[Session]]:
        if not self.active_region_id:
            return None, None
        region = self.regions.get(self.active_region_id)
        if not region or not region.sessions:
            return region, None
        # Return the most recently active session
        active_session = max(region.sessions, key=lambda s: s.last_active_at)
        return region, active_session

    def update_session_activity(self, region_id: UUID, session_id: UUID):
        region = self.regions.get(region_id)
        if not region:
            return
        for session in region.sessions:
            if session.id == session_id:
                session.last_active_at = datetime.utcnow()
                region.last_active_at = datetime.utcnow()
                break

    # Conversation tree operations (on Session.root_node)
    def add_message_to_session(self, region_id: UUID, session_id: UUID, role: str, content: str) -> Optional[Message]:
        session = self.get_session(region_id, session_id)
        if not session:
            return None
        msg = Message(role=role, content=content)
        session.root_node.messages.append(msg)
        self.update_session_activity(region_id, session_id)
        return msg

    def create_branch_in_session(self, region_id: UUID, session_id: UUID, parent_node_id: UUID, title: str = None) -> Optional[ConversationNode]:
        session = self.get_session(region_id, session_id)
        if not session:
            return None

        def find_and_branch(node: ConversationNode, target_id: UUID) -> Optional[ConversationNode]:
            if node.id == target_id:
                child_title = title or f"分支 {len(node.children) + 1}"
                child = ConversationNode(parent_id=node.id, title=child_title)
                node.children.append(child)
                return child
            for child in node.children:
                result = find_and_branch(child, target_id)
                if result:
                    return result
            return None

        # Count total branches at this level for title
        def count_children(node: ConversationNode, parent_id: UUID) -> int:
            count = 0
            if node.parent_id == parent_id:
                count = 1
            for child in node.children:
                count += count_children(child, parent_id)
            return count

        if parent_node_id == session.root_node.id:
            child_title = title or f"分支 {len(session.root_node.children) + 1}"
            child = ConversationNode(parent_id=session.root_node.id, title=child_title)
            session.root_node.children.append(child)
            self.update_session_activity(region_id, session_id)
            return child

        result = find_and_branch(session.root_node, parent_node_id)
        if result:
            self.update_session_activity(region_id, session_id)
        return result

    def get_session_tree(self, region_id: UUID, session_id: UUID) -> Optional[ConversationNode]:
        session = self.get_session(region_id, session_id)
        if not session:
            return None
        return session.root_node


# Global store instance
store = ConversationStore()
