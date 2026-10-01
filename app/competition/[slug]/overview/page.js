'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import BottomTabBar from '@/components/BottomTabBar'

export default function OverviewPage() {
  const { slug } = useParams()
  const [competition, setCompetition] = useState(null)
  const [members, setMembers] = useState([])
  const [fixture, setFixture] = useState([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  const supabase = createClient()

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

    const { data: mems } = await supabase
      .from('members')
      .select('*')
      .eq('comp_id', comp.id)
    setMembers(mems || [])

    if (comp.season_id) {
      const { data: fx } = await supabase
        .from('season_fixtures')
        .select('*')
        .eq('season_id', comp.season_id)
        .order('sequence', { ascending: true })
      setFixture(fx || [])
    }

    setLoading(false)
  }

  const inviteLink = typeof window !== 'undefined'
    ? `${window.location.origin}/join?comp=${slug}`
    : ''

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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

  return (
    <div className="flex flex-col items-center min-h-screen gap-3 px-4 pt-8 pb-24">
      <h1 className="text-2xl font-semibold">{competition.name}</h1>
      <p>{competition.sport} {competition.season}</p>
      <p className="text-sm text-zinc-500">Status: {competition.status}</p>

      <BottomTabBar slug={slug} />

      <div className="w-full max-w-sm mt-2 flex flex-col gap-2">
        <p className="text-sm font-medium">Invite link</p>
        <div className="flex gap-2">
          <input
            readOnly
            value={inviteLink}
            className="border rounded px-3 py-2 flex-1 text-sm"
          />
          <button onClick={copyLink} className="border rounded px-3 py-2 text-sm">
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="w-full max-w-sm mt-4">
        <h2 className="font-semibold mb-2">Members ({members.length})</h2>
        <ul className="flex flex-col gap-1">
          {members.map((m) => (
            <li key={m.id} className="border rounded px-3 py-2 text-sm">
              {m.display_name}
            </li>
          ))}
        </ul>
      </div>

      <div className="w-full max-w-sm mt-6">
        <h2 className="font-semibold mb-2">Rounds ({roundsList.length})</h2>
        {roundsList.length === 0 && (
          <p className="text-sm text-zinc-500">No fixture found for this season.</p>
        )}
        <ul className="flex flex-col gap-3">
          {roundsList.map((r) => (
            <li key={r.round_name} className="border rounded px-3 py-2">
              <p className="font-medium">
                {r.round_name}{' '}
                <span className="text-xs text-zinc-500">
                  ({r.round_type === 'final' ? 'Finals' : 'Regular season'})
                </span>
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {r.games.map((g) => (
                  <li key={g.id} className="text-sm text-zinc-600">
                    {g.home} vs {g.away} —{' '}
                    {new Date(g.start_time).toLocaleString()}
                    {g.result && <span className="text-green-700 font-medium"> — Winner: {g.result}</span>}
                    {g.completed && !g.result && <span className="text-amber-600 font-medium"> — Draw</span>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}