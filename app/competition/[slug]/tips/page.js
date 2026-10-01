'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import BottomTabBar from '@/components/BottomTabBar'
import RoundSelector from '@/components/RoundSelector'
import { getMemberLockStatus } from '@/lib/billing'
import { getCurrentRoundIndex } from '@/lib/seasonProgress'

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

export default function TipsPage() {
  const { slug } = useParams()
  const supabase = createClient()

  const [competition, setCompetition] = useState(null)
  const [member, setMember] = useState(null)
  const [members, setMembers] = useState([])
  const [fixture, setFixture] = useState([])
  const [tips, setTips] = useState({})
  const [selectedRound, setSelectedRound] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notMember, setNotMember] = useState(false)
  const [savingIds, setSavingIds] = useState(new Set())

  useEffect(() => {
    init()
  }, [slug])

  async function init() {
    setLoading(true)

    const { data: comp } = await supabase
      .from('competitions')
      .select('*')
      .eq('slug', slug)
      .single()
    if (!comp) { setLoading(false); return }
    setCompetition(comp)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: mem } = await supabase
      .from('members')
      .select('*')
      .eq('comp_id', comp.id)
      .eq('user_id', user.id)
      .single()

    if (!mem) { setNotMember(true); setLoading(false); return }
    setMember(mem)

    // Need every member (not just this one) to compute join-order payment coverage
    const { data: allMems } = await supabase
      .from('members')
      .select('*')
      .eq('comp_id', comp.id)
    setMembers(allMems || [])

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

      const { data: tp } = await supabase
        .from('tips')
        .select('*')
        .eq('member_id', mem.id)
        .in('fixture_id', fixtureList.map(g => g.id))
      const map = {}
      ;(tp || []).forEach(t => {
        map[t.fixture_id] = { pick: t.pick, confidence: t.confidence }
      })
      setTips(map)
    }

    setLoading(false)
  }

  async function saveTip(fixtureId, updates) {
    if (!member) return
    if (getMemberLockStatus(member.id, members, competition).locked) return
    setSavingIds(s => new Set(s).add(fixtureId))

    const newTip = { ...(tips[fixtureId] || {}), ...updates }
    setTips(t => ({ ...t, [fixtureId]: newTip }))

    await supabase
      .from('tips')
      .upsert(
        {
          member_id: member.id,
          fixture_id: fixtureId,
          pick: newTip.pick ?? null,
          confidence: newTip.confidence ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'member_id,fixture_id' }
      )

    setSavingIds(s => { const n = new Set(s); n.delete(fixtureId); return n })
  }

  if (loading) return <p className="p-8">Loading...</p>
  if (!competition) return <p className="p-8">Competition not found.</p>
  if (notMember) return <p className="p-8">You&apos;re not a member of this competition.</p>

  const roundsMap = {}
  for (const g of fixture) {
    const key = g.sequence
    if (!roundsMap[key]) {
      roundsMap[key] = { round_name: g.round_name, round_type: g.round_type, games: [] }
    }
    roundsMap[key].games.push(g)
  }
  const roundsList = Object.values(roundsMap)
  const currentRound = roundsList.find(r => r.round_name === selectedRound)
  const games = currentRound ? currentRound.games : []
  const confValues = getConfValues(games.length)

  const usedConfByFixture = {}
  games.forEach(g => {
    const t = tips[g.id]
    if (t && t.confidence != null) usedConfByFixture[t.confidence] = g.id
  })

  const now = new Date()
  const lockStatus = member ? getMemberLockStatus(member.id, members, competition) : { locked: false, daysLeft: null }

  return (
    <div className="flex flex-col items-center min-h-screen gap-3 px-4 pt-8 pb-24">
      <h1 className="text-2xl font-semibold">{competition.name}</h1>
      <p className="text-sm text-zinc-500">Enter your tips</p>
      <BottomTabBar slug={slug} />

      {lockStatus.locked && (
        <div className="w-full max-w-sm border border-red-200 bg-red-50 rounded px-3 py-3 text-sm text-red-700">
          <p className="font-semibold mb-1">Tips are paused for you</p>
          <p>This competition hasn&apos;t been paid for your spot yet, and your 2-week grace period since joining has ended. Ask your organiser to top up the competition to reactivate tipping - everything you&apos;ve already entered is still safe and visible.</p>
        </div>
      )}
      {!lockStatus.locked && lockStatus.daysLeft != null && (
        <div className="w-full max-w-sm border border-amber-200 bg-amber-50 rounded px-3 py-2 text-xs text-amber-700">
          Heads up - this competition hasn&apos;t been paid for your spot yet. Tipping pauses for you in {lockStatus.daysLeft} day{lockStatus.daysLeft === 1 ? '' : 's'} unless your organiser tops up.
        </div>
      )}

      <RoundSelector roundsList={roundsList} selectedRound={selectedRound} onChange={setSelectedRound} />

      <div className="w-full max-w-sm mt-2 flex flex-col gap-3">
        {games.map(g => {
          const started = new Date(g.start_time) <= now
          const disabled = started || lockStatus.locked
          const tip = tips[g.id] || {}
          const isSaving = savingIds.has(g.id)

          return (
            <div key={g.id} className="border rounded px-3 py-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-zinc-500">
                  {new Date(g.start_time).toLocaleString()}
                </span>
                {started && <span className="text-xs text-green-700">Locked</span>}
                {isSaving && <span className="text-xs text-zinc-400">Saving...</span>}
              </div>

              <div className="flex gap-2 mb-2">
                {[g.home, g.away].map(team => {
                  const selected = tip.pick === team
                  return (
                    <button
                      key={team}
                      disabled={disabled}
                      onClick={() => saveTip(g.id, { pick: team })}
                      className={`flex-1 border rounded px-2 py-2 text-sm ${
                        selected
                          ? 'bg-blue-50 border-blue-500 text-blue-700 font-medium'
                          : 'text-zinc-600'
                      } ${disabled ? 'opacity-60' : ''}`}
                    >
                      {team}
                    </button>
                  )
                })}
              </div>

              <select
                disabled={disabled}
                value={tip.confidence ?? ''}
                onChange={e => saveTip(g.id, { confidence: e.target.value === '' ? null : Number(e.target.value) })}
                className="border rounded px-2 py-1 text-sm w-full"
              >
                <option value="">Confidence — </option>
                {confValues.map(v => {
                  const usedBy = usedConfByFixture[v]
                  const disabledOption = usedBy && usedBy !== g.id
                  return (
                    <option key={v} value={v} disabled={disabledOption}>
                      {v}{disabledOption ? ' (used)' : ''}
                    </option>
                  )
                })}
              </select>

              {g.result && (
                <p className="text-xs text-zinc-500 mt-2">Result: {g.result}</p>
              )}
              {g.completed && !g.result && (
                <p className="text-xs text-amber-600 mt-2">Result: Draw</p>
              )}
            </div>
          )
        })}
        {games.length === 0 && (
          <p className="text-sm text-zinc-500">No games found for this round.</p>
        )}
      </div>
    </div>
  )
}