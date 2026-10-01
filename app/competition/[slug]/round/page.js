'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import BottomTabBar from '@/components/BottomTabBar'
import RoundSelector from '@/components/RoundSelector'
import { getFormatLabel, isFormatEnabled } from '@/lib/formatConfig'
import { computeGameMultipliers } from '@/lib/tipScoring'
import { computeLeaderboardRows } from '@/lib/leaderboard'
import { computeMvpRows } from '@/lib/mvp'
import { computeNightPremState } from '@/lib/nightPrem'
import { computeEliminatorState } from '@/lib/eliminator'
import { getKoCupSize, pickByes, simulateKoCup } from '@/lib/koCup'
import { computeChampionsLeagueState } from '@/lib/championsLeague'
import { getCurrentRoundIndex } from '@/lib/seasonProgress'
import { getEliminatorWindow, getKoCupWindow, isFormatActiveForRound } from '@/lib/formatWindows'

const CONF_VALUES = {
  9: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  8: [1, 2, 3, 4, 6, 7, 8, 9],
  7: [1, 2, 3, 5, 7, 8, 9],
  6: [1, 2, 4, 6, 8, 9],
  5: [1, 3, 5, 7, 9],
  4: [2, 4, 6, 8],
  3: [2, 5, 8],
  2: [4, 8],
  1: [9],
}
function getConfValues(gameCount) {
  return CONF_VALUES[gameCount] || CONF_VALUES[9]
}

function getMultiplier(correctCount, scoringConfig) {
  if (!scoringConfig?.multiplier_enabled) return 1
  const thresholds = scoringConfig?.thresholds || {}
  return thresholds[String(correctCount)] ?? thresholds.default ?? 1
}

// Same hue order as GROUP_COLORS on the Champions League page (emerald, blue,
// amber, purple, rose, cyan, indigo, lime), so "Group A" here matches "Group A"
// there. `bg`/`bgAlt` alternate per pair within a group (the banding); `border`
// marks group and pair boundaries.
const CL_GROUP_PALETTE = [
  { bg: '#ecfdf5', bgAlt: '#d1fae5', border: '#34d399' },
  { bg: '#eff6ff', bgAlt: '#dbeafe', border: '#60a5fa' },
  { bg: '#fffbeb', bgAlt: '#fef3c7', border: '#fbbf24' },
  { bg: '#faf5ff', bgAlt: '#f3e8ff', border: '#c084fc' },
  { bg: '#fff1f2', bgAlt: '#ffe4e6', border: '#fb7185' },
  { bg: '#ecfeff', bgAlt: '#cffafe', border: '#22d3ee' },
  { bg: '#eef2ff', bgAlt: '#e0e7ff', border: '#818cf8' },
  { bg: '#f7fee7', bgAlt: '#ecfccb', border: '#a3e635' },
]

// Builds the sort/group order for the round page's tipster list for a given format
// sort mode. Returns an array of { memberId, groupKey, subKey, eliminated }, in
// final display order - flat leaderboard formats leave groupKey/subKey null
// throughout; KO Cup and Champions League set them to delineate match-ups/groups.
// A member can be both grouped (still paired with their opponent for a round
// that's already been decided, or for a projected not-yet-played round) AND
// eliminated (they lost an earlier round) at the same time - eliminated only
// forces someone out of any grouping, to the flat bottom section, once they no
// longer appear in the bracket/group at all.
//
// Every branch here calls the same shared lib function the format's own page
// uses (computeLeaderboardRows / computeMvpRows / computeNightPremState /
// computeEliminatorState / simulateKoCup / computeChampionsLeagueState) - there
// is no second copy of any format's scoring or window logic living here.
function buildOrdering({
  sortMode, members, roundsList, regularRoundsList, finalRoundsList,
  tipsByFixture, gameMultiplier, competition, selectedRound,
}) {
  const nameOf = id => members.find(m => m.id === id)?.display_name || ''
  const byName = (a, b) => nameOf(a).localeCompare(nameOf(b))

  function alphabetical() {
    return [...members]
      .sort((a, b) => byName(a.id, b.id))
      .map(m => ({ memberId: m.id, groupKey: null, subKey: null, eliminated: false }))
  }

  function flatByRows(rows) {
    const totals = Object.fromEntries(rows.map(r => [r.member.id, r.total]))
    return [...members]
      .sort((a, b) => (totals[b.id] || 0) - (totals[a.id] || 0))
      .map(m => ({ memberId: m.id, groupKey: null, subKey: null, eliminated: false }))
  }

  if (sortMode === 'gc') {
    return flatByRows(computeLeaderboardRows(members, roundsList, tipsByFixture, gameMultiplier))
  }

  if (sortMode === 'mvp') {
    // Regular season only - MVP votes don't cover finals, matching mvp/page.js
    return flatByRows(computeMvpRows(members, regularRoundsList, tipsByFixture, gameMultiplier))
  }

  if (sortMode === 'finals_leaderboard') {
    return flatByRows(computeLeaderboardRows(members, finalRoundsList, tipsByFixture, gameMultiplier))
  }

  if (sortMode === 'night_prem') {
    const regularCount = regularRoundsList.length
    const state = computeNightPremState({ members, roundsList, regularCount, tipsByFixture, gameMultiplier, competition })
    if (!state.hasStarted) return alphabetical()

    const qualified = [...state.rows]
      .sort((a, b) => b.total - a.total)
      .map(r => ({ memberId: r.member.id, groupKey: null, subKey: null, eliminated: false }))
    const notQualified = [...members]
      .filter(m => !state.qualifierIds.has(m.id))
      .sort((a, b) => byName(a.id, b.id))
      .map(m => ({ memberId: m.id, groupKey: null, subKey: null, eliminated: true }))
    return [...qualified, ...notQualified]
  }

  if (sortMode === 'eliminator') {
    const { startIdx, endIdx } = getEliminatorWindow(regularRoundsList, competition)
    const activeRoundsList = regularRoundsList.slice(startIdx, endIdx + 1)

    const { eliminatedAtRound, winnerId } = computeEliminatorState({ members, activeRoundsList, tipsByFixture, gameMultiplier })

    const winner = winnerId ? [{ memberId: winnerId, groupKey: null, subKey: null, eliminated: false }] : []
    const alive = [...members]
      .filter(m => m.id !== winnerId && !eliminatedAtRound[m.id])
      .sort((a, b) => byName(a.id, b.id))
      .map(m => ({ memberId: m.id, groupKey: null, subKey: null, eliminated: false }))
    const eliminated = [...members]
      .filter(m => m.id !== winnerId && eliminatedAtRound[m.id])
      .sort((a, b) => {
        const ia = activeRoundsList.findIndex(r => r.round_name === eliminatedAtRound[a.id])
        const ib = activeRoundsList.findIndex(r => r.round_name === eliminatedAtRound[b.id])
        return ib - ia
      })
      .map(m => ({ memberId: m.id, groupKey: null, subKey: null, eliminated: true }))
    return [...winner, ...alive, ...eliminated]
  }

  if (sortMode === 'ko_cup_1' || sortMode === 'ko_cup_2') {
    const N = members.length
    if (N <= 1) return alphabetical()

    const isCup2 = sortMode === 'ko_cup_2'
    const { k, startIdx: cupStartIdx } = getKoCupWindow(N, regularRoundsList, competition, isCup2)
    const { byesNeeded } = getKoCupSize(N)
    const cupRounds = regularRoundsList.slice(cupStartIdx, cupStartIdx + k)
    if (cupRounds.length < k) return alphabetical()

    const allIds = members.map(m => m.id)
    let byes
    if (isCup2) {
      const cup1Enabled = isFormatEnabled('ko_cup_1', competition)
      const cup1Byes = cup1Enabled ? pickByes(allIds, byesNeeded, `${competition.id}-kocup1-byes`) : new Set()
      byes = pickByes(allIds, byesNeeded, `${competition.id}-kocup2-byes`, [...cup1Byes])
    } else {
      byes = pickByes(allIds, byesNeeded, `${competition.id}-kocup1-byes`)
    }
    const seedBase = `${competition.id}-${isCup2 ? 'kocup2' : 'kocup1'}`
    const cup = simulateKoCup({ allIds, byesSet: byes, cupRoundsArr: cupRounds, seedBase, k, tipsByFixture, gameMultiplier })

    if ((!cup.rounds || cup.rounds.length === 0) && !cup.preview) return alphabetical()

    // Where the currently viewed round sits relative to this cup's own rounds -
    // a final round (not in regularRoundsList) counts as "after everything".
    let regIdx = regularRoundsList.findIndex(r => r.round_name === selectedRound)
    if (regIdx === -1) regIdx = regularRoundsList.length
    const targetIdx = regIdx - cupStartIdx

    // Who's lost, across every round actually simulated so far
    const eliminatedAt = {}
    cup.rounds.forEach((rnd, i) => {
      rnd.matches.forEach(m => {
        const loser = m.winner === m.a ? m.b : m.winner === m.b ? m.a : null
        if (loser != null) eliminatedAt[loser] = i
      })
    })

    // Show whichever round's pairing is actually relevant to the round being
    // viewed: an already-decided round shows its real result; a not-yet-played
    // round shows the PROJECTED pairing from cup.preview.
    let currentRound
    if (targetIdx >= 0 && targetIdx < cup.rounds.length) {
      currentRound = cup.rounds[targetIdx]
    } else if (cup.preview) {
      currentRound = cup.preview
    } else if (cup.rounds.length > 0) {
      currentRound = cup.rounds[cup.rounds.length - 1]
    } else {
      return alphabetical()
    }

    const ordering = []
    let groupIdx = 0
    currentRound.matches.forEach(m => {
      ordering.push({ memberId: m.a, groupKey: groupIdx, subKey: groupIdx, eliminated: eliminatedAt[m.a] != null })
      ordering.push({ memberId: m.b, groupKey: groupIdx, subKey: groupIdx, eliminated: eliminatedAt[m.b] != null })
      groupIdx++
    })
    currentRound.byesThisRound.forEach(id => {
      ordering.push({ memberId: id, groupKey: groupIdx, subKey: groupIdx, eliminated: eliminatedAt[id] != null })
      groupIdx++
    })

    const placedIds = new Set(ordering.map(o => o.memberId))
    const eliminatedOrdering = [...members]
      .filter(m => !placedIds.has(m.id))
      .sort((a, b) => (eliminatedAt[b.id] ?? -1) - (eliminatedAt[a.id] ?? -1))
      .map(m => ({ memberId: m.id, groupKey: null, subKey: null, eliminated: true }))

    return [...ordering, ...eliminatedOrdering]
  }

  if (sortMode === 'champions_league') {
    const cl = computeChampionsLeagueState({ members, roundsList: regularRoundsList, tipsByFixture, gameMultiplier, competition })
    if (!cl.qualConfig || cl.notEnoughRounds) return alphabetical()

    const { groupRounds, qfRounds, sfRounds, gfRounds, groupResults, knockoutField, qf, sf, gf } = cl

    let regIdx = regularRoundsList.findIndex(r => r.round_name === selectedRound)
    if (regIdx === -1) regIdx = regularRoundsList.length
    const clStartRegIdx = regularRoundsList.findIndex(r => r.round_name === groupRounds[0]?.round_name)

    const isSfRound = sfRounds.some(r => r.round_name === selectedRound)
    const isQfRound = qfRounds.some(r => r.round_name === selectedRound)
    const gfIdx = gfRounds.length ? regularRoundsList.findIndex(r => r.round_name === gfRounds[0].round_name) : -1
    const isGfRound = gfRounds.some(r => r.round_name === selectedRound)
    const isPostGf = gfIdx >= 0 && regIdx > gfIdx

    const ordering = []
    const placed = new Set()
    let groupIdx = 0

    function pushPair(a, b) {
      ordering.push({ memberId: a, groupKey: groupIdx, subKey: groupIdx, eliminated: false })
      ordering.push({ memberId: b, groupKey: groupIdx, subKey: groupIdx, eliminated: false })
      placed.add(a); placed.add(b)
      groupIdx++
    }

    if (isGfRound || isPostGf) {
      if (gf) pushPair(gf.a, gf.b)
      else if (sf) sf.forEach(m => pushPair(m.a, m.b))
      else if (qf) qf.forEach(m => pushPair(m.a, m.b))
    } else if (isSfRound) {
      if (sf) sf.forEach(m => pushPair(m.a, m.b))
      else if (qf) qf.forEach(m => pushPair(m.a, m.b))
    } else if (isQfRound && knockoutField.length === 8) {
      if (qf) qf.forEach(m => pushPair(m.a, m.b))
    }

    if (ordering.length === 0) {
      // Group stage (or before it starts, or knockout field not yet known) -
      // whole group together, with the current round's specific pairing
      // delineated by a thin sub-boundary.
      const roundIdxInGroup = Math.max(0, Math.min(regIdx - clStartRegIdx, 5))
      groupResults.forEach((g, gi) => {
        const pairsThisRound = g.schedule?.[roundIdxInGroup] || []
        let subIdx = 0
        pairsThisRound.forEach(([a, b]) => {
          ordering.push({ memberId: a, groupKey: gi, subKey: `${gi}-${subIdx}`, eliminated: false })
          ordering.push({ memberId: b, groupKey: gi, subKey: `${gi}-${subIdx}`, eliminated: false })
          placed.add(a); placed.add(b)
          subIdx++
        })
        g.groupIds.forEach(id => {
          if (!placed.has(id)) {
            ordering.push({ memberId: id, groupKey: gi, subKey: `${gi}-${subIdx}`, eliminated: false })
            placed.add(id)
          }
        })
      })
    }

    const eliminatedOrdering = [...members]
      .filter(m => !placed.has(m.id))
      .sort((a, b) => byName(a.id, b.id))
      .map(m => ({ memberId: m.id, groupKey: null, subKey: null, eliminated: true }))

    return [...ordering, ...eliminatedOrdering]
  }

  return alphabetical()
}

export default function RoundResultsPage() {
  const { slug } = useParams()
  const supabase = createClient()

  const [competition, setCompetition] = useState(null)
  const [member, setMember] = useState(null)
  const [members, setMembers] = useState([])
  const [fixture, setFixture] = useState([])
  const [tipsByFixture, setTipsByFixture] = useState({})
  const [selectedRound, setSelectedRound] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState('name')
  const [formatSort, setFormatSort] = useState('round')
  const [showMyTips, setShowMyTips] = useState(false)

  useEffect(() => {
    init()
  }, [slug])

  async function init() {
    const { data: comp } = await supabase
      .from('competitions')
      .select('*')
      .eq('slug', slug)
      .single()
    if (!comp) { setLoading(false); return }
    setCompetition(comp)

    const { data: { user } } = await supabase.auth.getUser()

    const { data: mems } = await supabase
      .from('members')
      .select('*')
      .eq('comp_id', comp.id)
    setMembers(mems || [])

    if (user) {
      const mine = (mems || []).find(m => m.user_id === user.id)
      setMember(mine || null)
    }

    const { data: fx } = await supabase
      .from('season_fixtures')
      .select('*')
      .eq('season_id', comp.season_id)
      .order('sequence', { ascending: true })
    const fixtureList = fx || []
    setFixture(fixtureList)

    if (fixtureList.length > 0) {
      const initRoundsMap = {}
      fixtureList.forEach(g => {
        if (!initRoundsMap[g.sequence]) initRoundsMap[g.sequence] = { round_name: g.round_name, games: [] }
        initRoundsMap[g.sequence].games.push(g)
      })
      const sequencesAsc = Object.keys(initRoundsMap).map(Number).sort((a, b) => a - b)
      const initRoundsList = sequencesAsc.map(seq => initRoundsMap[seq])
      const targetIdx = getCurrentRoundIndex(initRoundsList)
      setSelectedRound(targetIdx >= 0 ? initRoundsList[targetIdx].round_name : null)

      // Scoped to this comp's own members - season_fixtures is shared across every
      // competition on this season, so without the member_id filter this pulls in
      // tips from every other comp's members tipping the same season too.
      const { data: tp } = await supabase
        .from('tips')
        .select('*')
        .in('fixture_id', fixtureList.map(g => g.id))
        .in('member_id', (mems || []).map(m => m.id))
      const map = {}
      ;(tp || []).forEach(t => {
        if (!map[t.fixture_id]) map[t.fixture_id] = []
        map[t.fixture_id].push(t)
      })
      setTipsByFixture(map)
    }

    setLoading(false)
  }

  if (loading) return <p className="p-8">Loading...</p>
  if (!competition) return <p className="p-8">Competition not found.</p>

  const roundsMap = {}
  for (const g of fixture) {
    const key = g.sequence
    if (!roundsMap[key]) {
      roundsMap[key] = { round_name: g.round_name, round_type: g.round_type, games: [] }
    }
    roundsMap[key].games.push(g)
  }
  const roundsList = Object.values(roundsMap)
  const regularRoundsList = roundsList.filter(r => r.round_type === 'regular')
  const finalRoundsList = roundsList.filter(r => r.round_type === 'final')

  const currentRound = roundsList.find(r => r.round_name === selectedRound)
  const games = currentRound ? currentRound.games : []
  const now = new Date()
  const confValues = getConfValues(games.length)

  // Correct-pick count per game (drives the multiplier) - gated on `completed`,
  // not `result`, so a drawn game (completed, no winner) is still treated as resolved.
  const gameCorrectCount = games.map(g => {
    if (!g.completed) return 0
    const gameTips = tipsByFixture[g.id] || []
    return gameTips.filter(t => t.pick === g.result).length
  })
  const gameMultiplier = games.map((g, i) =>
    g.completed ? getMultiplier(gameCorrectCount[i], competition.scoring_config) : 1
  )

  const rows = members.map(m => {
    let won = 0
    let lost = 0
    const usedConf = new Set()

    const cells = games.map((g, i) => {
      const gameTips = tipsByFixture[g.id] || []
      const t = gameTips.find(x => x.member_id === m.id)
      const started = new Date(g.start_time) <= now
      if (t && t.confidence != null) usedConf.add(t.confidence)

      const isMe = member?.id === m.id
      const revealMine = isMe && !started && showMyTips
      const visible = started || revealMine

      if (!visible) return { hidden: true }

      const pick = t?.pick || null
      const conf = t?.confidence ?? null
      const isDraw = g.completed && !g.result
      const correct = !!(g.result && pick === g.result)
      // A draw counts the same as a wrong pick - the confidence spent is lost either way
      const wrong = !!(pick && ((g.result && pick !== g.result) || isDraw))
      const pts = correct && conf != null ? conf * gameMultiplier[i] : null

      if (correct && conf != null) won += conf * gameMultiplier[i]
      if (wrong && conf != null) lost += conf

      return { hidden: false, pick, conf, correct, wrong, isDraw, pts }
    })

    const remaining = confValues.filter(v => !usedConf.has(v))

    return { member: m, cells, won, lost, remaining }
  })

  // Season-wide multiplier per game, used only for the format sort/group
  // calculations below - separate from `gameMultiplier` above, which is an
  // array scoped to just the currently displayed round's cells.
  const seasonGameMultiplier = computeGameMultipliers(fixture, tipsByFixture, competition.scoring_config)

  const formatOptions = [{ key: 'round', label: 'This Round' }]
  formatOptions.push({ key: 'gc', label: getFormatLabel('leaderboard', competition) })
  if (isFormatEnabled('mvp', competition)) formatOptions.push({ key: 'mvp', label: getFormatLabel('mvp', competition) })
  if (isFormatEnabled('finals_leaderboard', competition)) formatOptions.push({ key: 'finals_leaderboard', label: getFormatLabel('finals_leaderboard', competition) })
  if (isFormatEnabled('eliminator', competition)) formatOptions.push({ key: 'eliminator', label: getFormatLabel('eliminator', competition) })
  if (isFormatEnabled('ko_cup_1', competition)) formatOptions.push({ key: 'ko_cup_1', label: getFormatLabel('ko_cup_1', competition) })
  if (isFormatEnabled('ko_cup_2', competition)) formatOptions.push({ key: 'ko_cup_2', label: getFormatLabel('ko_cup_2', competition) })
  if (isFormatEnabled('champions_league', competition)) formatOptions.push({ key: 'champions_league', label: getFormatLabel('champions_league', competition) })
  if (isFormatEnabled('night_prem', competition)) formatOptions.push({ key: 'night_prem', label: getFormatLabel('night_prem', competition) })

  // Grey out (disable) any sort option that has nothing meaningful to show for
  // the round currently being viewed - e.g. MVP once you're browsing a finals
  // round, or a side comp that hasn't reached its start window yet. Formats an
  // admin has turned off in Settings never make it into formatOptions at all
  // (the isFormatEnabled checks above), so they're not just greyed - removed.
  const formatOptionsWithState = formatOptions.map(opt => ({
    ...opt,
    disabled: opt.key !== 'round' && !isFormatActiveForRound(opt.key, {
      members, roundsList, regularRoundsList, competition, selectedRound,
    }),
  }))

  const ordering = buildOrdering({
    sortMode: formatSort, members, roundsList, regularRoundsList, finalRoundsList,
    tipsByFixture, gameMultiplier: seasonGameMultiplier, competition, selectedRound,
  })
  const orderIndex = new Map(ordering.map((o, i) => [o.memberId, i]))
  const groupKeyByMember = new Map(ordering.map(o => [o.memberId, o.groupKey]))
  const subKeyByMember = new Map(ordering.map(o => [o.memberId, o.subKey]))
  const eliminatedByMember = new Map(ordering.map(o => [o.memberId, o.eliminated]))

  const sortedRows = formatSort === 'round'
    ? [...rows].sort((a, b) => {
        if (sortBy === 'won') return b.won - a.won
        if (sortBy === 'lost') return b.lost - a.lost
        return a.member.display_name.localeCompare(b.member.display_name)
      })
    : [...rows].sort((a, b) => (orderIndex.get(a.member.id) ?? 9999) - (orderIndex.get(b.member.id) ?? 9999))

  function toggleSort(key) {
    setFormatSort('round')
    setSortBy(sortBy === key ? 'name' : key)
  }

  return (
    <div className="flex flex-col items-center min-h-screen gap-3 px-4 pt-8 pb-24">
      <h1 className="text-2xl font-semibold">{competition.name}</h1>
      <p className="text-sm text-zinc-500">Round Results</p>

      <BottomTabBar slug={slug} />
      <RoundSelector roundsList={roundsList} selectedRound={selectedRound} onChange={setSelectedRound} />

      <select
        value={formatSort}
        onChange={e => setFormatSort(e.target.value)}
        className="border rounded px-3 py-1.5 text-sm w-full max-w-xs bg-white"
      >
        {formatOptionsWithState.map(opt => (
          <option key={opt.key} value={opt.key} disabled={opt.disabled}>
            Sort by: {opt.label}{opt.disabled ? ' (not in progress)' : ''}
          </option>
        ))}
      </select>

      <button
        onClick={() => setShowMyTips(v => !v)}
        className={`text-xs border rounded px-3 py-1 mb-1 ${
          showMyTips ? 'border-green-600 text-green-700 bg-green-50' : 'text-zinc-600'
        }`}
      >
        {showMyTips ? '👁 My tips visible' : '👁 Show my tips'}
      </button>

      <div className="w-full overflow-x-auto">
        <table className="text-xs mx-auto" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr>
              <th className="sticky left-0 bg-white border px-2 py-1 text-left">Tipster</th>
              {games.map(g => {
                const isDraw = g.completed && !g.result
                return (
                  <th key={g.id} className="border px-1 py-1 text-center min-w-[60px]">
                    {!g.result && (
                      <div className={`font-semibold ${isDraw ? 'text-amber-600' : 'text-zinc-500'}`}>
                        {isDraw ? 'Draw' : new Date(g.start_time).toLocaleDateString()}
                      </div>
                    )}
                    <div className={g.result === g.home ? 'text-green-700 font-semibold' : 'text-zinc-500'}>
                      {g.home.slice(0, 6)}
                    </div>
                    <div className={g.result === g.away ? 'text-green-700 font-semibold' : 'text-zinc-400'}>
                      {g.away.slice(0, 6)}
                    </div>
                  </th>
                )
              })}
              <th
                onClick={() => toggleSort('won')}
                className={`border px-2 py-1 cursor-pointer bg-zinc-50 ${formatSort === 'round' && sortBy === 'won' ? 'text-green-700' : ''}`}
              >
                W{formatSort === 'round' && sortBy === 'won' ? ' ▾' : ''}
              </th>
              <th
                onClick={() => toggleSort('lost')}
                className={`border px-2 py-1 cursor-pointer bg-zinc-50 ${formatSort === 'round' && sortBy === 'lost' ? 'text-red-600' : ''}`}
              >
                L{formatSort === 'round' && sortBy === 'lost' ? ' ▾' : ''}
              </th>
              <th className="border px-2 py-1 bg-zinc-50">Left</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, idx) => {
              const isMe = member?.id === row.member.id
              const eliminated = formatSort !== 'round' && !!eliminatedByMember.get(row.member.id)
              const groupKey = formatSort !== 'round' ? groupKeyByMember.get(row.member.id) : null
              const subKey = formatSort !== 'round' ? subKeyByMember.get(row.member.id) : null
              const isCL = formatSort === 'champions_league'

              const prevRow = sortedRows[idx - 1]
              const prevGroupKey = prevRow ? groupKeyByMember.get(prevRow.member.id) : null
              const prevSubKey = prevRow ? subKeyByMember.get(prevRow.member.id) : null
              const sameGroupAsPrev = groupKey != null && groupKey === prevGroupKey

              const newGroupBoundary = groupKey != null && groupKey !== prevGroupKey
              const enteringFlatEliminatedBlock = eliminated && groupKey == null && !(prevRow && eliminatedByMember.get(prevRow.member.id) && groupKeyByMember.get(prevRow.member.id) == null)
              const newSubBoundary = sameGroupAsPrev && subKey != null && subKey !== prevSubKey

              const clPalette = isCL && !eliminated && groupKey != null ? CL_GROUP_PALETTE[groupKey % CL_GROUP_PALETTE.length] : null
              const clSubIdx = clPalette && typeof subKey === 'string' ? parseInt(subKey.split('-')[1] || '0', 10) : 0

              const tint = eliminated
                ? '#fafafa'
                : clPalette
                  ? (clSubIdx % 2 === 0 ? clPalette.bg : clPalette.bgAlt)
                  : groupKey != null
                    ? (groupKey % 2 === 0 ? '#ffffff' : '#eef2ff')
                    : (idx % 2 === 1 ? '#fafafa' : '#ffffff')

              const rowStyle = { background: tint }
              if (clPalette && (newGroupBoundary || newSubBoundary)) {
                rowStyle.borderTop = `${newGroupBoundary ? 3 : 1.5}px solid ${clPalette.border}`
              }

              const rowBorderClass = clPalette
                ? ''
                : (newGroupBoundary || enteringFlatEliminatedBlock)
                  ? 'border-t-2 border-zinc-300'
                  : newSubBoundary
                    ? 'border-t border-dashed border-zinc-300'
                    : ''

              const stickyStyle = { background: isMe ? '#eff6ff' : tint }
              if (clPalette) stickyStyle.borderLeft = `4px solid ${clPalette.border}`

              return (
                <tr key={row.member.id} className={`${eliminated ? 'opacity-60' : ''} ${rowBorderClass}`} style={rowStyle}>
                  <td
                    className={`sticky left-0 border px-2 py-1 font-medium ${isMe ? 'text-blue-700' : eliminated ? 'text-zinc-400' : ''}`}
                    style={stickyStyle}
                  >
                    {row.member.display_name}{isMe ? ' ✦' : ''}
                  </td>
                  {row.cells.map((c, i) => {
                    if (c.hidden || !c.pick) {
                      return <td key={i} className="border px-1 py-1 text-center text-zinc-300">—</td>
                    }
                    const bg = c.correct ? 'bg-green-50' : c.wrong ? 'bg-red-50' : ''
                    return (
                      <td key={i} className={`border px-1 py-1 text-center ${bg}`}>
                        <div className="font-medium">{c.pick.slice(0, 5)}</div>
                        <div className="text-zinc-500">
                          {c.conf ?? '?'}
                          {c.pts !== null && (
                            <span className={c.correct ? 'text-green-700 font-semibold' : 'text-red-600'}>
                              {' / '}{c.pts}
                            </span>
                          )}
                          {c.isDraw && <span className="text-amber-600"> / draw</span>}
                        </div>
                      </td>
                    )
                  })}
                  <td className="border px-2 py-1 text-center font-semibold text-green-700 bg-zinc-50">
                    {row.won || '—'}
                  </td>
                  <td className="border px-2 py-1 text-center text-red-600 bg-zinc-50">
                    {row.lost > 0 ? `-${row.lost}` : '—'}
                  </td>
                  <td className="border px-1 py-1 bg-zinc-50">
                    <div className="flex flex-wrap gap-0.5 justify-center max-w-[80px]">
                      {row.remaining.map(c => (
                        <span key={c} className="border rounded px-1 text-[10px] text-zinc-500">{c}</span>
                      ))}
                      {row.remaining.length === 0 && <span className="text-green-600">✓</span>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {games.length === 0 && (
        <p className="text-sm text-zinc-500 mt-4">No games found for this round.</p>
      )}
    </div>
  )
}