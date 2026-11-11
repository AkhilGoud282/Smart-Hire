async function request(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

const json = (data) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});

export const listCandidates = () => request("/api/candidates");
export const addCandidate = (formData) => request("/api/candidates", { method: "POST", body: formData });
export const startCall = (id, phone) => request(`/api/candidates/${id}/call`, json({ phone }));
export const submitTranscript = (id, transcript) => request(`/api/candidates/${id}/transcript`, json({ transcript }));
