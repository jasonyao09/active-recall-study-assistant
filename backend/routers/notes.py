"""Notes CRUD API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import json
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_db
from models import NoteSection

router = APIRouter(prefix="/api/notes", tags=["notes"])


# Pydantic schemas
class NoteSectionCreate(BaseModel):
    title: str
    content: str = ""


class NoteSectionUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None


class NoteSectionResponse(BaseModel):
    id: int
    title: str
    content: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# CRUD endpoints
@router.get("/", response_model=List[NoteSectionResponse])
def list_sections(db: Session = Depends(get_db)):
    """List all note sections."""
    sections = db.query(NoteSection).order_by(NoteSection.updated_at.desc()).all()
    return sections


@router.get("/{section_id}", response_model=NoteSectionResponse)
def get_section(section_id: int, db: Session = Depends(get_db)):
    """Get a specific note section."""
    section = db.query(NoteSection).filter(NoteSection.id == section_id).first()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    return section


@router.post("/", response_model=NoteSectionResponse)
def create_section(section: NoteSectionCreate, db: Session = Depends(get_db)):
    """Create a new note section."""
    db_section = NoteSection(
        title=section.title,
        content=section.content
    )
    db.add(db_section)
    db.commit()
    db.refresh(db_section)
    return db_section


@router.put("/{section_id}", response_model=NoteSectionResponse)
def update_section(section_id: int, section: NoteSectionUpdate, db: Session = Depends(get_db)):
    """Update a note section."""
    db_section = db.query(NoteSection).filter(NoteSection.id == section_id).first()
    if not db_section:
        raise HTTPException(status_code=404, detail="Section not found")
    
    if section.title is not None:
        db_section.title = section.title
    if section.content is not None:
        db_section.content = section.content
    
    db.commit()
    db.refresh(db_section)
    return db_section


@router.delete("/{section_id}")
def delete_section(section_id: int, db: Session = Depends(get_db)):
    """Delete a note section."""
    db_section = db.query(NoteSection).filter(NoteSection.id == section_id).first()
    if not db_section:
        raise HTTPException(status_code=404, detail="Section not found")
    
    db.delete(db_section)
    db.commit()
    return {"message": "Section deleted successfully"}


# Export/Import endpoints
@router.get("/export/all")
def export_all_notes(db: Session = Depends(get_db)):
    """Export all notes as JSON."""
    sections = db.query(NoteSection).all()
    export_data = {
        "exported_at": datetime.utcnow().isoformat(),
        "sections": [
            {
                "title": s.title,
                "content": s.content,
                "created_at": s.created_at.isoformat(),
                "updated_at": s.updated_at.isoformat()
            }
            for s in sections
        ]
    }
    return JSONResponse(
        content=export_data,
        headers={
            "Content-Disposition": "attachment; filename=notes_export.json"
        }
    )


@router.get("/export/{section_id}")
def export_section(section_id: int, db: Session = Depends(get_db)):
    """Export a single section as JSON."""
    section = db.query(NoteSection).filter(NoteSection.id == section_id).first()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    
    export_data = {
        "exported_at": datetime.utcnow().isoformat(),
        "section": {
            "title": section.title,
            "content": section.content,
            "created_at": section.created_at.isoformat(),
            "updated_at": section.updated_at.isoformat()
        }
    }
    
    filename = f"notes_{section.title.replace(' ', '_')}.json"
    return JSONResponse(
        content=export_data,
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )


class ImportData(BaseModel):
    sections: List[NoteSectionCreate]


@router.post("/import")
def import_notes(import_data: ImportData, db: Session = Depends(get_db)):
    """Import notes from JSON."""
    imported_count = 0
    
    for section_data in import_data.sections:
        db_section = NoteSection(
            title=section_data.title,
            content=section_data.content
        )
        db.add(db_section)
        imported_count += 1
    
    db.commit()
    return {"message": f"Successfully imported {imported_count} sections"}
