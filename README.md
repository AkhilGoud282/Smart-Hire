# SmartHire – AI-Powered Recruitment Agent

Multi-agent app that automates **resume screening → voice interview → transcript evaluation → candidate ranking**.

```
React (Vite, :5173)
   │  /api
Express (Node, :5000) ── REST ──► Python FastAPI (:8000)
   │                                 ├─ Resume Agent      → Gemini API
   │                                 └─ Evaluation Agent  → OpenAI API
   ├─ Interview Agent → Bland AI (outbound voice call)
   └─ POST /api/webhooks/bland  ◄── Bland AI (via Ngrok public URL)
```

## Agents
| Agent | Where | What it does |
|---|---|---|
| Resume Agent | `ai-service` + Gemini | Extracts structured profile, scores match vs. job description, writes 5 interview questions |
| Interview Agent | `server` + Bland AI | Calls the candidate and runs the interview with those questions |
| Evaluation Agent | `ai-service` + OpenAI | Scores the call transcript (communication, role knowledge, culture fit) |
| Ranking | `server` | Final score = 40% resume match + 60% interview score |

## Setup
Requires Python 3.10+, Node 18+.

```bash
# 1. AI service
cd ai-service
python -m venv venv && source venv/bin/activate     # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                # add GEMINI_API_KEY, OPENAI_API_KEY
uvicorn main:app --port 8000 --reload

# 2. API server (new terminal)
cd server && npm install
cp .env.example .env                                # add BLAND_API_KEY, PUBLIC_URL
npm start

# 3. Front end (new terminal)
cd client && npm install && npm run dev             # http://localhost:5173
```

### Webhooks with Ngrok
Bland AI must reach your laptop to deliver the transcript:
```bash
ngrok http 5000
```
Copy the `https://xxxx.ngrok-free.app` URL into `server/.env` as `PUBLIC_URL`, restart the server.

### Try it without any API keys
Set `MOCK_AI=1` in `ai-service/.env`. Resume parsing and scoring return heuristic results.
In the UI use **Paste transcript** to simulate a finished call instead of dialing a phone.

## API
| Method | Route | Purpose |
|---|---|---|
| POST | `/api/candidates` | multipart: `resume`, `jobTitle`, `jobDescription` → parse + screen |
| GET | `/api/candidates` | ranked candidates |
| POST | `/api/candidates/:id/call` | `{ phone }` (E.164, e.g. +919876543210) → start Bland AI call |
| POST | `/api/candidates/:id/transcript` | `{ transcript }` → score manually (demo/testing) |
| POST | `/api/webhooks/bland` | Bland AI webhook (call finished + transcript) |
