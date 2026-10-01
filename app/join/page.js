'use client'
import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import SignInButton from '@/components/SignInButton'
import MagicLinkForm from '@/components/MagicLinkForm'

export default function JoinCompetition() {
  const searchParams = useSearchParams()
  const slug = searchParams.get('comp')
  const router = useRouter()
  const supabase = createClient()

  const [user, setUser] = useState(null)
  const [competition, setCompetition] = useState(null)
  const [loading, setLoading] = useState(true)
  const [displayName, setDisplayName] = useState('')
  const [status, setStatus] = useState('idle')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!slug) {
      setLoading(false)
      return
    }
    let cancelled = false

    async function loadEverything() {
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      if (cancelled) return
      setUser(currentUser)

      const { data: comp } = await supabase
        .from('competitions')
        .select('*')
        .eq('slug', slug)
        .single()
      if (cancelled) return
      setCompetition(comp)

      if (currentUser && comp) {
        const { data: existingMember } = await supabase
          .from('members')
          .select('*')
          .eq('comp_id', comp.id)
          .eq('user_id', currentUser.id)
          .maybeSingle()
        if (cancelled) return
        if (existingMember) setStatus('already')
      }

      setLoading(false)
    }

    loadEverything()

    return () => {
      cancelled = true
    }
  }, [slug])

  async function handleJoin(e) {
    e.preventDefault()
    setStatus('loading')
    setErrorMsg('')

    const { error } = await supabase.from('members').insert({
      comp_id: competition.id,
      user_id: user.id,
      display_name: displayName,
      paid: false,
      role: 'member',
    })

    if (error) {
      setErrorMsg(error.message)
      setStatus('error')
      return
    }

    router.push(`/competition/${slug}`)
  }

  if (!slug) return <p className="p-8">No competition specified.</p>
  if (loading) return <p className="p-8">Loading...</p>
  if (!competition) return <p className="p-8">Competition not found.</p>

  if (status === 'already') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-2">
        <p>You're already a member of {competition.name}.</p>
        <a href={`/competition/${slug}`} className="text-blue-600 underline">
          Go to competition
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-4">
      <h1 className="text-2xl font-semibold">Join {competition.name}</h1>
      <p className="text-sm text-zinc-500">{competition.sport} {competition.season}</p>

      {!user ? (
        <div className="flex flex-col items-center gap-2">
          <p>Sign in to join this competition.</p>
          <SignInButton />
          <p>or</p>
          <MagicLinkForm />
        </div>
      ) : (
        <form onSubmit={(e) => handleJoin(e)} className="flex flex-col gap-3 w-full max-w-sm">
          <label className="flex flex-col gap-1">
            Your display name
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className="border rounded px-3 py-2"
            />
          </label>
          <button type="submit" disabled={status === 'loading'} className="border rounded px-3 py-2">
            {status === 'loading' ? 'Joining...' : 'Join competition'}
          </button>
          {status === 'error' && <p className="text-red-600">{errorMsg}</p>}
        </form>
      )}
    </div>
  );
}