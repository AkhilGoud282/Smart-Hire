// Final score: 40% resume match + 60% interview score (once the interview is scored).
function finalScore(c) {
  const resume = c.resume?.match_score ?? 0;
  const interview = c.evaluation?.overall;
  return interview == null ? resume : Math.round(resume * 0.4 + interview * 0.6);
}

function rank(candidates) {
  return candidates
    .map((c) => ({ ...c, finalScore: finalScore(c) }))
    .sort((a, b) => b.finalScore - a.finalScore)
    .map((c, i) => ({ ...c, rank: i + 1 }));
}

module.exports = { rank, finalScore };
