// Resolves a required number of eliminations from a group of {id, score}.
// If a tie straddles the cutoff, it's ambiguous who among the tied group goes -
// they're held over (returned as remainingGroup/remainingDebt) unless isLastRound,
// in which case cumulative season score is used as the final tiebreak.
export function resolveCuts(candidates, count, cumulativeScore, isLastRound) {
  if (count <= 0 || candidates.length === 0) return { eliminated: [], remainingGroup: [], remainingDebt: 0 }
  if (count >= candidates.length) {
    return { eliminated: candidates.map(c => c.id), remainingGroup: [], remainingDebt: 0 }
  }

  const sorted = [...candidates].sort((a, b) => a.score - b.score)
  const cutoffScore = sorted[count - 1].score
  const clearlyOut = sorted.filter(c => c.score < cutoffScore).map(c => c.id)
  const tiedAtCutoff = sorted.filter(c => c.score === cutoffScore)
  const stillNeeded = count - clearlyOut.length

  if (tiedAtCutoff.length === stillNeeded) {
    // Tied group size exactly matches what's needed - no ambiguity, all of them go
    return { eliminated: [...clearlyOut, ...tiedAtCutoff.map(c => c.id)], remainingGroup: [], remainingDebt: 0 }
  }

  if (isLastRound) {
    const brokenByCumulative = [...tiedAtCutoff].sort(
      (a, b) => (cumulativeScore[a.id] || 0) - (cumulativeScore[b.id] || 0)
    )
    const forcedOut = brokenByCumulative.slice(0, stillNeeded).map(c => c.id)
    return { eliminated: [...clearlyOut, ...forcedOut], remainingGroup: [], remainingDebt: 0 }
  }

  return { eliminated: clearlyOut, remainingGroup: tiedAtCutoff.map(c => c.id), remainingDebt: stillNeeded }
}

// Runs the full Eliminator simulation over `activeRoundsList` for `members`.
// Total eliminations is always N-1 (one winner left), spread across rounds with
// any remainder front-loaded onto the earliest rounds. Both the Eliminator page
// and the round page's Eliminator sort call this rather than each re-deriving
// the elimination schedule/tiebreak-debt logic separately.
//
// Returns:
//   eliminatedAtRound  - { memberId: round_name } for anyone eliminated so far
//   memberRoundScore   - { memberId: { round_name: score } }
//   cumulativeScore    - { memberId: number } - total score across processed rounds
//   winnerId           - memberId if exactly one member remains alive, else null
//   processedRounds    - activeRoundsList trimmed to only fully-completed rounds
//   alive              - Set of memberIds not yet eliminated
export function computeEliminatorState({ members, activeRoundsList, tipsByFixture, gameMultiplier }) {
  function roundScoreFor(memberId, games) {
    let pts = 0
    games.forEach(g => {
      if (!g.completed) return
      const gameTips = tipsByFixture[g.id] || []
      const t = gameTips.find(x => x.member_id === memberId)
      if (t && t.pick === g.result) pts += (t.confidence || 0) * gameMultiplier[g.id]
    })
    return pts
  }

  const N = members.length
  const R = activeRoundsList.length
  const totalToEliminate = Math.max(N - 1, 0)
  const base = R > 0 ? Math.floor(totalToEliminate / R) : 0
  const remainder = R > 0 ? totalToEliminate % R : 0
  const quotas = activeRoundsList.map((_, i) => base + (i < remainder ? 1 : 0))

  let alive = new Set(members.map(m => m.id))
  const eliminatedAtRound = {}
  const memberRoundScore = {}
  const cumulativeScore = {}
  members.forEach(m => { memberRoundScore[m.id] = {}; cumulativeScore[m.id] = 0 })

  let pendingDebts = [] // [{ ids: [...], debt: n }] - tied groups held over from an earlier round
  let lastProcessedRoundIndex = -1

  for (let idx = 0; idx < activeRoundsList.length; idx++) {
    const r = activeRoundsList[idx]
    const complete = r.games.length > 0 && r.games.every(g => g.completed)
    if (!complete) break
    lastProcessedRoundIndex = idx
    const isLastRound = idx === activeRoundsList.length - 1

    if (alive.size <= 1) continue

    const scored = [...alive].map(id => ({ id, score: roundScoreFor(id, r.games) }))
    scored.forEach(s => {
      memberRoundScore[s.id][r.round_name] = s.score
      cumulativeScore[s.id] += s.score
    })
    const scoreMap = Object.fromEntries(scored.map(s => [s.id, s.score]))
    const eliminatedThisRound = new Set()

    // 1. Pay off any carried-over debts first, using this round's scores of just that held-over group
    const newPendingDebts = []
    for (const debtEntry of pendingDebts) {
      const candidates = debtEntry.ids.map(id => ({ id, score: scoreMap[id] }))
      const result = resolveCuts(candidates, debtEntry.debt, cumulativeScore, isLastRound)
      result.eliminated.forEach(id => eliminatedThisRound.add(id))
      if (result.remainingGroup.length > 0) {
        newPendingDebts.push({ ids: result.remainingGroup, debt: result.remainingDebt })
      }
    }
    pendingDebts = newPendingDebts

    // 2. Apply this round's own quota to everyone NOT currently quarantined in a pending debt
    const quarantinedIds = new Set(pendingDebts.flatMap(d => d.ids))
    const generalCandidates = scored.filter(s => !quarantinedIds.has(s.id) && !eliminatedThisRound.has(s.id))
    const remainingAliveSoFar = alive.size - eliminatedThisRound.size
    const safeQuota = Math.min(quotas[idx], Math.max(remainingAliveSoFar - 1, 0), generalCandidates.length)

    if (safeQuota > 0) {
      const result2 = resolveCuts(generalCandidates, safeQuota, cumulativeScore, isLastRound)
      result2.eliminated.forEach(id => eliminatedThisRound.add(id))
      if (result2.remainingGroup.length > 0) {
        pendingDebts.push({ ids: result2.remainingGroup, debt: result2.remainingDebt })
      }
    }

    eliminatedThisRound.forEach(id => {
      eliminatedAtRound[id] = r.round_name
      alive.delete(id)
    })
  }

  const winnerId = alive.size === 1 ? [...alive][0] : null
  const processedRounds = activeRoundsList.slice(0, lastProcessedRoundIndex + 1)

  return { eliminatedAtRound, memberRoundScore, cumulativeScore, winnerId, processedRounds, alive }
}