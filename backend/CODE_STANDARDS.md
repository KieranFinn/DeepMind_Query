# Code Standards

## LLM Caching Rules

The following rules apply to all LLM caching implementations:

### 1. Cache Key Hashing
Cache keys MUST use SHA256 hash for security and consistency.

```python
content = json.dumps({"model": model, "messages": messages}, sort_keys=True)
cache_key = hashlib.sha256(content.encode()).hexdigest()
```

### 2. No Message Content in Logs
User message content MUST NOT be written to logs. Only log model identifiers and error messages.

**Allowed:**
```python
logger.info(f"LLM cache hit for {model}")
logger.warning(f"LLM cache lookup failed: {e}")
```

**Forbidden:**
```python
logger.info(f"Cache miss for messages: {messages}")  # WRONG
logger.debug(f"User message: {content}")  # WRONG
```

### 3. Cache Granularity
Cache MUST be scoped by `session_id + message_hash` to prevent cross-session data leakage.

**Required cache key structure:**
```python
cache_key = hashlib.sha256(f"{session_id}:{model}:{messages_hash}".encode()).hexdigest()
```

**Database schema must include session_id:**
```sql
CREATE TABLE llm_cache (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,  -- Required for session isolation
    model TEXT NOT NULL,
    messages_hash TEXT NOT NULL,
    response TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_llm_cache_lookup ON llm_cache(session_id, model, messages_hash);
```
