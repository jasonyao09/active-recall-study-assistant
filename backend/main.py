"""FastAPI main application entry point."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import init_db
from routers import notes_router, quiz_router, recall_router
from services.llm_service import check_ollama_status

# Initialize FastAPI app
app = FastAPI(
    title="Active Recall Study Assistant",
    description="A study tool for active recall and spaced repetition",
    version="1.0.0"
)

# CORS middleware for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(notes_router)
app.include_router(quiz_router)
app.include_router(recall_router)

# Static files for frontend
frontend_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
app.mount("/static", StaticFiles(directory=frontend_path), name="static")


@app.on_event("startup")
async def startup_event():
    """Initialize database on startup."""
    init_db()


@app.get("/")
async def root():
    """Serve the frontend."""
    return FileResponse(os.path.join(frontend_path, "index.html"))


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    ollama_status = await check_ollama_status()
    return {
        "status": "healthy",
        "ollama": ollama_status
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
