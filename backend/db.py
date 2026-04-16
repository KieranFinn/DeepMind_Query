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
