'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import SignInButton from '@/components/SignInButton'
import SignOutButton from '@/components/SignOutButton'
import MagicLinkForm from '@/components/MagicLinkForm'

export default function Home() {
  const [user, setUser] = useState(null)
  const [competitions, setCompetitions] = useState([])
  const [loadingComps, setLoadingComps] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const userId = user?.id

  useEffect(() => {
    if (!userId) {
      setCompetitions([])
      return
    }

    let cancelled = false

    async function loadCompetitions() {
      setLoadingComps(true)

      // Competitions you run, plus competitions you've joined as a member
      const [{ data: owned, error: ownedErr }, { data: memberships, error: memErr }] = await Promise.all([
        supabase.from('competitions').select('*').eq('owner_id', userId),
        supabase.from('members').select('comp_id').eq('user_id', userId),
      ])
      if (ownedErr) console.error('Error loading owned competitions:', ownedErr)
      if (memErr) console.error('Error loading memberships:', memErr)

      const ownedIds = new Set((owned || []).map(c => c.id))
      const joinedIds = [...new Set((memberships || []).map(m => m.comp_id))].filter(id => !ownedIds.has(id))

      let joined = []
      if (joinedIds.length > 0) {
        const { data, error } = await supabase.from('competitions').select('*').in('id', joinedIds)
        if (error) console.error('Error loading joined competitions:', error)
        joined = data || []
      }

      if (cancelled) return
      const all = [...(owned || []), ...joined].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      )
      setCompetitions(all)
      setLoadingComps(false)
    }

    loadCompetitions()

    return () => { cancelled = true }
  }, [userId])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-4">
      <h1 className="text-2xl font-semibold">Tipping App</h1>
      {user ? (
        <>
          <p>Logged in as {user.email}</p>
          <SignOutButton />
          <a href="/create" className="text-blue-600 underline">Create a competition</a>

          <div className="w-full max-w-sm mt-4">
            <h2 className="font-semibold mb-2">Your competitions</h2>
            {loadingComps && <p className="text-sm text-zinc-500">Loading...</p>}
            {!loadingComps && competitions.length === 0 && (
              <p className="text-sm text-zinc-500">You haven&apos;t created or joined any competitions yet.</p>
            )}
            <ul className="flex flex-col gap-2">
              {competitions.map((comp) => (
                <li key={comp.id}>
                  <a
                    href={`/competition/${comp.slug}`}
                    className="flex items-center justify-between gap-2 border rounded px-3 py-2 hover:bg-zinc-50"
                  >
                    <span>
                      <span className="font-medium">{comp.name}</span>
                      <span className="text-sm text-zinc-500"> - {comp.sport} {comp.season}</span>
                    </span>
                    {comp.owner_id === userId && (
                      <span className="text-xs font-medium bg-primary-50 text-primary-700 rounded px-2 py-0.5 shrink-0">
                        Admin
                      </span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <>
          <SignInButton />
          <p>or</p>
          <MagicLinkForm />
        </>
      )}
    </div>
  )
}