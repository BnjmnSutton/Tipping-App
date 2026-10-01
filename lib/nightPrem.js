import { roundScoreFor } from './tipScoring'
import { hasReachedRound } from './seasonProgress'
import { getNightPremStartIdx } from './formatWindows'

// Runs Night Prem's cutoff/qualification and post-cutoff scoring. `roundsList`
// should be the FULL season (regular + finals) - the cutoff POSITION is
// computed from `regularCount` so finals never shift where it falls, but the
// post-cutoff scoring period runs through whatever's left in roundsList,
// finals included. Both night-prem/page.js and the round page's Night Prem
// sort call this, so there's one place that decides the cutoff and who
// qualifies.
//
// Returns:
//   startIdx        - index into roundsList where the post-cutoff period begins
//   preCutoffRounds - roundsList slice before the cutoff
//   nightPremRounds - roundsList slice from the cutoff onward (regular + finals)
//   hasStarted      - whether the season has reached (or is one round from) startIdx
//   qualifierIds    - Set of member ids in the bottom half as of the cutoff
//   qualifyingCount - how many members qualify
//   rows            - { member, total, roundScores }[] for qualifiers only,
//                     scored over nightPremRounds - same shape as
//                     computeLeaderboardRows, so callers can render it the same way
export function computeNightPremState({ members, roundsList, regularCount, tipsByFixture, gameMultiplier, competition }) {
  const startIdx = getNightPremStartIdx(regularCount, roundsList, competition)
  const preCutoffRounds = roundsList.slice(0, startIdx)
  const nightPremRounds = roundsList.slice(startIdx)
  const hasStarted = nightPremRounds.length > 0 && hasReachedRound(roundsList, startIdx)

  if (!hasStarted) {
    return { startIdx, preCutoffRounds, nightPremRounds, hasStarted, qualifierIds: new Set(), qualifyingCount: 0, rows: [] }
  }

  // Rank everyone by cumulative score up to the cutoff, take the bottom 50%
  const preCutoffScore = {}
  members.forEach(m => {
    preCutoffScore[m.id] = preCutoffRounds.reduce(
      (sum, r) => sum + roundScoreFor(m.id, r.games, tipsByFixture, gameMultiplier), 0
    )
  })
  const rankedWorstFirst = [...members].sort((a, b) => preCutoffScore[a.id] - preCutoffScore[b.id])
  const qualifyingCount = Math.max(1, Math.round(members.length * 0.5))
  const qualifierIds = new Set(rankedWorstFirst.slice(0, qualifyingCount).map(m => m.id))
  const qualifiers = members.filter(m => qualifierIds.has(m.id))

  // Fresh mini-leaderboard among just the qualifiers, using only rounds after the cutoff
  const rows = qualifiers.map(m => {
    let total = 0
    const roundScores = nightPremRounds.map(r => {
      const pts = roundScoreFor(m.id, r.games, tipsByFixture, gameMultiplier)
      const anyResolved = r.games.some(g => g.completed)
      total += pts
      return { round_name: r.round_name, pts, anyResolved }
    })
    return { member: m, total, roundScores }
  })

  return { startIdx, preCutoffRounds, nightPremRounds, hasStarted, qualifierIds, qualifyingCount, rows }
}