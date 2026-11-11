// Interview Agent: places an outbound AI voice call through Bland AI.
const BLAND_URL = "https://api.bland.ai/v1/calls";

function buildTask(candidate) {
  const questions = (candidate.resume.interview_questions || [])
    .map((q, i) => `${i + 1}. ${q}`)
    .join("\n");
  return `You are a friendly recruiter from SmartHire calling ${candidate.resume.name || "the candidate"} for a short phone screening for the "${candidate.job.title}" role.
Introduce yourself, confirm it is a good time (about 5 minutes), then ask these questions one at a time and listen fully:
${questions}
Do not discuss salary or make promises about the outcome. Thank them and end the call politely.`;
}

async function startCall(candidate, phone, webhookUrl) {
  const res = await fetch(BLAND_URL, {
    method: "POST",
    headers: { authorization: process.env.BLAND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      phone_number: phone,
      task: buildTask(candidate),
      webhook: webhookUrl,
      record: true,
      wait_for_greeting: true,
      max_duration: 10, // minutes
      metadata: { candidate_id: candidate.id },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || `Bland AI returned ${res.status}`);
  return body; // { status, call_id }
}

module.exports = { startCall };
