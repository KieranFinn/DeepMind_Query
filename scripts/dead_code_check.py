#!/usr/bin/env python3
"""
Dead Code Checker - Detects Python files that are not imported by any other file.

This script analyzes the codebase to find .py files that appear to be unused
(i.e., not imported by any other Python file in the project).
"""

import ast
import os
import sys
from pathlib import Path
from typing import Set, List, Tuple


def get_all_python_files(root_dir: str) -> List[Path]:
    """Find all Python files in the project, excluding test files."""
    root = Path(root_dir)
    py_files = []
    for path in root.rglob("*.py"):
        # Skip test files and __pycache__
        if "__pycache__" in str(path):
            continue
        if path.name.startswith("test_") or path.name.endswith("_test.py"):
            continue
        # Skip this script itself
        if path.name == "dead_code_check.py":
            continue
        py_files.append(path)
    return py_files


def extract_imports(file_path: Path) -> Set[str]:
    """Extract all imported module names from a Python file."""
    imports = set()
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        tree = ast.parse(content, filename=str(file_path))
    except (SyntaxError, UnicodeDecodeError):
        return imports

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                # Get the top-level module name
                name = alias.name.split(".")[0]
                imports.add(name)
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                name = node.module.split(".")[0]
                imports.add(name)

    return imports


def get_module_name(file_path: Path, root_dir: str) -> str:
    """Convert a file path to a Python module name."""
    rel_path = file_path.relative_to(root_dir)
    parts = list(rel_path.parts)
    # Remove .py extension
    if parts[-1].endswith(".py"):
        parts[-1] = parts[-1][:-3]
    # Handle __init__.py
    if parts[-1] == "__init__":
        parts = parts[:-1]
    return ".".join(parts)


def find_dead_code(root_dir: str) -> Tuple[List[Path], List[Tuple[Path, Set[str]]]]:
    """
    Find Python files that are not imported by any other file.

    Returns:
        Tuple of (dead_code_files, import_map)
    """
    py_files = get_all_python_files(root_dir)
    file_to_module = {f: get_module_name(f, root_dir) for f in py_files}
    module_to_file = {m: f for f, m in file_to_module.items()}

    # Collect all imports from all files
    all_imports = {}
    for py_file in py_files:
        imports = extract_imports(py_file)
        all_imports[py_file] = imports

    # Check each file to see if it's imported by any other file
    dead_code = []
    import_map = []

    for py_file in py_files:
        module_name = file_to_module[py_file]
        is_imported = False

        for other_file, imports in all_imports.items():
            if other_file == py_file:
                continue
            if module_name in imports:
                is_imported = True
                break

        import_map.append((py_file, all_imports[py_file]))

        if not is_imported:
            dead_code.append(py_file)

    return dead_code, import_map


def main():
    # Determine project root (parent of scripts directory)
    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent

    print(f"Scanning for dead code in: {project_root}")
    print("-" * 60)

    dead_code, import_map = find_dead_code(str(project_root))

    if dead_code:
        print(f"Found {len(dead_code)} potentially unused Python file(s):\n")
        for f in dead_code:
            print(f"  - {f.relative_to(project_root)}")
        print("\nNOTE: Review carefully before deleting. Some files may be:")
        print("  - Entry points (main.py, __init__.py)")
        print("  - Imported dynamically or via反射")
        print("  - Used as scripts or celery tasks")
        print("  - Intended for future use")
        sys.exit(1)
    else:
        print("No dead code detected. All Python files appear to be imported.")
        sys.exit(0)


if __name__ == "__main__":
    main()
