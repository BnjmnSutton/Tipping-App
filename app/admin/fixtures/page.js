'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const FINAL_NAMES = {
  1: 'Final',
  2: 'Elimination Final',
  3: 'Qualifying Final',
  4: 'Semi Final',
  5: 'Preliminary Final',
  6: 'Grand Final',
  7: 'Wildcard Final',
}

export default function AdminFixtures() {
  const [seasons, setSeasons] = useState([])
  const [cachedCounts, setCachedCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [populatingId, setPopulatingId] = useState(null)
  const [message, setMessage] = useState('')
  const supabase = createClient()

  useEffect(() => {
    loadSeasons()
  }, [])

  async function loadSeasons() {
    setLoading(true)
    const { data: seasonsData } = await supabase.from('seasons').select('*')
    setSeasons(seasonsData || [])

    const counts = {}
    for (const s of seasonsData || []) {
      const { count } = await supabase
        .from('season_fixtures')
        .select('*', { count: 'exact', head: true })
        .eq('season_id', s.id)
      counts[s.id] = count || 0
    }
    setCachedCounts(counts)
    setLoading(false)
  }

  async function handlePopulate(season) {
    setPopulatingId(season.id)
    setMessage('')

    try {
      const res = await fetch(`/api/squiggle?year=${season.season}`)
      const data = await res.json()

      if (!res.ok || !data.games || data.games.length === 0) {
        throw new Error(data.error || 'No games returned from Squiggle')
      }

const skipped = []
      const rowsToInsert = data.games
        .filter((g) => {
          if (!g.hteam || !g.ateam || !g.date) {
            skipped.push(g)
            return false
          }
          return true
        })
        .map((g) => {
          const isFinal = g.is_final !== 0
          const roundType = isFinal ? 'final' : 'regular'
          const roundName = isFinal
            ? (FINAL_NAMES[g.is_final] || `Final (Round ${g.round})`)
            : `Round ${g.round}`

          return {
            season_id: season.id,
            squiggle_id: g.id,
            round_name: roundName,
            sequence: g.round,
            round_type: roundType,
            home: g.hteam,
            away: g.ateam,
            start_time: g.date,
            result: g.complete === 100 ? g.winner : null,
            completed: g.complete === 100, // true for a finished game, WIN or DRAW - result alone can't tell the two apart
          }
        })

      if (skipped.length > 0) {
        console.warn('Skipped incomplete games:', skipped)
      }

      const { error: upsertError } = await supabase
        .from('season_fixtures')
        .upsert(rowsToInsert, { onConflict: 'squiggle_id' })

      if (upsertError) throw upsertError

      setMessage(`Cached ${rowsToInsert.length} games for ${season.display_name}.`)
      await loadSeasons()
    } catch (err) {
      console.error('Error populating fixture:', err)
      setMessage(`Error: ${err.message}`)
    } finally {
      setPopulatingId(null)
    }
  }

  if (loading) return <p className="p-8">Loading...</p>

  return (
    <div className="flex flex-col items-center min-h-screen gap-4 px-4 py-8">
      <h1 className="text-2xl font-semibold">Admin: Season Fixtures</h1>
      <p className="text-sm text-zinc-500 max-w-md text-center">
        Populate each season's fixture once, here. Competitions will copy from this cache instead of calling Squiggle themselves.
      </p>

      {message && <p className="text-sm">{message}</p>}

      <ul className="w-full max-w-md flex flex-col gap-2">
        {seasons.map((s) => (
          <li key={s.id} className="border rounded px-3 py-2 flex items-center justify-between">
            <div>
              <p className="font-medium">{s.display_name}</p>
              <p className="text-xs text-zinc-500">
                {cachedCounts[s.id] > 0
                  ? `${cachedCounts[s.id]} games cached`
                  : 'Not cached yet'}
              </p>
            </div>
            <button
              onClick={() => handlePopulate(s)}
              disabled={populatingId === s.id}
              className="border rounded px-3 py-1 text-sm"
            >
              {populatingId === s.id
                ? 'Fetching...'
                : cachedCounts[s.id] > 0
                  ? 'Re-populate'
                  : 'Populate from Squiggle'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}