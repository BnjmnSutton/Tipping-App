'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import BottomTabBar from '@/components/BottomTabBar'
import { getFormatLabel, isFormatEnabled } from '@/lib/formatConfig'
import { computeGameMultipliers } from '@/lib/tipScoring'
import { computeChampionsLeagueState } from '@/lib/championsLeague'

const GROUP_COLORS = ['bg-emerald-600', 'bg-blue-600', 'bg-amber-500', 'bg-purple-600', 'bg-rose-500', 'bg-cyan-600', 'bg-indigo-600', 'bg-lime-600']

export default function ChampionsLeaguePage() {
  const { slug } = useParams()
  const supabase = createClient()

  const [competition, setCompetition] = useState(null)
  const [member, setMember] = useState(null)
  const [members, setMembers] = useState([])
  const [fixture, setFixture] = useState([])
  const [tipsByFixture, setTipsByFixture] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => { init() }, [slug])

  async function init() {
    const { data: comp } = await supabase.from('competitions').select('*').eq('slug', slug).single()
    if (!comp) { setLoading(false); return }
    setCompetition(comp)

    const { data: { user } } = await supabase.auth.getUser()

    const { data: mems } = await supabase.from('members').select('*').eq('comp_id', comp.id)
    setMembers(mems || [])
    if (user) setMember((mems || []).find(m => m.user_id === user.id) || null)

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
  if (!isFormatEnabled('champions_league', competition)) {
    return <p className="p-8">{getFormatLabel('champions_league', competition)} isn&apos;t enabled for this competition.</p>
  }

  const roundsMap = {}
  for (const g of fixture) {
    const key = g.sequence
    if (!roundsMap[key]) roundsMap[key] = { round_name: g.round_name, games: [] }
    roundsMap[key].games.push(g)
  }
  const roundsList = Object.values(roundsMap)
  const gameMultiplier = computeGameMultipliers(fixture, tipsByFixture, competition.scoring_config)

  const N = members.length

  const cl = computeChampionsLeagueState({ members, roundsList, tipsByFixture, gameMultiplier, competition })

  if (!cl.qualConfig) {
    return (
      <div className="flex flex-col items-center min-h-screen gap-3 px-4 pt-8 pb-24">
        <h1 className="text-2xl font-semibold">{competition.name}</h1>
        <p className="text-sm text-zinc-500">{getFormatLabel('champions_league', competition)}</p>
        <BottomTabBar slug={slug} />
        <p className="text-sm text-zinc-500 mt-4">Need at least 12 members for Champions League ({N} currently).</p>
      </div>
    )
  }
  const { qualifyingCount, size: groupSize, groupCount } = cl.qualConfig

  if (cl.notEnoughRounds) {
    return (
      <div className="flex flex-col items-center min-h-screen gap-3 px-4 pt-8 pb-24">
        <h1 className="text-2xl font-semibold">{competition.name}</h1>
        <p className="text-sm text-zinc-500">{getFormatLabel('champions_league', competition)}</p>
        <BottomTabBar slug={slug} />
        <p className="text-sm text-red-500 mt-4">Not enough regular-season rounds ({cl.R}) for Champions League ({cl.CL_LEN} needed).</p>
      </div>
    )
  }

  const { groupRounds, qfRounds, sfRounds, gfRounds, groupResults, groupStageComplete, luckyLosers, knockoutField, qf, sf, gf } = cl
  const nameFor = id => members.find(m => m.id === id)?.display_name || '?'
  const K = Math.floor(8 / groupCount)

  function renderTie(m, key) {
    const decided = !!m.result
    return (
      <div key={key} className="rounded overflow-hidden border border-zinc-200 text-xs">
        <div className={`flex justify-between items-center px-2 py-1.5 ${
          decided ? (m.result.winner === m.a ? 'bg-green-50 text-green-700 font-semibold' : 'bg-red-50 text-red-500') : 'bg-zinc-50 text-zinc-600'
        }`}>
          <span className="truncate">{nameFor(m.a)}</span>
          {decided && <span className="ml-1">{m.result.scoreA}</span>}
        </div>
        <div className={`flex justify-between items-center px-2 py-1.5 border-t border-zinc-100 ${
          decided ? (m.result.winner === m.b ? 'bg-green-50 text-green-700 font-semibold' : 'bg-red-50 text-red-500') : 'bg-zinc-50 text-zinc-600'
        }`}>
          <span className="truncate">{nameFor(m.b)}</span>
          {decided && <span className="ml-1">{m.result.scoreB}</span>}
        </div>
        {decided && m.result.legs && (
          <p className="text-[9px] text-zinc-400 px-2 py-0.5 border-t border-zinc-100">
            {m.result.legs.map(l => `${l.round_name.replace('Round ', 'Rd')}: ${l.scoreA}/${l.scoreB}`).join('  ')}
          </p>
        )}
        {decided && m.result.tiebreak && (
          <p className="text-[9px] text-amber-600 px-2 py-0.5 bg-amber-50 border-t border-amber-100">Tied - {m.result.tiebreak}</p>
        )}
      </div>
    )
  }

  function renderTbd(key) {
    return (
      <div key={key} className="rounded border border-dashed border-zinc-200 text-xs text-zinc-300">
        <div className="px-2 py-1.5">TBD</div>
        <div className="px-2 py-1.5 border-t border-dashed border-zinc-200">TBD</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center min-h-screen gap-3 px-4 pt-8 pb-24">
      <h1 className="text-2xl font-semibold">{competition.name}</h1>
      <p className="text-sm text-zinc-500">{getFormatLabel('champions_league', competition)}</p>
      <BottomTabBar slug={slug} />

      <p className="text-xs text-zinc-500 text-center">
        Top {qualifyingCount} of {N} qualify ({groupCount} groups of {groupSize}) · {groupRounds[0]?.round_name} → {gfRounds[0]?.round_name || sfRounds[sfRounds.length - 1]?.round_name}
      </p>

      {gf?.result && (
        <p className="text-sm text-center text-zinc-600">
          {getFormatLabel('champions_league', competition)} champion: <span className="font-semibold text-amber-600">🏆 {nameFor(gf.result.winner)}</span>
        </p>
      )}

      <div className="w-full flex flex-col gap-4">
        {groupResults.map((g, gi) => (
          <div key={gi} className="rounded-lg border border-zinc-200 shadow-sm overflow-hidden">
            <div className={`flex items-center gap-2 px-3 py-2 text-white ${GROUP_COLORS[gi % GROUP_COLORS.length]}`}>
              <span className="w-5 h-5 rounded-full bg-white/25 flex items-center justify-center text-xs font-bold shrink-0">
                {String.fromCharCode(65 + gi)}
              </span>
              <span className="text-sm font-semibold">Group {String.fromCharCode(65 + gi)}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr className="bg-zinc-50 text-zinc-500">
                    <th className="text-left px-2 py-1.5 font-medium">Tipster</th>
                    <th className="px-1.5 py-1.5 font-medium">P</th>
                    <th className="px-1.5 py-1.5 font-medium">W</th>
                    <th className="px-1.5 py-1.5 font-medium">D</th>
                    <th className="px-1.5 py-1.5 font-medium">L</th>
                    <th className="px-1.5 py-1.5 font-medium">PF</th>
                    <th className="px-1.5 py-1.5 font-medium">PA</th>
                    <th className="px-1.5 py-1.5 font-medium">%</th>
                    <th className="px-1.5 py-1.5 font-medium">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {g.standings.map((id, i) => {
                    const qualified = groupStageComplete && i < K
                    const isLucky = luckyLosers.includes(id)
                    const pctVal = g.pct(id)
                    const played = g.wins[id] + g.draws[id] + g.losses[id]
                    const isMe = member?.id === id
                    return (
                      <tr key={id} className={`border-t border-zinc-100 ${qualified || isLucky ? 'bg-green-50/60' : ''}`}>
                        <td className={`px-2 py-1.5 truncate max-w-[90px] ${isMe ? 'font-semibold text-blue-700' : ''}`}>
                          {nameFor(id)}{isMe ? ' ✦' : ''}{isLucky ? ' *' : ''}
                        </td>
                        <td className="text-center px-1.5 py-1.5">{played}</td>
                        <td className="text-center px-1.5 py-1.5">{g.wins[id]}</td>
                        <td className="text-center px-1.5 py-1.5">{g.draws[id]}</td>
                        <td className="text-center px-1.5 py-1.5">{g.losses[id]}</td>
                        <td className="text-center px-1.5 py-1.5">{g.pointsFor[id]}</td>
                        <td className="text-center px-1.5 py-1.5">{g.pointsAgainst[id]}</td>
                        <td className="text-center px-1.5 py-1.5">{pctVal === Infinity ? '∞' : pctVal.toFixed(1)}</td>
                        <td className="text-center px-1.5 py-1.5 font-semibold">{g.matchPoints[id]}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {luckyLosers.some(id => g.groupIds.includes(id)) && (
              <p className="text-[9px] text-zinc-400 px-3 pt-1.5">* lucky loser - qualified as a best-of-the-rest, not by group position</p>
            )}

            <div className="px-3 py-2 border-t border-zinc-100 flex flex-col gap-1">
              <p className="text-[10px] font-semibold text-zinc-400 mb-0.5">Fixtures</p>
              {groupRounds.map((rMeta, ri) => {
                const playedRound = g.roundsPlayed.find(rp => rp.round_name === rMeta.round_name)
                const pairs = playedRound
                  ? playedRound.matches
                  : (g.schedule[ri] || []).map(([a, b]) => ({ a, b, scoreA: null, scoreB: null }))
                return pairs.map((m, mi) => (
                  <div key={`${ri}-${mi}`} className="flex items-center gap-2 text-xs">
                    <span className="text-zinc-400 w-9 shrink-0">{rMeta.round_name.replace('Round ', 'Rd')}</span>
                    <span className={`flex-1 text-right truncate ${playedRound ? (m.scoreA > m.scoreB ? 'text-green-700 font-medium' : 'text-zinc-500') : 'text-zinc-400'}`}>
                      {nameFor(m.a)}
                    </span>
                    <span className="text-zinc-300 shrink-0 w-14 text-center">
                      {playedRound ? `${m.scoreA} - ${m.scoreB}` : 'vs'}
                    </span>
                    <span className={`flex-1 truncate ${playedRound ? (m.scoreB > m.scoreA ? 'text-green-700 font-medium' : 'text-zinc-500') : 'text-zinc-400'}`}>
                      {nameFor(m.b)}
                    </span>
                  </div>
                ))
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="w-full flex flex-col gap-4 mt-2">
        <p className="text-xs font-semibold text-zinc-500 text-center">Knockout Stage</p>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-zinc-500 text-center">Quarter Finals</p>
          {knockoutField.length === 8 && qf
            ? qf.map((m, i) => renderTie(m, i))
            : Array.from({ length: 4 }).map((_, i) => renderTbd(i))}
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-zinc-500 text-center">Semi Finals</p>
          {sf
            ? sf.map((m, i) => renderTie(m, i))
            : Array.from({ length: 2 }).map((_, i) => renderTbd(i))}
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-zinc-500 text-center">Grand Final</p>
          {gf ? renderTie(gf, 'gf') : renderTbd('gf')}
        </div>
      </div>
    </div>
  )
}