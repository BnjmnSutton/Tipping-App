import { decideMatch, seededRandom, seededShuffle } from './tipScoring'

export function getKoCupSize(N) {
  const k = N <= 1 ? 0 : Math.ceil(Math.log2(N))
  const paddedSize = Math.pow(2, k)
  return { k, paddedSize, byesNeeded: paddedSize - N }
}

// excludeIds lets Cup 2 avoid repeating anyone who already had a Cup 1 bye
export function pickByes(allIds, byesNeeded, seedStr, excludeIds = []) {
  const excludeSet = new Set(excludeIds)
  const eligible = allIds.filter(id => !excludeSet.has(id))
  const source = eligible.length >= byesNeeded ? eligible : allIds // fallback: allow repeats if not enough non-repeaters
  return new Set(seededShuffle(source, seededRandom(seedStr)).slice(0, byesNeeded))
}

// Runs the bracket over whichever of `cupRoundsArr` are already complete, and
// additionally returns `preview` - the pairing for the very next round that
// HASN'T been played yet, if there is one. Byes and seeding are deterministic
// (seed-based, not results-based), so who plays whom next is fully knowable
// in advance even before a single game in that round has been played; only the
// winner of each pairing is unknown. `preview` has the same { round_name,
// matches: [{a, b}], byesThisRound } shape as a real round, just without
// scores/winners. It's null once the whole bracket (as far as cupRoundsArr
// goes) has been resolved.
export function simulateKoCup({ allIds, byesSet, cupRoundsArr, seedBase, k, tipsByFixture, gameMultiplier }) {
  if (k === 0) return { rounds: [], champion: allIds[0] || null, totalRounds: 0, preview: null }

  const nonBye = allIds.filter(id => !byesSet.has(id))
  const round1Pairs = []
  const shuffledNonBye = seededShuffle(nonBye, seededRandom(`${seedBase}-pairs`))
  for (let i = 0; i < shuffledNonBye.length; i += 2) round1Pairs.push([shuffledNonBye[i], shuffledNonBye[i + 1]])

  const slotItems = seededShuffle(
    [...byesSet].map(id => ({ type: 'bye', id }))
      .concat(round1Pairs.map((_, i) => ({ type: 'match', pairIndex: i }))),
    seededRandom(`${seedBase}-slots`)
  )

  const cumulativeMap = {}
  const rounds = []
  let currentEntrants = null
  let preview = null

  for (let ri = 0; ri < cupRoundsArr.length; ri++) {
    const r = cupRoundsArr[ri]
    const complete = r.games.length > 0 && r.games.every(g => g.completed)
    if (!complete) {
      if (ri === 0) {
        // Round 1's pairing is just the seeded pairs/byes themselves - no
        // prior round's results are needed to know it.
        preview = { round_name: r.round_name, matches: round1Pairs.map(([a, b]) => ({ a, b })), byesThisRound: [...byesSet] }
      } else if (currentEntrants && currentEntrants.length >= 2) {
        const pairs = []
        for (let i = 0; i < currentEntrants.length; i += 2) pairs.push([currentEntrants[i], currentEntrants[i + 1]])
        preview = { round_name: r.round_name, matches: pairs.map(([a, b]) => ({ a, b })), byesThisRound: [] }
      }
      break
    }

    if (ri === 0) {
      const matchResults = round1Pairs.map(([a, b], pi) =>
        decideMatch(a, b, r.games, tipsByFixture, gameMultiplier, `${seedBase}-r1m${pi}`, cumulativeMap)
      )
      round1Pairs.forEach(([a, b], pi) => {
        cumulativeMap[a] = (cumulativeMap[a] || 0) + matchResults[pi].scoreA
        cumulativeMap[b] = (cumulativeMap[b] || 0) + matchResults[pi].scoreB
      })
      rounds.push({
        round_name: r.round_name,
        matches: matchResults.map((m, pi) => ({ a: round1Pairs[pi][0], b: round1Pairs[pi][1], ...m })),
        byesThisRound: [...byesSet],
      })
      currentEntrants = slotItems.map(item => item.type === 'bye' ? item.id : matchResults[item.pairIndex].winner)
    } else {
      const pairs = []
      for (let i = 0; i < currentEntrants.length; i += 2) pairs.push([currentEntrants[i], currentEntrants[i + 1]])
      const matchResults = pairs.map(([a, b], pi) =>
        decideMatch(a, b, r.games, tipsByFixture, gameMultiplier, `${seedBase}-r${ri}m${pi}`, cumulativeMap)
      )
      pairs.forEach(([a, b], pi) => {
        cumulativeMap[a] = (cumulativeMap[a] || 0) + matchResults[pi].scoreA
        cumulativeMap[b] = (cumulativeMap[b] || 0) + matchResults[pi].scoreB
      })
      rounds.push({
        round_name: r.round_name,
        matches: matchResults.map((m, pi) => ({ a: pairs[pi][0], b: pairs[pi][1], ...m })),
        byesThisRound: [],
      })
      currentEntrants = matchResults.map(m => m.winner)
    }
  }

  const champion = currentEntrants && currentEntrants.length === 1 ? currentEntrants[0] : null
  return { rounds, champion, totalRounds: cupRoundsArr.length, preview }
}