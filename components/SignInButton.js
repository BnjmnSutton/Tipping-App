// components/SignInButton.js
'use client'
import { createClient } from '@/lib/supabase/client'

// `next` is an optional path (e.g. "/join?comp=my-comp") to send the user back
// to after signing in. Without it they land wherever the auth callback sends
// people by default.
export default function SignInButton({ next }) {
  const supabase = createClient()

  const handleSignIn = async () => {
    const callback = `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ''}`
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callback,
      },
    })
    if (data?.url) {
      window.location.href = data.url
    }
    if (error) {
      console.error('Sign in error:', error)
    }
  }

  return <button onClick={handleSignIn}>Sign in with Google</button>
}