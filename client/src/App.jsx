import { useCallback, useEffect, useState } from "react";
import { addCandidate, listCandidates, startCall, submitTranscript } from "./api.js";

const STATUS = { screened: "Screened", calling: "Interview in progress", interviewed: "Interviewed" };

function ScoreBar({ label, value }) {
  return (
    <div className="bar">
      <span>{label}</span>
      <div className="track"><div className="fill" style={{ width: `${value ?? 0}%` }} /></div>
      <b>{value ?? "–"}</b>
    </div>
  );
}

function UploadForm({ onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError("");
    try {
      await addCandidate(new FormData(form));
      form.reset();
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel upload" onSubmit={submit}>
      <h2>Screen a resume</h2>
      <label>Job title<input name="jobTitle" required placeholder="Non-IT Recruiter" /></label>
      <label>Job description
        <textarea name="jobDescription" required rows={5} placeholder="Paste the role requirements" />
      </label>
      <label>Resume (PDF or TXT)<input name="resume" type="file" accept=".pdf,.txt" required /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button disabled={busy}>{busy ? "Screening…" : "Screen resume"}</button>
    </form>
  );
}

function Detail({ c, refresh }) {
  const [phone, setPhone] = useState(c.resume.phone || "");
  const [transcript, setTranscript] = useState("");
  const [msg, setMsg] = useState({ type: "", text: "" });
  const [busy, setBusy] = useState(false);

  async function run(fn, okText) {
    setBusy(true);
    setMsg({ type: "", text: "" });
    try {
      await fn();
      setMsg({ type: "ok", text: okText });
      refresh();
    } catch (err) {
      setMsg({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  const ev = c.evaluation;
  return (
    <section className="panel detail">
      <header>
        <div>
          <h2>{c.resume.name}</h2>
          <p className="muted">{c.job.title} · {STATUS[c.status]}</p>
        </div>
        <div className="final"><b>{c.finalScore}</b><span>final score</span></div>
      </header>

      <p>{c.resume.summary}</p>
      <div className="chips">{(c.resume.skills || []).map((s) => <span key={s}>{s}</span>)}</div>

      <h3>Resume match</h3>
      <ScoreBar label="Match" value={c.resume.match_score} />
      <ul>{(c.resume.match_reasons || []).map((r) => <li key={r}>{r}</li>)}</ul>

      <h3>Voice interview</h3>
      {c.status === "calling" && <p className="muted">Call placed. Results appear here when Bland AI sends the transcript.</p>}
      {c.status === "screened" && (
        <div className="row">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+919876543210" aria-label="Candidate phone number" />
          <button disabled={busy} onClick={() => run(() => startCall(c.id, phone), "Call started.")}>Call candidate</button>
        </div>
      )}
      {c.status !== "interviewed" && (
        <details>
          <summary>Paste transcript instead</summary>
          <textarea rows={5} value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="Agent: … Candidate: …" />
          <button disabled={busy || !transcript} onClick={() => run(() => submitTranscript(c.id, transcript), "Transcript scored.")}>Score transcript</button>
        </details>
      )}
      {msg.text && <p className={msg.type} role="status">{msg.text}</p>}

      {ev && (
        <>
          <ScoreBar label="Communication" value={ev.communication} />
          <ScoreBar label="Role knowledge" value={ev.role_knowledge} />
          <ScoreBar label="Culture fit" value={ev.culture_fit} />
          <p><b>{ev.recommendation}.</b> {ev.reasoning}</p>
          <div className="two">
            <div><h4>Strengths</h4><ul>{ev.strengths?.map((s) => <li key={s}>{s}</li>)}</ul></div>
            <div><h4>Concerns</h4><ul>{ev.concerns?.map((s) => <li key={s}>{s}</li>)}</ul></div>
          </div>
          <details><summary>Full transcript</summary><pre>{c.transcript}</pre></details>
        </>
      )}
    </section>
  );
}

export default function App() {
  const [candidates, setCandidates] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    listCandidates().then(setCandidates).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000); // pick up webhook results
    return () => clearInterval(t);
  }, [refresh]);

  const current = candidates.find((c) => c.id === selected) || candidates[0];

  return (
    <main>
      <h1>SmartHire</h1>
      {error && <p className="error" role="alert">Cannot reach the API: {error}</p>}
      <div className="layout">
        <aside>
          <UploadForm onDone={refresh} />
          <div className="panel list">
            <h2>Ranking</h2>
            {candidates.length === 0 && <p className="muted">Upload a resume to start screening.</p>}
            {candidates.map((c) => (
              <button key={c.id} className={`row-item ${current?.id === c.id ? "active" : ""}`} onClick={() => setSelected(c.id)}>
                <span className="rank">{c.rank}</span>
                <span className="who"><b>{c.resume.name}</b><small>{STATUS[c.status]}</small></span>
                <span className="score">{c.finalScore}</span>
              </button>
            ))}
          </div>
        </aside>
        {current ? <Detail key={current.id + current.status} c={current} refresh={refresh} /> : <section className="panel detail muted">No candidates yet.</section>}
      </div>
    </main>
  );
}
