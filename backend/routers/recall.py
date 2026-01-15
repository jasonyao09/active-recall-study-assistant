"""Recall analysis API endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_db
from models import NoteSection, RecallSession
from services.llm_service import analyze_recall

router = APIRouter(prefix="/api/recall", tags=["recall"])


class RecallSessionResponse(BaseModel):
    id: int
    section_id: int
    user_recall: str
    analysis: Optional[dict]
    score: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


class RecallSubmission(BaseModel):
    section_id: int
    user_recall: str


@router.post("/analyze", response_model=RecallSessionResponse)
async def analyze_user_recall(submission: RecallSubmission, db: Session = Depends(get_db)):
    """Analyze user's recall attempt against original notes."""
    # Get the section
    section = db.query(NoteSection).filter(NoteSection.id == submission.section_id).first()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    
    if not section.content.strip():
        raise HTTPException(status_code=400, detail="Section has no content to compare against")
    
    if not submission.user_recall.strip():
        raise HTTPException(status_code=400, detail="No recall content provided")
    
    # Analyze using LLM
    analysis = await analyze_recall(
        original_notes=section.content,
        user_recall=submission.user_recall
    )
    
    # Create recall session record
    session = RecallSession(
        section_id=section.id,
        user_recall=submission.user_recall,
        analysis=analysis,
        score=analysis.get("score", 0)
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    
    return session


@router.get("/history/{section_id}", response_model=List[RecallSessionResponse])
def get_recall_history(section_id: int, db: Session = Depends(get_db)):
    """Get recall session history for a section."""
    sessions = db.query(RecallSession)\
        .filter(RecallSession.section_id == section_id)\
        .order_by(RecallSession.created_at.desc())\
        .all()
    return sessions


@router.get("/session/{session_id}", response_model=RecallSessionResponse)
def get_recall_session(session_id: int, db: Session = Depends(get_db)):
    """Get a specific recall session."""
    session = db.query(RecallSession).filter(RecallSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session
