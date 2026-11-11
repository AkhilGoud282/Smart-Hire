"""SmartHire AI service: Resume Agent (Gemini) + Evaluation Agent (OpenAI)."""
import io
import json
import os
import re

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from pypdf import PdfReader

load_dotenv()
GEMINI_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
OPENAI_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
MOCK = os.getenv("MOCK_AI", "0") == "1"

app = FastAPI(title="SmartHire AI Service")


# ---------- helpers ----------
def extract_text(filename: str, data: bytes) -> str:
    if filename.lower().endswith(".pdf"):
        reader = PdfReader(io.BytesIO(data))
        return "\n".join(page.extract_text() or "" for page in reader.pages).strip()
    return data.decode("utf-8", errors="ignore").strip()


def call_gemini(prompt: str) -> dict:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
    resp = requests.post(
        url,
        headers={"x-goog-api-key": GEMINI_KEY, "Content-Type": "application/json"},
        json={
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2},
        },
        timeout=90,
    )
    resp.raise_for_status()
    text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
    return json.loads(text)


def call_openai(system: str, user: str) -> dict:
    resp = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {OPENAI_KEY}"},
        json={
            "model": OPENAI_MODEL,
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        },
        timeout=90,
    )
    resp.raise_for_status()
    return json.loads(resp.json()["choices"][0]["message"]["content"])


def clamp(n, lo=0, hi=100):
    try:
        return max(lo, min(hi, round(float(n))))
    except (TypeError, ValueError):
        return 0


# ---------- Resume Agent ----------
RESUME_PROMPT = """You are a senior technical recruiter. Read the resume and job description.
Return ONLY JSON with these keys:
name, email, phone, skills (array of strings), years_experience (number),
education (string), summary (2 sentences),
match_score (0-100 integer, how well the candidate fits the job),
match_reasons (array of 3 short strings),
interview_questions (array of exactly 5 specific questions to ask in a phone screen).

JOB TITLE: {title}
JOB DESCRIPTION:
{jd}

RESUME:
{resume}
"""

COMMON_SKILLS = ["python", "java", "javascript", "react", "node", "sql", "aws", "docker",
                 "excel", "communication", "autocad", "sales", "recruitment", "leadership"]


def mock_resume(text: str, jd: str) -> dict:
    low = text.lower()
    skills = [s for s in COMMON_SKILLS if s in low]
    jd_words = {w for w in re.findall(r"[a-z]{4,}", jd.lower())}
    res_words = set(re.findall(r"[a-z]{4,}", low))
    overlap = len(jd_words & res_words) / max(len(jd_words), 1)
    email = re.search(r"[\w.+-]+@[\w-]+\.[\w.]+", text)
    phone = re.search(r"\+?\d[\d\s-]{8,14}\d", text)
    first = next((l.strip() for l in text.splitlines() if l.strip()), "Unknown")
    return {
        "name": first[:60], "email": email.group(0) if email else "",
        "phone": phone.group(0).replace(" ", "") if phone else "",
        "skills": [s.title() for s in skills], "years_experience": 0,
        "education": "", "summary": "Mock profile generated without calling Gemini.",
        "match_score": clamp(overlap * 150),
        "match_reasons": ["Keyword overlap with job description", "Mock mode", "Enable Gemini for real analysis"],
        "interview_questions": [
            "Tell me about yourself and why this role?",
            "Describe a project you are proud of.",
            "How do you handle tight deadlines?",
            "What are your strongest skills for this job?",
            "When can you join?"],
    }


@app.post("/parse-resume")
async def parse_resume(
    resume: UploadFile = File(...),
    job_title: str = Form(""),
    job_description: str = Form(""),
):
    text = extract_text(resume.filename or "", await resume.read())
    if len(text) < 30:
        raise HTTPException(422, "Could not read text from the resume. Upload a text-based PDF or .txt file.")
    if MOCK or not GEMINI_KEY:
        return mock_resume(text, job_description)
    try:
        data = call_gemini(RESUME_PROMPT.format(title=job_title, jd=job_description, resume=text[:12000]))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Gemini request failed: {exc}") from exc
    data["match_score"] = clamp(data.get("match_score"))
    data["skills"] = data.get("skills") or []
    data["interview_questions"] = (data.get("interview_questions") or [])[:5]
    return data


# ---------- Evaluation Agent ----------
class TranscriptIn(BaseModel):
    transcript: str
    job_title: str = ""
    job_description: str = ""
    candidate_summary: str = ""


EVAL_SYSTEM = """You are an objective hiring evaluator. Score a phone-interview transcript.
Return ONLY JSON: communication (0-100), role_knowledge (0-100), culture_fit (0-100),
overall (0-100 integer), strengths (array of up to 3 strings), concerns (array of up to 3 strings),
recommendation (one of "Strong hire", "Hire", "Maybe", "No hire"), reasoning (2 sentences).
Judge only on evidence in the transcript. Do not consider name, gender, age or origin."""


def mock_eval(transcript: str) -> dict:
    words = len(transcript.split())
    base = clamp(40 + min(words, 400) / 8)
    return {"communication": base, "role_knowledge": base - 5, "culture_fit": base,
            "overall": base, "strengths": ["Answered all questions"], "concerns": ["Mock mode scoring"],
            "recommendation": "Maybe", "reasoning": "Heuristic score based on answer length (mock mode)."}


@app.post("/score-transcript")
def score_transcript(body: TranscriptIn):
    if len(body.transcript.strip()) < 20:
        raise HTTPException(422, "Transcript is empty or too short to score.")
    if MOCK or not OPENAI_KEY:
        return mock_eval(body.transcript)
    user = (f"JOB TITLE: {body.job_title}\nJOB DESCRIPTION:\n{body.job_description}\n\n"
            f"CANDIDATE SUMMARY: {body.candidate_summary}\n\nTRANSCRIPT:\n{body.transcript[:15000]}")
    try:
        data = call_openai(EVAL_SYSTEM, user)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"OpenAI request failed: {exc}") from exc
    for key in ("communication", "role_knowledge", "culture_fit", "overall"):
        data[key] = clamp(data.get(key))
    return data


@app.get("/health")
def health():
    return {"ok": True, "mock": MOCK or not (GEMINI_KEY and OPENAI_KEY)}
