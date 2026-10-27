// app/auth/callback/route.js
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Only follow a return-to address that's a plain path on this site (starts
// with a single "/"). Anything else - a full URL, "//other-site.com", or
// "@other-site.com" appended to our own address - falls back to the home
// page, so a crafted sign-in link can't bounce people to another website.
function safeNextPath(next) {
  if (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')) {
    return next
  }
  return '/'
}

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNextPath(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Something went wrong
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}