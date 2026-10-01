export function getMultiplier(correctCount, scoringConfig) {
  if (!scoringConfig?.multiplier_enabled) return 1
  const thresholds = scoringConfig?.thresholds || {}
  return thresholds[String(correctCount)] ?? thresholds.default ?? 1
}

export function computeGameMultipliers(fixture, tipsByFixture, scoringConfig) {
  const gameMultiplier = {}
  fixture.forEach(g => {
    if (!g.completed) return
    const gameTips = tipsByFixture[g.id] || []
    const cc = gameTips.filter(t => t.pick === g.result).length
    gameMultiplier[g.id] = getMultiplier(cc, scoringConfig)
  })
  return gameMultiplier
}

export function roundScoreFor(memberId, games, tipsByFixture, gameMultiplier) {
  let pts = 0
  games.forEach(g => {
    if (!g.completed) return
    const t = (tipsByFixture[g.id] || []).find(x => x.member_id === memberId)
    if (t && t.pick === g.result) pts += (t.confidence || 0) * gameMultiplier[g.id]
  })
  return pts
}

export function countCorrect(memberId, games, tipsByFixture) {
  let c = 0
  games.forEach(g => {
    if (!g.completed) return
    const t = (tipsByFixture[g.id] || []).find(x => x.member_id === memberId)
    if (t && t.pick === g.result) c++
  })
  return c
}

// Confidence values "lost" on wrong picks (a draw counts as lost too), sorted highest first
export function lostConfList(memberId, games, tipsByFixture) {
  const lost = []
  games.forEach(g => {
    if (!g.completed) return
    const t = (tipsByFixture[g.id] || []).find(x => x.member_id === memberId)
    if (!t || !t.pick || t.confidence == null) return
    const isDraw = !g.result
    if (t.pick !== g.result || isDraw) lost.push(t.confidence)
  })
  return lost.sort((a, b) => b - a)
}

// Deterministic seeded RNG - same "random" output every time for a given seed string,
// so byes/pairings/coin-tosses stay stable across reloads without persisting to the DB.
export function seededRandom(seedStr) {
  let h = 1779033703 ^ seedStr.length
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = (h ^= h >>> 16) >>> 0
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export function seededShuffle(arr, rand) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Standard 4-level tiebreak cascade used by KO Cup and Champions League matches:
// score -> most correct tips -> largest lost tip (then next largest, etc.) ->
// higher cumulative competition score so far -> coin toss (reported).
// `games` can span more than one round (e.g. a home-and-away 2-leg tie) since
// every helper above just sums over whatever games array it's given.
export function decideMatch(a, b, games, tipsByFixture, gameMultiplier, seedStr, cumulativeMap) {
  const scoreA = roundScoreFor(a, games, tipsByFixture, gameMultiplier)
  const scoreB = roundScoreFor(b, games, tipsByFixture, gameMultiplier)
  if (scoreA !== scoreB) return { winner: scoreA > scoreB ? a : b, tiebreak: null, scoreA, scoreB }

  const correctA = countCorrect(a, games, tipsByFixture)
  const correctB = countCorrect(b, games, tipsByFixture)
  if (correctA !== correctB) return { winner: correctA > correctB ? a : b, tiebreak: 'Most correct tips', scoreA, scoreB }

  const lostA = lostConfList(a, games, tipsByFixture)
  const lostB = lostConfList(b, games, tipsByFixture)
  const maxLen = Math.max(lostA.length, lostB.length)
  for (let i = 0; i < maxLen; i++) {
    const va = lostA[i] ?? -1
    const vb = lostB[i] ?? -1
    if (va !== vb) return { winner: va > vb ? a : b, tiebreak: 'Largest tip lost', scoreA, scoreB }
  }

  const cumA = cumulativeMap?.[a] || 0
  const cumB = cumulativeMap?.[b] || 0
  if (cumA !== cumB) return { winner: cumA > cumB ? a : b, tiebreak: 'Higher overall Cup score', scoreA, scoreB }

  const winner = seededRandom(seedStr + '-coin')() < 0.5 ? a : b
  return { winner, tiebreak: 'Coin toss', scoreA, scoreB }
}