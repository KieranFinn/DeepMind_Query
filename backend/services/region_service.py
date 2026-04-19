"""Region Service - Business logic for region operations"""
import uuid
from typing import Optional
from store import store
from models import KnowledgeRegion


class RegionService:
    """Business logic for region management"""

    @staticmethod
    def create_region(
        name: str,
        description: str = "",
        color: str = "#d4a574",
        tags: list[str] = None,
    ) -> KnowledgeRegion:
        """Create a new knowledge region"""
        return store.create_region(
            name=name,
            description=description,
            color=color,
            tags=tags,
        )

    @staticmethod
    def get_all_regions() -> list[KnowledgeRegion]:
        """Get all knowledge regions"""
        return store.get_all_regions()

    @staticmethod
    def get_region(region_id: str) -> Optional[KnowledgeRegion]:
        """Get a specific region by ID"""
        return store.get_region(region_id)

    @staticmethod
    def delete_region(region_id: str) -> bool:
        """Delete a region"""
        return store.delete_region(region_id)

    @staticmethod
    def update_region_name(region_id: str, name: str) -> bool:
        """Update region name"""
        if not name or not name.strip():
            return False
        if len(name.strip()) > 100:
            return False
        return store.update_region_name(region_id, name.strip())

    @staticmethod
    def set_active_region(region_id: str) -> bool:
        """Set the active region"""
        return store.set_active_region(region_id)

    @staticmethod
    def validate_region_exists(region_id: str) -> bool:
        """Check if region exists"""
        return store.get_region(region_id) is not None


# Global instance
region_service = RegionService()
