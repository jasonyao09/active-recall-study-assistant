# Active Recall Study Assistant

A web-based study tool that helps you learn and retain information through **active recall** methodology. Built with FastAPI, SQLite, and a local LLM (Qwen 2.5 14B via Ollama).

## Features

### 📝 Notes Management
- Create, edit, and organize notes by sections/topics
- Auto-save functionality
- Import/Export notes as JSON files

### ❓ Quiz Mode
- AI-generated questions from your notes
- Multiple choice (MCQ) and free-response questions
- Instant feedback with explanations

### 🧠 Recall Practice
- Blind recall testing (notes hidden during practice)
- AI-powered analysis comparing your recall vs. original notes
- Detailed feedback on:
  - What you got right
  - What you missed
  - Any inaccuracies
  - Personalized suggestions

## Prerequisites

- Python 3.10+
- Ollama with the `qwen2.5:14b` model

## Quick Start

### 1. Start Ollama (if not running)
```bash
ollama serve
```

### 2. Ensure the model is downloaded
```bash
ollama pull qwen2.5:14b
```

### 3. Install Python dependencies
```bash
cd backend
pip install -r requirements.txt
```

### 4. Run the application
```bash
cd backend
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 5. Open in browser
Navigate to: http://localhost:8000

## Project Structure

```
active-recall-app/
├── backend/
│   ├── main.py              # FastAPI application
│   ├── database.py          # SQLite database config
│   ├── models.py            # SQLAlchemy models
│   ├── routers/
│   │   ├── notes.py         # Notes CRUD API
│   │   ├── quiz.py          # Quiz generation API
│   │   └── recall.py        # Recall analysis API
│   ├── services/
│   │   └── llm_service.py   # Ollama LLM integration
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── app.js
│       ├── notes.js
│       ├── quiz.js
│       └── recall.js
├── data/
│   └── study.db             # SQLite database (created on first run)
└── README.md
```

## API Endpoints

### Notes
- `GET /api/notes/` - List all sections
- `GET /api/notes/{id}` - Get a section
- `POST /api/notes/` - Create a section
- `PUT /api/notes/{id}` - Update a section
- `DELETE /api/notes/{id}` - Delete a section
- `GET /api/notes/export/all` - Export all notes
- `GET /api/notes/export/{id}` - Export a section
- `POST /api/notes/import` - Import notes

### Quiz
- `POST /api/quiz/generate` - Generate questions for a section
- `GET /api/quiz/section/{id}` - Get questions for a section
- `POST /api/quiz/check` - Check an answer

### Recall
- `POST /api/recall/analyze` - Submit recall for analysis
- `GET /api/recall/history/{section_id}` - Get recall history
- `GET /api/recall/session/{id}` - Get a specific session

## License

MIT License
