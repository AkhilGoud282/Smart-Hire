require("dotenv").config();
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const store = require("./store");
const { rank } = require("./ranking");
const { startCall } = require("./bland");

const AI = process.env.AI_SERVICE_URL || "http://localhost:8000";
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ---- calls to the Python AI service ----
async function parseResume(file, title, description) {
  const form = new FormData();
  form.append("resume", new Blob([file.buffer]), file.originalname);
  form.append("job_title", title);
  form.append("job_description", description);
  const res = await fetch(`${AI}/parse-resume`, { method: "POST", body: form });
  const body = await res.json();
  if (!res.ok) throw new Error(body.detail || "Resume screening failed");
  return body;
}

async function scoreTranscript(candidate, transcript) {
  const res = await fetch(`${AI}/score-transcript`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      transcript,
      job_title: candidate.job.title,
      job_description: candidate.job.description,
      candidate_summary: candidate.resume.summary,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.detail || "Transcript scoring failed");
  return body;
}

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    console.error(err);
    res.status(500).json({ error: err.message });
  });

// ---- routes ----
app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/candidates", (_req, res) => res.json(rank(store.all())));

app.post("/api/candidates", upload.single("resume"), wrap(async (req, res) => {
  const { jobTitle, jobDescription } = req.body;
  if (!req.file) return res.status(400).json({ error: "Attach a resume (PDF or TXT)." });
  if (!jobTitle || !jobDescription) return res.status(400).json({ error: "Job title and description are required." });

  const resume = await parseResume(req.file, jobTitle, jobDescription);
  const candidate = store.add({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    job: { title: jobTitle, description: jobDescription },
    resume,
    status: "screened", // screened → calling → interviewed
    call: null,
    transcript: null,
    evaluation: null,
  });
  res.status(201).json(candidate);
}));

app.post("/api/candidates/:id/call", wrap(async (req, res) => {
  const candidate = store.get(req.params.id);
  if (!candidate) return res.status(404).json({ error: "Candidate not found." });
  const phone = (req.body.phone || candidate.resume.phone || "").replace(/[\s-]/g, "");
  if (!/^\+\d{10,15}$/.test(phone)) return res.status(400).json({ error: "Enter the phone number in international format, e.g. +919876543210." });
  if (!process.env.BLAND_API_KEY) return res.status(400).json({ error: "BLAND_API_KEY is not set on the server." });
  if (!process.env.PUBLIC_URL) return res.status(400).json({ error: "PUBLIC_URL (your Ngrok URL) is not set on the server." });

  const call = await startCall(candidate, phone, `${process.env.PUBLIC_URL}/api/webhooks/bland`);
  res.json(store.update(candidate.id, { status: "calling", call: { id: call.call_id, phone, startedAt: new Date().toISOString() } }));
}));

// Bland AI posts here when the call ends (reached through Ngrok).
app.post("/api/webhooks/bland", (req, res) => {
  res.sendStatus(200); // acknowledge immediately, process afterwards
  const { metadata, concatenated_transcript: transcript, call_id } = req.body || {};
  const candidate = store.get(metadata?.candidate_id);
  if (!candidate) return console.warn("Webhook for unknown candidate", call_id);
  if (!transcript) return store.update(candidate.id, { status: "screened", call: { ...candidate.call, failed: true } });
  processTranscript(candidate, transcript).catch((e) => console.error("Scoring failed:", e.message));
});

app.post("/api/candidates/:id/transcript", wrap(async (req, res) => {
  const candidate = store.get(req.params.id);
  if (!candidate) return res.status(404).json({ error: "Candidate not found." });
  if (!req.body.transcript) return res.status(400).json({ error: "Transcript is required." });
  res.json(await processTranscript(candidate, req.body.transcript));
}));

async function processTranscript(candidate, transcript) {
  const evaluation = await scoreTranscript(candidate, transcript);
  return store.update(candidate.id, { transcript, evaluation, status: "interviewed" });
}

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`SmartHire API on http://localhost:${port}`));
