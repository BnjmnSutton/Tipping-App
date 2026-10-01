// components/SignInButton.js
'use client'
import { createClient } from '@/lib/supabase/client'

export default function SignInButton() {
  const supabase = createClient()

  const handleSignIn = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
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