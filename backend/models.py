"""SQLAlchemy models for the Active Recall application."""
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import Base


class NoteSection(Base):
    """A section/topic of notes. Supports 2-level hierarchy (section → subsection)."""
    __tablename__ = "note_sections"

    id = Column(Integer, primary_key=True, index=True)
    parent_id = Column(Integer, ForeignKey("note_sections.id"), nullable=True)  # NULL = top-level section
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False, default="")
    display_order = Column(Integer, default=0)  # For ordering within parent
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Self-referential relationship for parent/children
    parent = relationship("NoteSection", remote_side=[id], back_populates="children")
    children = relationship("NoteSection", back_populates="parent", cascade="all, delete-orphan",
                          order_by="NoteSection.display_order")

    # Other relationships
    questions = relationship("Question", back_populates="section", cascade="all, delete-orphan")
    recall_sessions = relationship("RecallSession", back_populates="section", cascade="all, delete-orphan")


class Question(Base):
    """Generated questions for a note section."""
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    section_id = Column(Integer, ForeignKey("note_sections.id"), nullable=False)
    question_type = Column(String(20), nullable=False)  # 'mcq' or 'free_response'
    question_text = Column(Text, nullable=False)
    options = Column(JSON, nullable=True)  # For MCQ: list of options
    correct_answer = Column(Text, nullable=False)
    explanation = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    section = relationship("NoteSection", back_populates="questions")


class RecallSession(Base):
    """A recall practice session."""
    __tablename__ = "recall_sessions"

    id = Column(Integer, primary_key=True, index=True)
    section_id = Column(Integer, ForeignKey("note_sections.id"), nullable=False)
    user_recall = Column(Text, nullable=False)  # What user remembered
    analysis = Column(JSON, nullable=True)  # LLM analysis results
    score = Column(Integer, nullable=True)  # Percentage score
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    section = relationship("NoteSection", back_populates="recall_sessions")
