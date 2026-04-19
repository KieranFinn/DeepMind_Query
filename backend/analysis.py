"""Analysis context building for BigBang knowledge graph analysis."""

ANALYSIS_PROMPT = """你是一个知识管理顾问。请分析用户的知识图谱：

分析维度：
1. 知识结构：会话之间的关联是否合理
2. 学习模式：用户是深度钻研还是广泛探索
3. 认知盲区：未触及的相关领域
4. 建议：下一步探索方向

请用中文输出分析结果，条理清晰。"""


def build_analysis_context(graph_data: dict) -> str:
    """
    Build a simplified context string from graph data for LLM analysis.

    Args:
        graph_data: Dict with 'nodes' and 'edges' keys
            nodes: list of {"id": str, "title": str, "messages": list of (role, content)}
            edges: list of {"source": str, "target": str}

    Returns:
        A formatted context string
    """
    nodes = graph_data.get("nodes", [])
    edges = graph_data.get("edges", [])

    context_lines = [
        f"知识区：{graph_data.get('name', '未知')}",
        f"会话数：{len(nodes)}，关联数：{len(edges)}",
        "",
        "会话列表：",
    ]

    for node in nodes:
        title = node.get("title", "无标题")
        messages = node.get("messages", [])

        # Get preview from last 3 messages
        if messages:
            preview_parts = []
            for role, content in messages[-3:]:
                short_content = content[:100].replace('\n', ' ') if content else ''
                role_label = "用户" if role == "user" else "助手"
                preview_parts.append(f"{role_label}: {short_content}")
            preview = " | ".join(preview_parts)
        else:
            preview = "（无消息）"

        context_lines.append(f"- {title}: {preview}")

    return "\n".join(context_lines)