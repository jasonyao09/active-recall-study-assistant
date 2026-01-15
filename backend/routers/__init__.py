"""Router module exports."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from routers.notes import router as notes_router
from routers.quiz import router as quiz_router
from routers.recall import router as recall_router

__all__ = ["notes_router", "quiz_router", "recall_router"]
