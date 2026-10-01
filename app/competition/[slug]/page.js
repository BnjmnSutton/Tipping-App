'use client'
import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function CompetitionRedirect() {
  const { slug } = useParams()
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    route()
  }, [slug])

  async function route() {
    const { data: comp } = await supabase
      .from('competitions')
      .select('id')
      .eq('slug', slug)
      .single()

    if (!comp) { router.replace('/'); return }

    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      const { data: mem } = await supabase
        .from('members')
        .select('id')
        .eq('comp_id', comp.id)
        .eq('user_id', user.id)
        .single()

      if (mem) {
        router.replace(`/competition/${slug}/tips`)
        return
      }
    }

    // Owner-only visitor, or not a member - land on overview
    router.replace(`/competition/${slug}/overview`)
  }

  return <p className="p-8">Loading...</p>
}