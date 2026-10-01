import { roundScoreFor, seededRandom, seededShuffle, decideMatch } from '@/lib/tipScoring'

// Smallest even group size (min 4) that evenly divides `count` and keeps groupCount <= 8
function findGroupConfig(count) {
  for (let size = 4; size <= count; size += 2) {
    if (count % size === 0 && count / size <= 8) return { size, groupCount: count / size }
  }
  return null
}
// Largest qualifying count <= nTotal (min 12) that has a valid group config
export function findQualifyingConfig(nTotal) {
  for (let x = nTotal; x >= 12; x--) {
    const cfg = findGroupConfig(x)
    if (cfg) return { qualifyingCount: x, ...cfg }
  }
  return null
}

// Standard circle-method round robin, cycled/truncated to exactly `numRounds` rounds.
// Works for any even-sized group.
export function generateRoundRobin(groupMembers, numRounds) {
  const n = groupMembers.length
  if (n < 2) return Array.from({ length: numRounds }, () => [])
  const fixed = groupMembers[0]
  let rotating = groupMembers.slice(1)
  const cycleLength = n - 1
  const cycleRounds = []
  for (let round = 0; round < cycleLength; round++) {
    const full = [fixed, ...rotating]
    const pairs = []
    for (let i = 0; i < n / 2; i++) pairs.push([full[i], full[n - 1 - i]])
    cycleRounds.push(pairs)
    rotating.push(rotating.shift())
  }
  return Array.from({ length: numRounds }, (_, i) => cycleRounds[i % cycleLength])
}

// Runs the full Champions League simulation: qualification cutoff, seeded snake-draft
// groups, round-robin group stage (2/1/0 ladder, %-differential tiebreak), lucky-loser
// knockout qualification, and QF/SF/GF aggregate-leg knockout bracket.
//
// Both the Champions League page and the round page's CL sort/group call this rather
// than each re-deriving the group draw and bracket logic separately.
//
// Returns one of three shapes:
//   { qualConfig: null }                                   - fewer than 12 members
//   { qualConfig, notEnoughRounds: true, R, CL_LEN }        - not enough regular-season rounds
//   { qualConfig, groupRounds, qfRounds, sfRounds, gfRounds,
//     qualifiers, groups, groupResults, groupStageComplete,
//     knockoutField, luckyLosers, qf, sf, gf }              - full computed state
//
// Each groupResults entry includes `schedule` - the FULL 6-round round-robin pairing
// for that group, not just rounds played so far, so a caller can show an upcoming
// pairing for a round that hasn't happened yet.
//
// Each qf/sf/gf tie's `result` (once played) includes `legs` - the individual score
// for each leg of the tie, alongside the aggregate scoreA/scoreB/winner - so a caller
// can show a per-leg breakdown (e.g. "Rd18: 33/41  Rd19: 44/35") without needing
// visibility into decideMatch's own internals. The pairing itself (a/b) is known
// and shown even before result exists, wherever the bracket has determined it.
export function computeChampionsLeagueState({ members, roundsList, tipsByFixture, gameMultiplier, competition }) {
  const N = members.length
  const R = roundsList.length
  const qualConfig = findQualifyingConfig(N)
  if (!qualConfig) return { qualConfig: null }

  const { qualifyingCount, size: groupSize, groupCount } = qualConfig

  // Shared round-window placement: KO Cup 2 anchors the end, CL centers on the midpoint,
  // KO Cup 1 finishes right as CL begins.
  const k = N <= 1 ? 0 : Math.ceil(Math.log2(N))
  const cup2StartIdx = Math.max(R - k, 0)
  const CL_LEN = 11 // 6 group + 2 QF + 2 SF + 1 GF
  let clStartIdx = Math.floor(R / 2) - Math.floor(CL_LEN / 2)
  clStartIdx = Math.max(0, Math.min(clStartIdx, R - CL_LEN))
  const clOverride = competition.format_config?.rounds?.champions_league?.start
  if (clOverride) {
    const idx = roundsList.findIndex(r => r.round_name === clOverride)
    if (idx >= 0) clStartIdx = idx
  }

  if (R < CL_LEN) {
    return { qualConfig, notEnoughRounds: true, R, CL_LEN }
  }

  const groupRounds = roundsList.slice(clStartIdx, clStartIdx + 6)
  const qfRounds = roundsList.slice(clStartIdx + 6, clStartIdx + 8)
  const sfRounds = roundsList.slice(clStartIdx + 8, clStartIdx + 10)
  const gfRounds = roundsList.slice(clStartIdx + 10, clStartIdx + 11)

  // --- Qualification: rank all members by cumulative score BEFORE the CL block starts ---
  const preClRounds = roundsList.slice(0, clStartIdx)
  const preClScore = {}
  members.forEach(m => {
    preClScore[m.id] = preClRounds.reduce(
      (sum, r) => sum + roundScoreFor(m.id, r.games, tipsByFixture, gameMultiplier), 0
    )
  })
  const ranked = [...members].sort((a, b) => preClScore[b.id] - preClScore[a.id])
  const qualifiers = ranked.slice(0, qualifyingCount).map(m => m.id)

  // --- Seeded snake-draft into groups, spreading top performers evenly ---
  const groups = Array.from({ length: groupCount }, () => [])
  qualifiers.forEach((id, i) => {
    const wave = Math.floor(i / groupCount)
    const pos = i % groupCount
    const groupIdx = wave % 2 === 0 ? pos : groupCount - 1 - pos
    groups[groupIdx].push(id)
  })

  const seedBase = `${competition.id}-cl`

  // --- Group stage: round-robin schedule per group, standard ladder (2/1/0), % = for/against ---
  const groupResults = groups.map((groupIds, gi) => {
    const schedule = generateRoundRobin(groupIds, 6)
    const matchPoints = {}
    const pointsFor = {}
    const pointsAgainst = {}
    const wins = {}, draws = {}, losses = {}
    groupIds.forEach(id => { matchPoints[id] = 0; pointsFor[id] = 0; pointsAgainst[id] = 0; wins[id] = 0; draws[id] = 0; losses[id] = 0 })
    const roundsPlayed = []

    for (let ri = 0; ri < 6; ri++) {
      const r = groupRounds[ri]
      const complete = r.games.length > 0 && r.games.every(g => g.completed)
      if (!complete) break
      const pairs = schedule[ri]
      const matchResults = pairs.map(([a, b]) => {
        const scoreA = roundScoreFor(a, r.games, tipsByFixture, gameMultiplier)
        const scoreB = roundScoreFor(b, r.games, tipsByFixture, gameMultiplier)
        if (scoreA > scoreB) { matchPoints[a] += 2; wins[a]++; losses[b]++ }
        else if (scoreB > scoreA) { matchPoints[b] += 2; wins[b]++; losses[a]++ }
        else { matchPoints[a] += 1; matchPoints[b] += 1; draws[a]++; draws[b]++ }
        pointsFor[a] += scoreA; pointsAgainst[a] += scoreB
        pointsFor[b] += scoreB; pointsAgainst[b] += scoreA
        return { a, b, scoreA, scoreB }
      })
      roundsPlayed.push({ round_name: r.round_name, matches: matchResults })
    }

    const pct = id => pointsAgainst[id] === 0 ? (pointsFor[id] > 0 ? Infinity : 0) : pointsFor[id] / pointsAgainst[id]

    const standings = [...groupIds].sort((a, b) => (matchPoints[b] - matchPoints[a]) || (pct(b) - pct(a)))
    return { groupIds, standings, matchPoints, pointsFor, pointsAgainst, wins, draws, losses, pct, roundsPlayed, schedule, complete: roundsPlayed.length === 6 }
  })

  const groupStageComplete = groupResults.every(g => g.complete)

  // --- Knockout qualification: top K per group automatically, best (K+1)-th placers as lucky losers ---
  let knockoutField = []
  let luckyLosers = []
  if (groupStageComplete) {
    const K = Math.floor(8 / groupCount)
    groupResults.forEach(g => knockoutField.push(...g.standings.slice(0, K)))
    const remaining = 8 - knockoutField.length
    if (remaining > 0) {
      const candidates = groupResults
        .map(g => g.standings[K])
        .filter(Boolean)
        .sort((a, b) => {
          const gA = groupResults.find(g => g.standings.includes(a))
          const gB = groupResults.find(g => g.standings.includes(b))
          return (gB.matchPoints[b] - gA.matchPoints[a]) || (gB.pct(b) - gA.pct(a))
        })
      luckyLosers = candidates.slice(0, remaining)
      knockoutField.push(...luckyLosers)
    }
  }

  // --- Knockout bracket: seeded random pairing, aggregate home-and-away for QF/SF ---
  let qf = null, sf = null, gf = null
  if (groupStageComplete && knockoutField.length === 8) {
    const bracketOrder = seededShuffle(knockoutField, seededRandom(`${seedBase}-bracket`))
    const cumCL = {}
    knockoutField.forEach(id => { cumCL[id] = 0 })
    groupResults.forEach(g => { g.groupIds.forEach(id => { if (cumCL[id] != null) cumCL[id] += g.pointsFor[id] }) })

    function playTie(a, b, rounds, seedStr) {
      if (rounds.length === 0 || !rounds.every(r => r.games.length > 0 && r.games.every(g => g.completed))) return null
      const combinedGames = rounds.flatMap(r => r.games)
      const result = decideMatch(a, b, combinedGames, tipsByFixture, gameMultiplier, seedStr, cumCL)
      cumCL[a] = (cumCL[a] || 0) + result.scoreA
      cumCL[b] = (cumCL[b] || 0) + result.scoreB
      const legs = rounds.map(r => ({
        round_name: r.round_name,
        scoreA: roundScoreFor(a, r.games, tipsByFixture, gameMultiplier),
        scoreB: roundScoreFor(b, r.games, tipsByFixture, gameMultiplier),
      }))
      return { ...result, legs }
    }

    const qfPairs = [[bracketOrder[0], bracketOrder[1]], [bracketOrder[2], bracketOrder[3]], [bracketOrder[4], bracketOrder[5]], [bracketOrder[6], bracketOrder[7]]]
    const qfResults = qfPairs.map(([a, b], i) => ({ a, b, result: playTie(a, b, qfRounds, `${seedBase}-qf${i}`) }))
    qf = qfResults

    if (qfResults.every(m => m.result)) {
      const qfWinners = qfResults.map(m => m.result.winner)
      const sfPairs = [[qfWinners[0], qfWinners[1]], [qfWinners[2], qfWinners[3]]]
      const sfResults = sfPairs.map(([a, b], i) => ({ a, b, result: playTie(a, b, sfRounds, `${seedBase}-sf${i}`) }))
      sf = sfResults

      if (sfResults.every(m => m.result)) {
        const sfWinners = sfResults.map(m => m.result.winner)
        const gfRound = gfRounds[0]
        const gfComplete = gfRound && gfRound.games.length > 0 && gfRound.games.every(g => g.completed)
        if (gfComplete) {
          const result = decideMatch(sfWinners[0], sfWinners[1], gfRound.games, tipsByFixture, gameMultiplier, `${seedBase}-gf`, cumCL)
          const legs = [{
            round_name: gfRound.round_name,
            scoreA: roundScoreFor(sfWinners[0], gfRound.games, tipsByFixture, gameMultiplier),
            scoreB: roundScoreFor(sfWinners[1], gfRound.games, tipsByFixture, gameMultiplier),
          }]
          gf = { a: sfWinners[0], b: sfWinners[1], result: { ...result, legs } }
        }
      }
    }
  }

  return {
    qualConfig, groupRounds, qfRounds, sfRounds, gfRounds,
    qualifiers, groups, groupResults, groupStageComplete,
    knockoutField, luckyLosers, qf, sf, gf,
  }
}