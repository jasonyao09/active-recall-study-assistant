"""Quiz generation API endpoints."""
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
    question_type: str
    question_text: str
    options: Optional[List[str]]
    correct_answer: str
    explanation: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class GenerateRequest(BaseModel):
    section_id: int
    num_questions: int = 5
    question_type: str = "mixed"  # 'mcq', 'free_response', or 'mixed'
    custom_instructions: str = ""  # Optional custom instructions for question generation


class AnswerCheck(BaseModel):
    question_id: int
    user_answer: str


@router.post("/generate", response_model=List[QuestionResponse])
async def generate_quiz(request: GenerateRequest, db: Session = Depends(get_db)):
    """Generate questions for a note section using LLM."""
    # Get the section
    section = db.query(NoteSection).filter(NoteSection.id == request.section_id).first()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    
    if not section.content.strip():
        raise HTTPException(status_code=400, detail="Section has no content to generate questions from")
    
    # Generate questions using LLM
    questions_data = await generate_questions(
        notes_content=section.content,
        num_questions=request.num_questions,
        question_type=request.question_type,
        custom_instructions=request.custom_instructions
    )
    
    if not questions_data:
        raise HTTPException(status_code=500, detail="Failed to generate questions")
    
    # Save questions to database
    saved_questions = []
    for q_data in questions_data:
        question = Question(
            section_id=section.id,
            question_type=q_data.get("question_type", "free_response"),
            question_text=q_data.get("question_text", ""),
            options=q_data.get("options"),
            correct_answer=q_data.get("correct_answer", ""),
            explanation=q_data.get("explanation")
        )
        db.add(question)
        saved_questions.append(question)
    
    db.commit()
    
    # Refresh to get IDs
    for q in saved_questions:
        db.refresh(q)
    
    return saved_questions


@router.get("/section/{section_id}", response_model=List[QuestionResponse])
def get_section_questions(section_id: int, db: Session = Depends(get_db)):
    """Get all questions for a section."""
    questions = db.query(Question).filter(Question.section_id == section_id).all()
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
def clear_section_questions(section_id: int, db: Session = Depends(get_db)):
    """Delete all questions for a section."""
    db.query(Question).filter(Question.section_id == section_id).delete()
    db.commit()
    return {"message": "Questions cleared successfully"}
