import { roundScoreFor } from './tipScoring'

// 1st/2nd/3rd place votes each round, based on round score (same scoring as
// GC). Ties split the pooled vote value evenly across however many positions
// are tied. Both mvp/page.js and the round page's MVP sort call this, so
// there's one place that decides how votes get awarded.
const VOTE_VALUES = [3, 2, 1]

export function computeMvpRows(members, roundsList, tipsByFixture, gameMultiplier) {
  const voteMap = {} // member.id -> { round_name: votes | null }
  members.forEach(m => { voteMap[m.id] = {} })

  roundsList.forEach(r => {
    const roundComplete = r.games.length > 0 && r.games.every(g => g.completed)
    if (!roundComplete) {
      members.forEach(m => { voteMap[m.id][r.round_name] = null })
      return
    }

    const scores = members.map(m => ({ id: m.id, score: roundScoreFor(m.id, r.games, tipsByFixture, gameMultiplier) }))
    scores.sort((a, b) => b.score - a.score)

    let i = 0
    const votesById = {}
    while (i < scores.length && i < VOTE_VALUES.length) {
      let j = i
      while (j < scores.length && scores[j].score === scores[i].score) j++
      const pool = VOTE_VALUES.slice(i, Math.min(j, VOTE_VALUES.length))
      const share = pool.length > 0 ? pool.reduce((a, b) => a + b, 0) / (j - i) : 0
      for (let k = i; k < j; k++) votesById[scores[k].id] = share
      i = j
    }

    members.forEach(m => {
      voteMap[m.id][r.round_name] = votesById[m.id] || 0
    })
  })

  return members.map(m => {
    let total = 0
    const roundVotes = roundsList.map(r => {
      const v = voteMap[m.id][r.round_name]
      if (v != null) total += v
      return { round_name: r.round_name, votes: v }
    })
    return { member: m, total, roundVotes }
  })
}