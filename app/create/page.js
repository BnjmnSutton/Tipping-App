'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function CreateCompetition() {
  const [name, setName] = useState('')
  const [seasons, setSeasons] = useState([])
  const [selectedSeasonId, setSelectedSeasonId] = useState('')
  const [status, setStatus] = useState('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    supabase
      .from('seasons')
      .select('*')
      .eq('available', true)
      .then(({ data, error }) => {
        if (data) {
          setSeasons(data)
          if (data.length > 0) setSelectedSeasonId(data[0].id)
        }
        if (error) console.error('Error loading seasons:', error)
      })
  }, [])

  const makeSlug = (text) =>
    text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setStatus('creating')
    setErrorMsg('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setErrorMsg('You must be logged in.')
      setStatus('error')
      return
    }

    const season = seasons.find((s) => s.id === selectedSeasonId)
    if (!season) {
      setErrorMsg('Please select a season.')
      setStatus('error')
      return
    }

    const slug = `${makeSlug(name)}-${Date.now().toString(36)}`

    const { data: competition, error: compError } = await supabase
      .from('competitions')
      .insert({
        name,
        slug,
        owner_id: user.id,
        sport: season.sport,
        season: season.season,
        season_id: season.id,
        status: 'active',
      })
      .select()
      .single()

    if (compError) {
      console.error('Error creating competition:', compError)
      setErrorMsg(compError.message)
      setStatus('error')
      return
    }

    router.push(`/competition/${competition.slug}`)
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-4">
      <h1 className="text-2xl font-semibold">Create a Competition</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 w-full max-w-sm">
        <label className="flex flex-col gap-1">
          Competition name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="border rounded px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1">
          Season
          <select
            value={selectedSeasonId}
            onChange={(e) => setSelectedSeasonId(e.target.value)}
            required
            className="border rounded px-3 py-2"
          >
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.display_name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          disabled={status === 'creating'}
          className="border rounded px-3 py-2"
        >
          {status === 'creating' ? 'Creating...' : 'Create competition'}
        </button>

        {status === 'error' && <p className="text-red-600">{errorMsg}</p>}
      </form>
    </div>
  );
}