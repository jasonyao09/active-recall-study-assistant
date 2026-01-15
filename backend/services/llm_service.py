"""LLM service for interacting with Ollama."""
import httpx
import json
from typing import Optional

OLLAMA_BASE_URL = "http://localhost:11434"
MODEL_NAME = "qwen2.5:14b"


async def generate_response(prompt: str, system_prompt: Optional[str] = None) -> str:
    """Generate a response from the LLM."""
    messages = []
    
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    
    messages.append({"role": "user", "content": prompt})
    
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json={
                "model": MODEL_NAME,
                "messages": messages,
                "stream": False
            }
        )
        response.raise_for_status()
        result = response.json()
        return result["message"]["content"]


async def generate_questions(notes_content: str, num_questions: int = 5, question_type: str = "mixed", custom_instructions: str = "") -> list:
    """Generate questions from notes content."""
    
    type_instruction = ""
    if question_type == "mcq":
        type_instruction = "Generate only multiple choice questions with 4 options each."
    elif question_type == "free_response":
        type_instruction = "Generate only free-response/open-ended questions."
    else:
        type_instruction = "Generate a mix of multiple choice and free-response questions."
    
    # Add custom instructions if provided
    custom_section = ""
    if custom_instructions.strip():
        custom_section = f"\n\nADDITIONAL INSTRUCTIONS FROM USER:\n{custom_instructions.strip()}\n"
    
    system_prompt = """You are an expert educator creating study questions. 
Your task is to generate high-quality questions that test understanding and recall of the provided notes.
Always respond with valid JSON only, no markdown formatting."""

    prompt = f"""Based on the following notes, generate exactly {num_questions} study questions.
{type_instruction}
{custom_section}
NOTES:
{notes_content}

Respond with a JSON array of questions in this exact format:
[
  {{
    "question_type": "mcq",
    "question_text": "What is...",
    "options": ["A) Option 1", "B) Option 2", "C) Option 3", "D) Option 4"],
    "correct_answer": "A) Option 1",
    "explanation": "This is correct because..."
  }},
  {{
    "question_type": "free_response",
    "question_text": "Explain how...",
    "options": null,
    "correct_answer": "The expected answer covers...",
    "explanation": "Key points to include are..."
  }}
]

Return ONLY the JSON array, no other text."""

    response = await generate_response(prompt, system_prompt)
    
    # Parse JSON from response
    try:
        # Try to extract JSON if wrapped in markdown
        if "```json" in response:
            response = response.split("```json")[1].split("```")[0]
        elif "```" in response:
            response = response.split("```")[1].split("```")[0]
        
        questions = json.loads(response.strip())
        return questions
    except json.JSONDecodeError as e:
        print(f"Failed to parse LLM response: {e}")
        print(f"Response was: {response}")
        return []


async def analyze_recall(original_notes: str, user_recall: str) -> dict:
    """Analyze user's recall against original notes."""
    
    system_prompt = """You are an expert educator analyzing a student's recall attempt.
Compare what they remembered against the original notes and provide detailed, constructive feedback.
Always respond with valid JSON only, no markdown formatting."""

    prompt = f"""Compare the student's recall attempt against the original notes and analyze their understanding.

ORIGINAL NOTES:
{original_notes}

STUDENT'S RECALL ATTEMPT:
{user_recall}

Analyze their recall and respond with JSON in this exact format:
{{
  "score": 75,
  "correct_points": [
    "The student correctly remembered that...",
    "They accurately recalled..."
  ],
  "missed_points": [
    {{
      "topic": "Topic they missed",
      "explanation": "The notes mentioned that... This is important because..."
    }}
  ],
  "inaccuracies": [
    {{
      "what_they_said": "Student's inaccurate statement",
      "correction": "The correct information is...",
      "explanation": "This matters because..."
    }}
  ],
  "suggestions": [
    "To improve retention, consider...",
    "Focus more on..."
  ],
  "summary": "Overall assessment of their recall performance..."
}}

The score should be a percentage (0-100) based on how much of the key information they recalled correctly.
Return ONLY the JSON object, no other text."""

    response = await generate_response(prompt, system_prompt)
    
    # Parse JSON from response
    try:
        # Try to extract JSON if wrapped in markdown
        if "```json" in response:
            response = response.split("```json")[1].split("```")[0]
        elif "```" in response:
            response = response.split("```")[1].split("```")[0]
        
        analysis = json.loads(response.strip())
        return analysis
    except json.JSONDecodeError as e:
        print(f"Failed to parse LLM response: {e}")
        print(f"Response was: {response}")
        return {
            "score": 0,
            "correct_points": [],
            "missed_points": [],
            "inaccuracies": [],
            "suggestions": ["Unable to analyze recall. Please try again."],
            "summary": "Analysis failed due to a processing error."
        }


async def check_ollama_status() -> dict:
    """Check if Ollama is running and the model is available."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            # Check if Ollama is running
            response = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            response.raise_for_status()
            
            models = response.json().get("models", [])
            model_names = [m.get("name", "") for m in models]
            
            # Check if our model is available
            model_available = any(MODEL_NAME in name for name in model_names)
            
            return {
                "ollama_running": True,
                "model_available": model_available,
                "model_name": MODEL_NAME,
                "available_models": model_names
            }
    except Exception as e:
        return {
            "ollama_running": False,
            "model_available": False,
            "model_name": MODEL_NAME,
            "error": str(e)
        }
