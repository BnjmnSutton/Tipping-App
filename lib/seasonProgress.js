// Finds the season's "current round" - the first round anywhere with an
// incomplete game, or the last round if everything's finished. This tracks
// actual progress (the same `completed` flag every format page already keys
// off) rather than comparing real-world game dates against right-now, which
// proved fragile against imported fixture data (the original bug on both the
// round page and tips page). `roundsList` just needs each entry to have a
// `.games` array.
export function getCurrentRoundIndex(roundsList) {
  if (!roundsList || roundsList.length === 0) return -1
  const idx = roundsList.findIndex(r => r.games.some(g => !g.completed))
  return idx === -1 ? roundsList.length - 1 : idx
}

// "Started, or about to start next round": true once the season's current
// round is at or within one round of `targetIdx` - the format's own start
// index within that same roundsList (e.g. Finals Leaderboard's first finals
// round, or Night Prem's cutoff round).
export function hasReachedRound(roundsList, targetIdx) {
  return getCurrentRoundIndex(roundsList) >= targetIdx - 1
}