// components/MagicLinkForm.js
'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function MagicLinkForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | sending | sent | error
  const supabase = createClient()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setStatus('sending')

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (error) {
        alert('Supabase returned an error: ' + error.message)
        console.error('Magic link error:', error)
        setStatus('error')
      } else {
        alert('Success - no error returned.')
        setStatus('sent')
      }
    } catch (err) {
      alert('CRASHED: ' + (err?.message || String(err)))
      console.error('Magic link threw:', err)
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return <p>Check your email for a sign-in link.</p>
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <input
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        className="border rounded px-3 py-2"
      />
      <button type="submit" disabled={status === 'sending'}>
        {status === 'sending' ? 'Sending...' : 'Send magic link'}
      </button>
      {status === 'error' && <p className="text-red-600">Something went wrong. Try again.</p>}
    </form>
  )
}