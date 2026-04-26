# DeepMind_Query 安全基准 (Security Baseline)

本文档是代码审查的强制安全检查清单。所有 DeepMind_Query 代码必须满足以下要求。

---

## 1. 密钥比对 (Secret Comparison)

**规则**: 禁止使用 `==`、`!=` 等运算符直接比对密钥、token、API key 等敏感字符串。

**必须使用**:
```python
import secrets

if secrets.compare_digest(provided_key, expected_key):
    # 认证成功
```

**禁止使用**:
```python
# 错误！可能受到时序攻击
if provided_key == API_KEY:
    ...

# 错误！同样不安全
if provided_key != API_KEY:
    ...
```

**原因**: 直接字符串比较存在时序攻击（timing attack）风险。`secrets.compare_digest()` 使用常数时间比较算法，可防止侧信道攻击。

---

## 2. 密钥管理 (Secret Management)

**规则**: API key 只能通过环境变量传递，禁止通过函数参数层层传递。

**正确做法**:
```python
# 从环境变量读取 key
api_key = os.getenv("MINIMAX_API_KEY", "")
if not api_key:
    yield "[Error] No API key configured. Set MINIMAX_API_KEY in .env"
    return
```

**禁止做法**:
```python
# 错误！通过函数参数传递 API key
async def chat(model: str, messages: list[dict], api_key: Optional[str] = None):
    key = api_key or os.getenv("MINIMAX_API_KEY", "")
    ...
```

**原因**: 通过参数传递的 key 会在调用栈中留存，增加泄露风险；环境变量只在进程启动时加载，更安全。

---

## 3. CORS 配置 (CORS Configuration)

**规则**: CORS origins 必须来自环境变量，禁止硬编码。

**必须使用**:
```python
# 从环境变量读取允许的 origins
allowed_origins = os.getenv("CORS_ORIGINS", "").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    ...
)
```

**禁止使用**:
```python
# 错误！硬编码 origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    ...
)
```

**原因**: 硬编码 origins 无法适应不同部署环境（开发、预生产、生产），且在代码审查中容易被忽视。

**推荐**: 使用 `.env` 文件管理：
```
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,https://app.example.com
```

---

## 4. 限流 (Rate Limiting)

**规则**: 必须使用 Redis 等分布式限流方案作为主要手段，进程内限流仅作辅助/开发用途。

**推荐架构**:
```
生产环境: Redis (分布式) → 精确、跨进程、支持集群
开发环境: 进程内限流 → 可用，但不作为主力
```

**Redis 限流示例**:
```python
import redis

redis_client = redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379"))

def check_rate_limit_redis(client_ip: str) -> bool:
    key = f"rate_limit:{client_ip}"
    count = redis_client.get(key)
    if count and int(count) >= MAX_REQUESTS:
        return False
    pipe = redis_client.pipeline()
    pipe.incr(key)
    pipe.expire(key, RATE_LIMIT_WINDOW)
    pipe.execute()
    return True
```

**禁止做法**:
```python
# 错误！进程内限流无法在多实例部署下工作
rate_limit_data = defaultdict(lambda: {"tokens": RATE_LIMIT_TOKENS, "last_refill": time()})
```

**原因**: 进程内限流只对单个进程有效，部署多个实例时各自独立计数，无法实现真正的限流。

---

## 代码审查清单 (Review Checklist)

在 review PR 时，逐项确认：

- [ ] **密钥比对**: 是否使用 `secrets.compare_digest()`？搜索 `==.*key`、`!=.*key`、`if.*key.*==`
- [ ] **密钥管理**: API key 是否通过 `os.getenv()` 获取？搜索 `def.*api_key.*=` 模式
- [ ] **CORS**: `allow_origins` 是否为硬编码？确认使用了环境变量 `CORS_ORIGINS`
- [ ] **限流**: 生产环境是否使用 Redis？进程内 `defaultdict` 限流仅用于开发
- [ ] **无 secrets 硬编码**: 搜索 `password=`、`secret=`、`key=` 的硬编码模式
- [ ] **错误日志**: 敏感信息（密钥、token）不允许写入日志

---

## 相关文件

- `main.py` - FastAPI 入口，包含 CORS、认证、限流中间件
- `services/llm_service.py` - LLM 服务，注意 API key 的读取方式
- `.env.example` - 环境变量示例

---

*创建于 2026-04-26 | 更新于 2026-04-26*
