"""Notes CRUD API endpoints with hierarchical section support."""
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
    parent_id: Optional[int] = None


class NoteSectionUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    parent_id: Optional[int] = None
    display_order: Optional[int] = None


class NoteSectionResponse(BaseModel):
    id: int
    parent_id: Optional[int]
    title: str
    content: str
    display_order: int
    created_at: datetime
    updated_at: datetime
    children: List["NoteSectionResponse"] = []

    class Config:
        from_attributes = True


# Enable self-referencing
NoteSectionResponse.model_rebuild()


class NoteSectionTree(BaseModel):
    """Hierarchical view of sections with their children."""
    id: int
    parent_id: Optional[int]
    title: str
    content: str
    display_order: int
    created_at: datetime
    updated_at: datetime
    children: List["NoteSectionTree"] = []

    class Config:
        from_attributes = True


NoteSectionTree.model_rebuild()


def build_section_tree(section: NoteSection) -> dict:
    """Recursively build section tree."""
    return {
        "id": section.id,
        "parent_id": section.parent_id,
        "title": section.title,
        "content": section.content,
        "display_order": section.display_order,
        "created_at": section.created_at,
        "updated_at": section.updated_at,
        "children": [build_section_tree(child) for child in section.children]
    }


# CRUD endpoints
@router.get("/", response_model=List[NoteSectionTree])
def list_sections(flat: bool = False, db: Session = Depends(get_db)):
    """List all note sections. Returns hierarchical tree by default."""
    if flat:
        # Return flat list of all sections
        sections = db.query(NoteSection).order_by(
            NoteSection.parent_id.nullsfirst(),
            NoteSection.display_order,
            NoteSection.updated_at.desc()
        ).all()
        return [build_section_tree(s) for s in sections]
    else:
        # Return only top-level sections with children nested
        top_sections = db.query(NoteSection).filter(
            NoteSection.parent_id == None
        ).order_by(
            NoteSection.display_order,
            NoteSection.updated_at.desc()
        ).all()
        return [build_section_tree(s) for s in top_sections]


@router.get("/{section_id}", response_model=NoteSectionTree)
def get_section(section_id: int, db: Session = Depends(get_db)):
    """Get a specific note section with its children."""
    section = db.query(NoteSection).filter(NoteSection.id == section_id).first()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    return build_section_tree(section)


@router.post("/", response_model=NoteSectionTree)
def create_section(section: NoteSectionCreate, db: Session = Depends(get_db)):
    """Create a new note section or subsection."""
    # Validate parent exists and is not a subsection (enforce 2-level max)
    if section.parent_id:
        parent = db.query(NoteSection).filter(NoteSection.id == section.parent_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent section not found")
        if parent.parent_id is not None:
            raise HTTPException(
                status_code=400, 
                detail="Cannot create subsection under another subsection. Maximum 2 levels allowed."
            )
    
    # Get max display order for siblings
    siblings_query = db.query(NoteSection).filter(NoteSection.parent_id == section.parent_id)
    max_order = siblings_query.count()
    
    db_section = NoteSection(
        title=section.title,
        content=section.content,
        parent_id=section.parent_id,
        display_order=max_order
    )
    db.add(db_section)
    db.commit()
    db.refresh(db_section)
    return build_section_tree(db_section)


@router.put("/{section_id}", response_model=NoteSectionTree)
def update_section(section_id: int, section: NoteSectionUpdate, db: Session = Depends(get_db)):
    """Update a note section."""
    db_section = db.query(NoteSection).filter(NoteSection.id == section_id).first()
    if not db_section:
        raise HTTPException(status_code=404, detail="Section not found")
    
    if section.title is not None:
        db_section.title = section.title
    if section.content is not None:
        db_section.content = section.content
    if section.display_order is not None:
        db_section.display_order = section.display_order
    if section.parent_id is not None:
        # Validate new parent
        if section.parent_id == section_id:
            raise HTTPException(status_code=400, detail="Section cannot be its own parent")
        parent = db.query(NoteSection).filter(NoteSection.id == section.parent_id).first()
        if parent and parent.parent_id is not None:
            raise HTTPException(
                status_code=400,
                detail="Cannot move section under another subsection. Maximum 2 levels allowed."
            )
        db_section.parent_id = section.parent_id
    
    db.commit()
    db.refresh(db_section)
    return build_section_tree(db_section)


@router.delete("/{section_id}")
def delete_section(section_id: int, db: Session = Depends(get_db)):
    """Delete a note section and all its children."""
    db_section = db.query(NoteSection).filter(NoteSection.id == section_id).first()
    if not db_section:
        raise HTTPException(status_code=404, detail="Section not found")
    
    db.delete(db_section)
    db.commit()
    return {"message": "Section deleted successfully"}


@router.post("/{section_id}/reorder")
def reorder_sections(section_id: int, new_order: int, db: Session = Depends(get_db)):
    """Change the display order of a section within its siblings."""
    db_section = db.query(NoteSection).filter(NoteSection.id == section_id).first()
    if not db_section:
        raise HTTPException(status_code=404, detail="Section not found")
    
    # Get all siblings
    siblings = db.query(NoteSection).filter(
        NoteSection.parent_id == db_section.parent_id
    ).order_by(NoteSection.display_order).all()
    
    # Remove from old position and insert at new position
    siblings = [s for s in siblings if s.id != section_id]
    siblings.insert(new_order, db_section)
    
    # Update all display orders
    for i, sibling in enumerate(siblings):
        sibling.display_order = i
    
    db.commit()
    return {"message": "Section reordered successfully"}


# Export/Import endpoints
@router.get("/export/all")
def export_all_notes(db: Session = Depends(get_db)):
    """Export all notes as JSON with hierarchy."""
    top_sections = db.query(NoteSection).filter(
        NoteSection.parent_id == None
    ).order_by(NoteSection.display_order).all()
    
    def export_section(section):
        return {
            "title": section.title,
            "content": section.content,
            "display_order": section.display_order,
            "created_at": section.created_at.isoformat(),
            "updated_at": section.updated_at.isoformat(),
            "children": [export_section(child) for child in section.children]
        }
    
    export_data = {
        "exported_at": datetime.utcnow().isoformat(),
        "sections": [export_section(s) for s in top_sections]
    }
    return JSONResponse(
        content=export_data,
        headers={
            "Content-Disposition": "attachment; filename=notes_export.json"
        }
    )


@router.get("/export/{section_id}")
def export_section(section_id: int, db: Session = Depends(get_db)):
    """Export a single section and its children as JSON."""
    section = db.query(NoteSection).filter(NoteSection.id == section_id).first()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    
    def export_sec(sec):
        return {
            "title": sec.title,
            "content": sec.content,
            "display_order": sec.display_order,
            "created_at": sec.created_at.isoformat(),
            "updated_at": sec.updated_at.isoformat(),
            "children": [export_sec(child) for child in sec.children]
        }
    
    export_data = {
        "exported_at": datetime.utcnow().isoformat(),
        "section": export_sec(section)
    }
    
    filename = f"notes_{section.title.replace(' ', '_')}.json"
    return JSONResponse(
        content=export_data,
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )


class ImportSection(BaseModel):
    title: str
    content: str = ""
    display_order: int = 0
    children: List["ImportSection"] = []


ImportSection.model_rebuild()


class ImportData(BaseModel):
    sections: List[ImportSection]


@router.post("/import")
def import_notes(import_data: ImportData, db: Session = Depends(get_db)):
    """Import notes from JSON with hierarchy."""
    imported_count = 0
    
    def import_section(section_data: ImportSection, parent_id: Optional[int] = None):
        nonlocal imported_count
        db_section = NoteSection(
            title=section_data.title,
            content=section_data.content,
            parent_id=parent_id,
            display_order=section_data.display_order
        )
        db.add(db_section)
        db.flush()  # Get the ID for children
        imported_count += 1
        
        for child in section_data.children:
            import_section(child, db_section.id)
    
    for section_data in import_data.sections:
        import_section(section_data)
    
    db.commit()
    return {"message": f"Successfully imported {imported_count} sections"}
