"""Quiz generation API endpoints with multi-section support."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_db
from models import NoteSection, Question
from services.llm_service import generate_questions

router = APIRouter(prefix="/api/quiz", tags=["quiz"])


class QuestionResponse(BaseModel):
    id: int
    section_id: int
    section_title: Optional[str] = None  # Added to show which section question came from
    question_type: str
    question_text: str
    options: Optional[List[str]]
    correct_answer: str
    explanation: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class GenerateRequest(BaseModel):
    section_ids: List[int]  # Now accepts multiple sections
    num_questions: int = 5
    question_type: str = "mixed"  # 'mcq', 'free_response', or 'mixed'
    custom_instructions: str = ""
    include_subsections: bool = True  # Whether to include children of selected sections


class AnswerCheck(BaseModel):
    question_id: int
    user_answer: str


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


@router.post("/generate", response_model=List[QuestionResponse])
async def generate_quiz(request: GenerateRequest, db: Session = Depends(get_db)):
    """Generate questions from one or more sections using LLM."""
    if not request.section_ids:
        raise HTTPException(status_code=400, detail="At least one section must be selected")
    
    # Collect all sections (with optional subsections)
    all_sections = []
    section_titles = {}
    
    for section_id in request.section_ids:
        sections = get_section_with_children(db, section_id, request.include_subsections)
        for sec in sections:
            if sec.id not in [s.id for s in all_sections]:
                all_sections.append(sec)
                section_titles[sec.id] = sec.title
    
    if not all_sections:
        raise HTTPException(status_code=404, detail="No sections found")
    
    # Combine content from all sections
    combined_content = collect_content_from_sections(all_sections)
    
    if not combined_content.strip():
        raise HTTPException(status_code=400, detail="Selected sections have no content")
    
    # Generate questions using LLM
    questions_data = await generate_questions(
        notes_content=combined_content,
        num_questions=request.num_questions,
        question_type=request.question_type,
        custom_instructions=request.custom_instructions
    )
    
    if not questions_data:
        raise HTTPException(status_code=500, detail="Failed to generate questions")
    
    # Save questions to database (associate with first section for now)
    primary_section_id = request.section_ids[0]
    saved_questions = []
    
    for q_data in questions_data:
        question = Question(
            section_id=primary_section_id,
            question_type=q_data.get("question_type", "free_response"),
            question_text=q_data.get("question_text", ""),
            options=q_data.get("options"),
            correct_answer=q_data.get("correct_answer", ""),
            explanation=q_data.get("explanation")
        )
        db.add(question)
        saved_questions.append(question)
    
    db.commit()
    
    # Refresh and add section titles
    result = []
    for q in saved_questions:
        db.refresh(q)
        result.append({
            "id": q.id,
            "section_id": q.section_id,
            "section_title": section_titles.get(q.section_id, ""),
            "question_type": q.question_type,
            "question_text": q.question_text,
            "options": q.options,
            "correct_answer": q.correct_answer,
            "explanation": q.explanation,
            "created_at": q.created_at
        })
    
    return result


@router.get("/section/{section_id}", response_model=List[QuestionResponse])
def get_section_questions(section_id: int, include_subsections: bool = False, db: Session = Depends(get_db)):
    """Get all questions for a section (and optionally its subsections)."""
    section_ids = [section_id]
    
    if include_subsections:
        section = db.query(NoteSection).filter(NoteSection.id == section_id).first()
        if section and section.children:
            section_ids.extend([child.id for child in section.children])
    
    questions = db.query(Question).filter(Question.section_id.in_(section_ids)).all()
    return questions


@router.post("/check")
def check_answer(answer: AnswerCheck, db: Session = Depends(get_db)):
    """Check a user's answer against the correct answer."""
    question = db.query(Question).filter(Question.id == answer.question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    
    # Simple check - for MCQ, compare directly; for free response, return the correct answer
    is_correct = False
    if question.question_type == "mcq":
        # Extract just the letter/option for comparison
        user_ans = answer.user_answer.strip().upper()
        correct_ans = question.correct_answer.strip().upper()
        is_correct = user_ans.startswith(correct_ans[0]) or correct_ans.startswith(user_ans[0])
    
    return {
        "is_correct": is_correct,
        "correct_answer": question.correct_answer,
        "explanation": question.explanation,
        "question_type": question.question_type
    }


@router.delete("/section/{section_id}/clear")
def clear_section_questions(section_id: int, include_subsections: bool = False, db: Session = Depends(get_db)):
    """Delete all questions for a section (and optionally its subsections)."""
    section_ids = [section_id]
    
    if include_subsections:
        section = db.query(NoteSection).filter(NoteSection.id == section_id).first()
        if section and section.children:
            section_ids.extend([child.id for child in section.children])
    
    db.query(Question).filter(Question.section_id.in_(section_ids)).delete(synchronize_session=False)
    db.commit()
    return {"message": "Questions cleared successfully"}
