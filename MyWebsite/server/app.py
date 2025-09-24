import io
import os
import re
from datetime import datetime
from typing import List, Dict, Any

from flask import Flask, request, jsonify
from flask_cors import CORS
from PyPDF2 import PdfReader


def create_app() -> Flask:
    app = Flask(__name__)
    # Allow local web app to call this API
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    @app.get("/api/health")
    def health() -> Any:
        return {"status": "ok", "time": datetime.utcnow().isoformat() + "Z"}

    @app.post("/api/process")
    def process_notes() -> Any:
        # Accepts multipart/form-data with optional text field and files[] (pdf/txt)
        text_parts: List[str] = []

        raw_text: str = request.form.get("text", "").strip()
        if raw_text:
            text_parts.append(raw_text)

        # Handle uploaded files
        files = request.files.getlist("files") or request.files.getlist("file")
        for f in files:
            filename = (f.filename or "").lower()
            if filename.endswith(".pdf"):
                try:
                    text_parts.append(_extract_text_from_pdf(f.stream))
                except Exception as e:
                    return _error(f"Failed to read PDF '{f.filename}': {e}")
            elif filename.endswith(".txt") or f.mimetype == "text/plain":
                try:
                    data = f.read()
                    try:
                        text = data.decode("utf-8")
                    except Exception:
                        text = data.decode("latin-1", errors="ignore")
                    text_parts.append(text)
                except Exception as e:
                    return _error(f"Failed to read TXT '{f.filename}': {e}")
            elif filename:
                return _error(f"Unsupported file type for '{f.filename}'. Use PDF or TXT.")

        full_text = _clean_text("\n".join(tp for tp in text_parts if tp))
        if not full_text:
            return _error("No text found in request. Provide 'text' or upload PDF/TXT files[]")

        # Summarize and quiz
        summary = _summarize(full_text, max_sentences=5)
        questions = _generate_quiz(full_text, num_questions=6)
        tags = _extract_key_phrases(full_text, limit=6)

        return jsonify({
            "summary": summary,
            "questions": questions,
            "tags": tags
        })

    return app


def _extract_text_from_pdf(stream: io.BytesIO) -> str:
    reader = PdfReader(stream)
    texts: List[str] = []
    for page in reader.pages:
        try:
            t = page.extract_text() or ""
        except Exception:
            t = ""
        if t:
            texts.append(t)
    return "\n".join(texts)


def _clean_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text)
    # Keep common punctuation
    text = re.sub(r"[^\w\s\.,;:!\?\-\(\)]", " ", text)
    return text.strip()


def _split_sentences(text: str) -> List[str]:
    # Simple sentence splitter on punctuation + space
    parts = re.split(r"(?<=[\.!?])\s+", text)
    return [p.strip() for p in parts if p and len(p.strip()) > 2]


def _extract_key_phrases(text: str, limit: int = 12) -> List[str]:
    words = re.findall(r"[a-zA-Z0-9][a-zA-Z0-9\-']+", text.lower())
    stop = {
        'the','a','an','in','on','and','or','of','to','is','are','was','were','be','as','for','with','that','by','from',
        'at','this','it','its','their','there','which','we','you','they','he','she','but','about','into','than','then','so',
        'such','can','could','may','might','must','should','have','has','had','not','no','yes','if','when','where','who','whom',
        'what','why','how'
    }
    freq: Dict[str, int] = {}
    for w in words:
        if w in stop or len(w) < 3:
            continue
        freq[w] = freq.get(w, 0) + 1
    ranked = sorted(freq.items(), key=lambda kv: kv[1], reverse=True)
    return [w for w,_ in ranked[:limit]]


def _summarize(text: str, max_sentences: int = 5) -> str:
    sentences = _split_sentences(text)
    if not sentences:
        return ""
    # Word frequency scoring
    words = re.findall(r"[a-zA-Z0-9][a-zA-Z0-9\-']+", text.lower())
    stop = {
        'the','a','an','in','on','and','or','of','to','is','are','was','were','be','as','for','with','that','by','from',
        'at','this','it','its','their','there','which','we','you','they','he','she','but','about','into','than','then','so',
        'such','can','could','may','might','must','should','have','has','had','not','no','yes','if','when','where','who','whom',
        'what','why','how'
    }
    freq: Dict[str, int] = {}
    for w in words:
        if w in stop or len(w) < 3:
            continue
        freq[w] = freq.get(w, 0) + 1

    scores: List[float] = []
    for s in sentences:
        sw = re.findall(r"[a-zA-Z0-9][a-zA-Z0-9\-']+", s.lower())
        score = sum(freq.get(w, 0) for w in sw) / (len(sw) + 1e-6)
        scores.append(score)

    # Select top sentences (keep original order)
    n = min(max_sentences, max(1, int(len(sentences) * 0.2)))
    top_idxs = sorted(sorted(range(len(sentences)), key=lambda i: scores[i], reverse=True)[:n])
    return " ".join(sentences[i] for i in top_idxs)


def _generate_quiz(text: str, num_questions: int = 6) -> List[Dict[str, Any]]:
    sentences = _split_sentences(text)
    phrases = _extract_key_phrases(text, limit=24)
    questions: List[Dict[str, Any]] = []

    def shuffle(items: List[str]) -> List[str]:
        import random
        a = list(items)
        random.shuffle(a)
        return a

    used = set()
    for i, key in enumerate(phrases):
        if len(questions) >= num_questions:
            break
        if key in used:
            continue
        used.add(key)
        s = next((st for st in sentences if key in st.lower()), None)
        if s:
            pattern = re.compile(re.escape(key), re.IGNORECASE)
            question_stem = pattern.sub('_____', s)
        else:
            question_stem = f"What best describes: {key}?"
        correct = key
        distractors = [p for p in phrases if p != key][:8]
        options = shuffle(([correct] + distractors)[:4])
        questions.append({
            "id": f"q{i+1}",
            "question": question_stem,
            "options": options,
            "answer": correct
        })

    return questions


def _error(message: str):
    return jsonify({"error": message}), 400


if __name__ == "__main__":
    app = create_app()
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True)



