"""SQLite database helper for DeepMind_Query."""

import sqlite3
import os
from contextlib import contextmanager
from typing import Optional

DATABASE_PATH = os.path.join(os.path.dirname(__file__), "deepmind_query.db")


def get_db_connection():
    """Create a connection to the SQLite database."""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def get_cursor(dictionary: bool = True):
    """Context manager for database cursor with automatic cleanup."""
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        # Enable foreign key support
        conn.execute("PRAGMA foreign_keys = ON")
        cursor = conn.cursor()
        yield cursor
        conn.commit()
    except Exception as e:
        if conn:
            conn.rollback()
        raise e
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


def execute_query(query: str, params: tuple = None, fetch: bool = True):
    """Execute a query and optionally fetch results."""
    with get_cursor() as cursor:
        cursor.execute(query, params or ())
        if fetch:
            return [dict(row) for row in cursor.fetchall()]
        return None


def execute_one(query: str, params: tuple = None):
    """Execute a query and fetch one result."""
    with get_cursor() as cursor:
        cursor.execute(query, params or ())
        row = cursor.fetchone()
        return dict(row) if row else None


def execute_write(query: str, params: tuple = None):
    """Execute an INSERT/UPDATE/DELETE query."""
    with get_cursor() as cursor:
        cursor.execute(query, params or ())
        return cursor.lastrowid


# Table creation SQL statements
REGIONS_TABLE = """
CREATE TABLE IF NOT EXISTS regions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT,
    tags TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_active_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
"""

NODES_TABLE = """
CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    region_id TEXT NOT NULL,
    parent_id TEXT,
    title TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_active_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE CASCADE
)
"""

EDGES_TABLE = """
CREATE TABLE IF NOT EXISTS edges (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    target TEXT NOT NULL,
    region_id TEXT NOT NULL,
    FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE CASCADE
)
"""

MESSAGES_TABLE = """
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
)
"""

KNOWLEDGE_POINTS_TABLE = """
CREATE TABLE IF NOT EXISTS knowledge_points (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    summary TEXT,
    source_session_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
"""

KNOWLEDGE_POINT_SESSIONS_TABLE = """
CREATE TABLE IF NOT EXISTS knowledge_point_sessions (
    id TEXT PRIMARY KEY,
    knowledge_point_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (knowledge_point_id) REFERENCES knowledge_points(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES nodes(id) ON DELETE CASCADE
)
"""


def init_all_tables():
    """Initialize all database tables if they don't exist."""
    with get_cursor() as cursor:
        cursor.execute(REGIONS_TABLE)
        cursor.execute(NODES_TABLE)
        cursor.execute(EDGES_TABLE)
        cursor.execute(MESSAGES_TABLE)
        cursor.execute(KNOWLEDGE_POINTS_TABLE)
        cursor.execute(KNOWLEDGE_POINT_SESSIONS_TABLE)


def init_knowledge_points_tables():
    """Initialize knowledge points tables if they don't exist."""
    with get_cursor() as cursor:
        cursor.execute(KNOWLEDGE_POINTS_TABLE)
        cursor.execute(KNOWLEDGE_POINT_SESSIONS_TABLE)
