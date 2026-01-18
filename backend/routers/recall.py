"""Recall analysis API endpoints with multi-section support."""
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
    section_title: Optional[str] = None
    user_recall: str
    analysis: Optional[dict]
    score: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


class RecallSubmission(BaseModel):
    section_ids: List[int]  # Now accepts multiple sections
    user_recall: str
    include_subsections: bool = True


def get_section_with_children(db: Session, section_id: int, include_subsections: bool = True) -> List[NoteSection]:
    """Get a section and optionally its children."""
    section = db.query(NoteSection).filter(NoteSection.id == section_id).first()
    if not section:
        return []
    
    sections = [section]
    if include_subsections and section.children:
        sections.extend(section.children)
    
    return sections


def collect_content_from_sections(sections: List[NoteSection]) -> str:
    """Combine content from multiple sections with headers."""
    content_parts = []
    for section in sections:
        if section.content.strip():
            content_parts.append(f"## {section.title}\n{section.content}")
    return "\n\n".join(content_parts)


@router.post("/analyze", response_model=RecallSessionResponse)
async def analyze_user_recall(submission: RecallSubmission, db: Session = Depends(get_db)):
    """Analyze user's recall attempt against original notes from one or more sections."""
    if not submission.section_ids:
        raise HTTPException(status_code=400, detail="At least one section must be selected")
    
    if not submission.user_recall.strip():
        raise HTTPException(status_code=400, detail="No recall content provided")
    
    # Collect all sections (with optional subsections)
    all_sections = []
    for section_id in submission.section_ids:
        sections = get_section_with_children(db, section_id, submission.include_subsections)
        for sec in sections:
            if sec.id not in [s.id for s in all_sections]:
                all_sections.append(sec)
    
    if not all_sections:
        raise HTTPException(status_code=404, detail="No sections found")
    
    # Combine content from all sections
    combined_content = collect_content_from_sections(all_sections)
    
    if not combined_content.strip():
        raise HTTPException(status_code=400, detail="Selected sections have no content")
    
    # Analyze using LLM
    analysis = await analyze_recall(
        original_notes=combined_content,
        user_recall=submission.user_recall
    )
    
    # Create recall session record (associate with first section)
    primary_section = all_sections[0]
    session = RecallSession(
        section_id=primary_section.id,
        user_recall=submission.user_recall,
        analysis=analysis,
        score=analysis.get("score", 0)
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    
    return {
        "id": session.id,
        "section_id": session.section_id,
        "section_title": primary_section.title,
        "user_recall": session.user_recall,
        "analysis": session.analysis,
        "score": session.score,
        "created_at": session.created_at
    }


@router.get("/history/{section_id}", response_model=List[RecallSessionResponse])
def get_recall_history(section_id: int, include_subsections: bool = False, db: Session = Depends(get_db)):
    """Get recall session history for a section (and optionally its subsections)."""
    section_ids = [section_id]
    
    if include_subsections:
        section = db.query(NoteSection).filter(NoteSection.id == section_id).first()
        if section and section.children:
            section_ids.extend([child.id for child in section.children])
    
    sessions = db.query(RecallSession)\
        .filter(RecallSession.section_id.in_(section_ids))\
        .order_by(RecallSession.created_at.desc())\
        .all()
    return sessions


@router.get("/session/{session_id}", response_model=RecallSessionResponse)
def get_recall_session(session_id: int, db: Session = Depends(get_db)):
    """Get a specific recall session."""
    session = db.query(RecallSession).filter(RecallSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Get section title
    section = db.query(NoteSection).filter(NoteSection.id == session.section_id).first()
    
    return {
        "id": session.id,
        "section_id": session.section_id,
        "section_title": section.title if section else None,
        "user_recall": session.user_recall,
        "analysis": session.analysis,
        "score": session.score,
        "created_at": session.created_at
    }
