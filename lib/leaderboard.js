import { roundScoreFor } from './tipScoring'

// Generic round-by-round leaderboard: sums roundScoreFor per member across
// whichever `roundsList` is passed in - all rounds for GC, finals-only for
// Finals Leaderboard. "Which rounds count" is decided once, by whichever
// roundsList the caller passes - not re-implemented per caller. Returns the
// same { member, total, roundScores: [{round_name, pts, anyResolved}] }[]
// shape both leaderboard-style pages already render.
export function computeLeaderboardRows(members, roundsList, tipsByFixture, gameMultiplier) {
  return members.map(m => {
    let total = 0
    const roundScores = roundsList.map(r => {
      const pts = roundScoreFor(m.id, r.games, tipsByFixture, gameMultiplier)
      const anyResolved = r.games.some(g => g.completed)
      total += pts
      return { round_name: r.round_name, pts, anyResolved }
    })
    return { member: m, total, roundScores }
  })
}