'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import BottomTabBar from '@/components/BottomTabBar'
import { getFormatLabel } from '@/lib/formatConfig'
import { shortRoundLabel } from '@/lib/roundLabels'
import { computeGameMultipliers } from '@/lib/tipScoring'
import { computeLeaderboardRows } from '@/lib/leaderboard'

const COL_RANK = 32
const COL_NAME = 120
const COL_TOTAL = 56
const FROZEN_WIDTH = COL_RANK + COL_NAME + COL_TOTAL
const COL_ROUND = 52

const MEDALS = ['🥇', '🥈', '🥉']

export default function LeaderboardPage() {
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

  const roundsMap = {}
  for (const g of fixture) {
    const key = g.sequence
    if (!roundsMap[key]) {
      roundsMap[key] = { round_name: g.round_name, round_type: g.round_type, games: [] }
    }
    roundsMap[key].games.push(g)
  }
  const roundsList = Object.values(roundsMap)
  const gameMultiplier = computeGameMultipliers(fixture, tipsByFixture, competition.scoring_config)

  const rows = computeLeaderboardRows(members, roundsList, tipsByFixture, gameMultiplier)
  const sorted = [...rows].sort((a, b) => b.total - a.total)
  const nameLeft = COL_RANK
  const totalLeft = COL_RANK + COL_NAME

  return (
    <div className="flex flex-col items-center min-h-screen gap-3 px-4 pt-8 pb-24">
      <h1 className="text-2xl font-semibold">{competition.name}</h1>
      <p className="text-sm text-zinc-500">{getFormatLabel('leaderboard', competition)}</p>

      <BottomTabBar slug={slug} />

      {roundsList.length > 0 && (
        <p className="text-xs text-zinc-500 text-center">
          All rounds · {roundsList[0].round_name} → {roundsList[roundsList.length - 1].round_name}
        </p>
      )}

      <div className="w-full max-w-full rounded-lg border border-zinc-200 shadow-sm overflow-hidden mt-2">
        <div className="overflow-x-auto">
          <table style={{ tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }} className="text-xs">
            <colgroup>
              <col style={{ width: FROZEN_WIDTH }} />
              {roundsList.map(r => (
                <col key={r.round_name} style={{ width: COL_ROUND }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="sticky left-0 z-20 p-0" style={{ boxShadow: '3px 0 6px -2px rgba(0,0,0,0.25)' }}>
                  <div className="flex bg-zinc-900 text-white">
                    <div style={{ width: COL_RANK }} className="px-1 py-2 text-center font-semibold">#</div>
                    <div style={{ width: COL_NAME }} className="px-2 py-2 font-semibold border-l border-zinc-700">Tipster</div>
                    <div style={{ width: COL_TOTAL }} className="px-1 py-2 text-center font-semibold border-l border-zinc-700">Total</div>
                  </div>
                </th>
                {roundsList.map(r => (
                  <th key={r.round_name} className="bg-zinc-900 text-white px-1 py-2 text-center font-semibold whitespace-nowrap overflow-hidden border-l border-zinc-700">
                    {shortRoundLabel(r.round_name)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => {
                const isMe = member?.id === row.member.id
                const stripe = i % 2 === 1 ? '#fafafa' : '#ffffff'
                const bg = isMe ? '#eff6ff' : stripe
                return (
                  <tr key={row.member.id}>
                    <td className="sticky left-0 z-20 p-0" style={{ boxShadow: '3px 0 6px -2px rgba(0,0,0,0.15)' }}>
                      <div className="flex items-center border-b border-zinc-100" style={{ background: bg }}>
                        <div style={{ width: COL_RANK }} className="px-1 py-2 text-center">
                          {i < 3 ? MEDALS[i] : i + 1}
                        </div>
                        <div
                          style={{ width: COL_NAME }}
                          className={`px-2 py-2 font-medium truncate border-l border-zinc-100 ${isMe ? 'text-blue-700' : 'text-zinc-800'}`}
                        >
                          {row.member.display_name}{isMe ? ' ✦' : ''}
                        </div>
                        <div style={{ width: COL_TOTAL }} className="px-1 py-2 text-center font-bold text-emerald-600 border-l border-zinc-100">
                          {row.total}
                        </div>
                      </div>
                    </td>
                    {row.roundScores.map(rs => (
                      <td
                        key={rs.round_name}
                        className={`px-1 py-2 text-center border-b border-l border-zinc-100 ${!rs.anyResolved ? 'text-zinc-300' : rs.pts > 0 ? 'text-emerald-600 font-medium' : 'text-zinc-400'}`}
                        style={{ background: bg }}
                      >
                        {rs.anyResolved ? rs.pts : '—'}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {roundsList.length === 0 && (
        <p className="text-sm text-zinc-500 mt-4">No fixture found for this season.</p>
      )}
    </div>
  )
}