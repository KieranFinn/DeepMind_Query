"""Dolt database connection helper for DeepMind_Query."""

import mysql.connector
from contextlib import contextmanager
from typing import Optional

DATABASE = "deepmind_query"
DEFAULT_PORT = 3307


def get_db_connection():
    """Create a connection to the Dolt database."""
    return mysql.connector.connect(
        host="127.0.0.1",
        port=DEFAULT_PORT,
        user="root",
        database=DATABASE
    )


@contextmanager
def get_cursor(dictionary: bool = True):
    """Context manager for database cursor with automatic cleanup."""
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=dictionary)
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
            return cursor.fetchall()
        return None


def execute_one(query: str, params: tuple = None):
    """Execute a query and fetch one result."""
    with get_cursor() as cursor:
        cursor.execute(query, params or ())
        return cursor.fetchone()


def execute_write(query: str, params: tuple = None):
    """Execute an INSERT/UPDATE/DELETE query."""
    with get_cursor() as cursor:
        cursor.execute(query, params or ())
        return cursor.lastrowid


# Knowledge Points table creation
KNOWLEDGE_POINTS_TABLE = """
CREATE TABLE IF NOT EXISTS knowledge_points (
    id VARCHAR(36) PRIMARY KEY,
    content TEXT NOT NULL,
    summary VARCHAR(500),
    source_session_id VARCHAR(36),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)
"""

KNOWLEDGE_POINT_SESSIONS_TABLE = """
CREATE TABLE IF NOT EXISTS knowledge_point_sessions (
    id VARCHAR(36) PRIMARY KEY,
    knowledge_point_id VARCHAR(36) NOT NULL,
    session_id VARCHAR(36) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (knowledge_point_id) REFERENCES knowledge_points(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES nodes(id) ON DELETE CASCADE
)
"""


def init_knowledge_points_tables():
    """Initialize knowledge points tables if they don't exist."""
    with get_cursor() as cursor:
        cursor.execute(KNOWLEDGE_POINTS_TABLE)
        cursor.execute(KNOWLEDGE_POINT_SESSIONS_TABLE)
