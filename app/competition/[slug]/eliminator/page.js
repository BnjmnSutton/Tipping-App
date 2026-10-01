'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import BottomTabBar from '@/components/BottomTabBar'
import { getFormatLabel, isFormatEnabled } from '@/lib/formatConfig'
import { computeEliminatorState } from '@/lib/eliminator'

function getMultiplier(correctCount, scoringConfig) {
  if (!scoringConfig?.multiplier_enabled) return 1
  const thresholds = scoringConfig?.thresholds || {}
  return thresholds[String(correctCount)] ?? thresholds.default ?? 1
}

const COL_RANK = 32
const COL_NAME = 120
const COL_STATUS = 100
const FROZEN_WIDTH = COL_RANK + COL_NAME + COL_STATUS
const COL_ROUND = 52

export default function EliminatorPage() {
  const { slug } = useParams()
  const supabase = createClient()

  const [competition, setCompetition] = useState(null)
  const [member, setMember] = useState(null)
  const [members, setMembers] = useState([])
  const [fixture, setFixture] = useState([])
  const [tipsByFixture, setTipsByFixture] = useState({})
  const [loading, setLoading] = useState(true)

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

    if (comp.season_id) {
      const { data: fx } = await supabase
        .from('season_fixtures')
        .select('*')
        .eq('season_id', comp.season_id)
        .eq('round_type', 'regular')
        .order('sequence', { ascending: true })
      const fixtureList = fx || []
      setFixture(fixtureList)

      if (fixtureList.length > 0) {
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
    }

    setLoading(false)
  }

  if (loading) return <p className="p-8">Loading...</p>
  if (!competition) return <p className="p-8">Competition not found.</p>
  if (!isFormatEnabled('eliminator', competition)) {
    return <p className="p-8">{getFormatLabel('eliminator', competition)} isn&apos;t enabled for this competition.</p>
  }

  const roundsMap = {}
  for (const g of fixture) {
    const key = g.sequence
    if (!roundsMap[key]) {
      roundsMap[key] = { round_name: g.round_name, round_type: g.round_type, games: [] }
    }
    roundsMap[key].games.push(g)
  }
  const roundsList = Object.values(roundsMap)

  // Apply admin-configured start/end round overrides, if set
  const elimConfig = competition.format_config?.rounds?.eliminator || {}
  let startIdx = elimConfig.start ? roundsList.findIndex(r => r.round_name === elimConfig.start) : 0
  let endIdx = elimConfig.end ? roundsList.findIndex(r => r.round_name === elimConfig.end) : roundsList.length - 1
  if (startIdx < 0) startIdx = 0
  if (endIdx < 0) endIdx = roundsList.length - 1
  const activeRoundsList = roundsList.slice(startIdx, endIdx + 1)

  const gameMultiplier = {}
  fixture.forEach(g => {
    if (!g.completed) return
    const gameTips = tipsByFixture[g.id] || []
    const cc = gameTips.filter(t => t.pick === g.result).length
    gameMultiplier[g.id] = getMultiplier(cc, competition.scoring_config)
  })

  const { eliminatedAtRound, memberRoundScore, winnerId, processedRounds } = computeEliminatorState({
    members, activeRoundsList, tipsByFixture, gameMultiplier
  })

  const rows = members.map(m => {
    const isWinner = winnerId === m.id
    const eliminatedRound = eliminatedAtRound[m.id] || null
    const eliminatedIndex = eliminatedRound ? activeRoundsList.findIndex(r => r.round_name === eliminatedRound) : -1
    return { member: m, isWinner, eliminatedRound, eliminatedIndex, roundScores: memberRoundScore[m.id] }
  })

  const sorted = [...rows].sort((a, b) => {
    if (a.isWinner !== b.isWinner) return a.isWinner ? -1 : 1
    if (!a.eliminatedRound && !b.eliminatedRound) return a.member.display_name.localeCompare(b.member.display_name)
    if (!a.eliminatedRound) return -1
    if (!b.eliminatedRound) return 1
    return b.eliminatedIndex - a.eliminatedIndex
  })

  return (
    <div className="flex flex-col items-center min-h-screen gap-3 px-4 pt-8 pb-24">
      <h1 className="text-2xl font-semibold">{competition.name}</h1>
      <p className="text-sm text-zinc-500">{getFormatLabel('eliminator', competition)}</p>

      <BottomTabBar slug={slug} />

      {activeRoundsList.length > 0 && (
        <p className="text-xs text-zinc-500 text-center">
          {members.length} entrant{members.length !== 1 ? 's' : ''} · {activeRoundsList[0].round_name} → {activeRoundsList[activeRoundsList.length - 1].round_name}
        </p>
      )}

      {processedRounds.length === 0 ? (
        <p className="text-sm text-zinc-500 mt-4">No completed rounds yet.</p>
      ) : (
        <div className="w-full max-w-full rounded-lg border border-zinc-200 shadow-sm overflow-hidden mt-2">
          <div className="overflow-x-auto">
            <table style={{ tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }} className="text-xs">
              <colgroup>
                <col style={{ width: FROZEN_WIDTH }} />
                {processedRounds.map(r => (
                  <col key={r.round_name} style={{ width: COL_ROUND }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 p-0" style={{ boxShadow: '3px 0 6px -2px rgba(0,0,0,0.25)' }}>
                    <div className="flex bg-zinc-900 text-white">
                      <div style={{ width: COL_RANK }} className="px-1 py-2 text-center font-semibold">#</div>
                      <div style={{ width: COL_NAME }} className="px-2 py-2 font-semibold border-l border-zinc-700">Tipster</div>
                      <div style={{ width: COL_STATUS }} className="px-1 py-2 text-center font-semibold border-l border-zinc-700">Status</div>
                    </div>
                  </th>
                  {processedRounds.map(r => (
                    <th key={r.round_name} className="bg-zinc-900 text-white px-1 py-2 text-center font-semibold whitespace-nowrap overflow-hidden border-l border-zinc-700">
                      {r.round_name.replace('Round ', 'R')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => {
                  const isMe = member?.id === row.member.id
                  const stripe = i % 2 === 1 ? '#fafafa' : '#ffffff'
                  const bg = isMe ? '#eff6ff' : stripe
                  const statusLabel = row.isWinner ? '🏆 Winner' : row.eliminatedRound ? `Out (${row.eliminatedRound.replace('Round ', 'R')})` : 'Alive'
                  const statusColor = row.isWinner ? 'text-amber-600' : row.eliminatedRound ? 'text-red-500' : 'text-green-700'
                  return (
                    <tr key={row.member.id}>
                      <td className="sticky left-0 z-20 p-0" style={{ boxShadow: '3px 0 6px -2px rgba(0,0,0,0.15)' }}>
                        <div className="flex items-center border-b border-zinc-100" style={{ background: bg }}>
                          <div style={{ width: COL_RANK }} className="px-1 py-2 text-center">{i + 1}</div>
                          <div
                            style={{ width: COL_NAME }}
                            className={`px-2 py-2 font-medium truncate border-l border-zinc-100 ${isMe ? 'text-blue-700' : 'text-zinc-800'}`}
                          >
                            {row.member.display_name}{isMe ? ' ✦' : ''}
                          </div>
                          <div style={{ width: COL_STATUS }} className={`px-1 py-2 text-center font-semibold border-l border-zinc-100 whitespace-nowrap overflow-hidden ${statusColor}`}>
                            {statusLabel}
                          </div>
                        </div>
                      </td>
                      {processedRounds.map(r => {
                        const eliminatedThisRound = row.eliminatedRound === r.round_name
                        const score = row.roundScores[r.round_name]
                        const alreadyOut = row.eliminatedIndex !== -1 && activeRoundsList.findIndex(x => x.round_name === r.round_name) > row.eliminatedIndex
                        return (
                          <td
                            key={r.round_name}
                            className={`px-1 py-2 text-center border-b border-l border-zinc-100 ${eliminatedThisRound ? 'bg-red-50 text-red-600 font-semibold' : alreadyOut ? 'text-zinc-300' : 'text-zinc-700'}`}
                            style={{ background: eliminatedThisRound ? undefined : bg }}
                          >
                            {eliminatedThisRound ? 'OUT' : score != null ? score : alreadyOut ? '—' : ''}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}