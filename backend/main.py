from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import router
from contextlib import asynccontextmanager


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("DeepMind_Query API starting...")
    yield
    # Shutdown
    print("DeepMind_Query API shutting down...")


app = FastAPI(
    title="DeepMind_Query API",
    description="知识蛛网 LLM 对话后端 API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware - use explicit origins, not wildcard with credentials
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# Include routes
app.include_router(router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
