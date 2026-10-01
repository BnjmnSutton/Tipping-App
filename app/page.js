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

  useEffect(() => {
    if (!user) {
      setCompetitions([])
      return
    }

    setLoadingComps(true)
    supabase
      .from('competitions')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (data) setCompetitions(data)
        if (error) console.error('Error loading competitions:', error)
        setLoadingComps(false)
      })
  }, [user])

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
              <p className="text-sm text-zinc-500">You haven't created any competitions yet.</p>
            )}
            <ul className="flex flex-col gap-2">
           	 {competitions.map((comp) => (
                <li key={comp.id}>
                  <a
                    href={`/competition/${comp.slug}`}
                    className="block border rounded px-3 py-2 hover:bg-zinc-50"
                  >
                    <span className="font-medium">{comp.name}</span>
                    <span className="text-sm text-zinc-500"> - {comp.sport} {comp.season}</span>
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
  );
}