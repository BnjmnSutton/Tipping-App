'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import BottomTabBar from '@/components/BottomTabBar'
import { computeGameMultipliers } from '@/lib/tipScoring'
import { getKoCupSize, pickByes, simulateKoCup } from '@/lib/koCup'
import { getFormatLabel, isFormatEnabled } from '@/lib/formatConfig'

function stageLabelFor(ri, k) {
  const remaining = k - ri
  if (remaining === 1) return 'Final'
  if (remaining === 2) return 'Semi Finals'
  if (remaining === 3) return 'Quarter Finals'
  return `Round of ${Math.pow(2, remaining)}`
}

export default function KoCup2Page() {
  const { slug } = useParams()
  const supabase = createClient()

  const [competition, setCompetition] = useState(null)
  const [members, setMembers] = useState([])
  const [fixture, setFixture] = useState([])
  const [tipsByFixture, setTipsByFixture] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => { init() }, [slug])

  async function init() {
    const { data: comp } = await supabase.from('competitions').select('*').eq('slug', slug).single()
    if (!comp) { setLoading(false); return }
    setCompetition(comp)

    const { data: mems } = await supabase.from('members').select('*').eq('comp_id', comp.id)
    setMembers(mems || [])

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
  if (!isFormatEnabled('ko_cup_2', competition)) {
    return <p className="p-8">{getFormatLabel('ko_cup_2', competition)} isn&apos;t enabled for this competition.</p>
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
  const R = roundsList.length
  const { k, byesNeeded } = getKoCupSize(N)

  let cup2StartIdx = Math.max(R - k, 0)
  let cup1StartIdx = Math.max(Math.floor(R / 2) - k, 0)
  if (cup1StartIdx + k > cup2StartIdx) cup1StartIdx = Math.max(0, cup2StartIdx - k)
  const cup2Override = competition.format_config?.rounds?.ko_cup_2?.start
  if (cup2Override) {
    const idx = roundsList.findIndex(r => r.round_name === cup2Override)
    if (idx >= 0) cup2StartIdx = idx
  }
  const cup2Rounds = roundsList.slice(cup2StartIdx, cup2StartIdx + k)

  const allIds = members.map(m => m.id)

  // Only exclude Cup 1's bye recipients if Cup 1 is actually enabled for this comp
  const cup1Enabled = isFormatEnabled('ko_cup_1', competition)
  const cup1Byes = cup1Enabled ? pickByes(allIds, byesNeeded, `${competition.id}-kocup1-byes`) : new Set()

  const seedBase = `${competition.id}-kocup2`
  const byes = pickByes(allIds, byesNeeded, `${seedBase}-byes`, [...cup1Byes])
  const nameFor = id => members.find(m => m.id === id)?.display_name || '?'
  const notEnoughRounds = cup2Rounds.length < k

  const cup = N > 1 && !notEnoughRounds ? simulateKoCup({ allIds, byesSet: byes, cupRoundsArr: cup2Rounds, seedBase, k, tipsByFixture, gameMultiplier }) : null

  return (
    <div className="flex flex-col items-center min-h-screen gap-3 px-4 pt-8 pb-24">
      <h1 className="text-2xl font-semibold">{competition.name}</h1>
      <p className="text-sm text-zinc-500">{getFormatLabel('ko_cup_2', competition)}</p>
      <BottomTabBar slug={slug} />

      {N <= 1 ? (
        <p className="text-sm text-zinc-500 mt-4">Not enough members for a bracket.</p>
      ) : notEnoughRounds ? (
        <p className="text-sm text-red-500 mt-4 max-w-sm text-center">
          Not enough regular-season rounds ({cup2Rounds.length}) for a {k}-round bracket needed for {N} entrants.
        </p>
      ) : (
        <div className="w-full flex flex-col gap-3 mt-2">
          <p className="text-xs text-zinc-500 text-center">
            {N} entrants, {byesNeeded} bye{byesNeeded !== 1 ? 's' : ''} · {cup2Rounds[0]?.round_name} → {cup2Rounds[cup2Rounds.length - 1]?.round_name}
          </p>

          {cup.champion && (
            <p className="text-sm text-center text-zinc-600">
              {getFormatLabel('ko_cup_2', competition)} champion: <span className="font-semibold text-amber-600">🏆 {nameFor(cup.champion)}</span>
            </p>
          )}

          <div className="w-full overflow-x-auto">
            <div className="flex gap-4 pb-2" style={{ width: 'max-content' }}>
              {cup2Rounds.map((roundMeta, ri) => {
                const isComplete = ri < cup.rounds.length
                const isPreview = ri === cup.rounds.length && !!cup.preview
                const roundData = isComplete ? cup.rounds[ri] : isPreview ? cup.preview : null
                const expectedMatches = Math.pow(2, k - 1 - ri)

                return (
                  <div key={roundMeta.round_name} className="flex flex-col gap-2" style={{ width: 168 }}>
                    <p className="text-xs font-semibold text-zinc-500 text-center">{stageLabelFor(ri, k)}</p>

                    {roundData ? (
                      <>
                        {ri === 0 && roundData.byesThisRound?.length > 0 && (
                          <p className="text-[10px] text-zinc-400 text-center -mt-1 mb-1">
                            Bye: {roundData.byesThisRound.map(nameFor).join(', ')}
                          </p>
                        )}
                        {roundData.matches.map((m, mi) => {
                          const decided = m.winner != null
                          return (
                            <div key={mi} className="rounded overflow-hidden border border-zinc-200 text-xs">
                              <div className={`flex justify-between items-center px-2 py-1.5 ${
                                decided ? (m.winner === m.a ? 'bg-green-50 text-green-700 font-semibold' : 'bg-red-50 text-red-500')
                                : 'bg-zinc-50 text-zinc-600'
                              }`}>
                                <span className="truncate">{nameFor(m.a)}</span>
                                {decided && <span className="ml-1">{m.scoreA}</span>}
                              </div>
                              <div className={`flex justify-between items-center px-2 py-1.5 border-t border-zinc-100 ${
                                decided ? (m.winner === m.b ? 'bg-green-50 text-green-700 font-semibold' : 'bg-red-50 text-red-500')
                                : 'bg-zinc-50 text-zinc-600'
                              }`}>
                                <span className="truncate">{nameFor(m.b)}</span>
                                {decided && <span className="ml-1">{m.scoreB}</span>}
                              </div>
                              {m.tiebreak && (
                                <p className="text-[9px] text-amber-600 px-2 py-0.5 bg-amber-50 border-t border-amber-100">Tied - {m.tiebreak}</p>
                              )}
                            </div>
                          )
                        })}
                      </>
                    ) : (
                      Array.from({ length: expectedMatches }).map((_, mi) => (
                        <div key={mi} className="rounded border border-dashed border-zinc-200 text-xs text-zinc-300">
                          <div className="px-2 py-1.5">TBD</div>
                          <div className="px-2 py-1.5 border-t border-dashed border-zinc-200">TBD</div>
                        </div>
                      ))
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}