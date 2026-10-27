// components/MagicLinkForm.js
'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// `next` is an optional path (e.g. "/join?comp=my-comp") to send the user back
// to after they click the emailed link.
export default function MagicLinkForm({ next }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | sending | sent | error
  const [errorMsg, setErrorMsg] = useState('')
  const supabase = createClient()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setStatus('sending')
    setErrorMsg('')

    try {
      const callback = `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ''}`
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: callback,
        },
      })

      if (error) {
        console.error('Magic link error:', error)
        setErrorMsg(error.message)
        setStatus('error')
      } else {
        setStatus('sent')
      }
    } catch (err) {
      console.error('Magic link threw:', err)
      setErrorMsg(err?.message || String(err))
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
      {status === 'error' && (
        <p className="text-red-600 text-sm">Something went wrong{errorMsg ? `: ${errorMsg}` : ''}. Try again.</p>
      )}
    </form>
  )
}