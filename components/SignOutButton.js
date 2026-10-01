// components/SignOutButton.js
'use client'
import { createClient } from '@/lib/supabase/client'

export default function SignOutButton() {
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.reload()
  }

  return <button onClick={handleSignOut}>Sign out</button>
}