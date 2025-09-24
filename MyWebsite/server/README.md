# Flask Backend for Notes Processing

## Setup

1. Create and activate a virtual environment (Windows PowerShell):

```
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2. Install dependencies:

```
pip install -r requirements.txt
```

3. Run the server:

```
python app.py
```

Server will start at http://localhost:5000

## API

### POST /api/process

Accepts either raw text or files (PDF/TXT). Returns summary and quiz.

Multipart form fields:
- `text`: optional plain text
- `files`: zero or more uploaded files (PDF or TXT)

Response JSON:
```
{
  "summary": "...",
  "questions": [
    {"id":"q1","question":"... _____ ...","options":["A","B","C","D"],"answer":"A"}
  ],
  "tags": ["topic1","topic2"]
}
```

### curl examples

Send text:
```
curl -X POST http://localhost:5000/api/process -F "text=Paste your notes here"
```

Send files:
```
curl -X POST http://localhost:5000/api/process \
  -F "files=@notes.pdf" -F "files=@extra.txt"
```



