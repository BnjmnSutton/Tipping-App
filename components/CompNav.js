'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getFormatLabel, isFormatEnabled } from '@/lib/formatConfig'

export default function CompNav({ slug }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [competition, setCompetition] = useState(null)

  useEffect(() => {
    supabase
      .from('competitions')
      .select('id, format_config')
      .eq('slug', slug)
      .single()
      .then(({ data }) => setCompetition(data))
  }, [slug])

  const allTabs = [
    { key: null, href: `/competition/${slug}/tips`, label: 'Tips' },
    { key: null, href: `/competition/${slug}/round`, label: 'Round Results' },
    { key: 'leaderboard', href: `/competition/${slug}/leaderboard` },
    { key: 'mvp', href: `/competition/${slug}/mvp` },
    { key: 'finals_leaderboard', href: `/competition/${slug}/finals-leaderboard` },
    { key: 'eliminator', href: `/competition/${slug}/eliminator` },
    { key: 'ko_cup_1', href: `/competition/${slug}/ko-cup-1` },
    { key: 'ko_cup_2', href: `/competition/${slug}/ko-cup-2` },
    { key: 'champions_league', href: `/competition/${slug}/champions-league` },
    { key: 'night_prem', href: `/competition/${slug}/night-prem` },
    { key: null, href: `/competition/${slug}/overview`, label: 'Overview' },
  ]

  const tabs = allTabs
    .filter(t => !t.key || isFormatEnabled(t.key, competition))
    .map(t => ({ ...t, label: t.key ? getFormatLabel(t.key, competition) : t.label }))

  const current = tabs.find(t => t.href === pathname)?.href || tabs[0]?.href

  return (
    <div className="w-full max-w-sm flex items-center gap-2 mb-2">
      <button
        onClick={() => router.push('/')}
        className="border rounded px-3 py-2 text-sm text-zinc-600 whitespace-nowrap"
      >
        ← Home
      </button>
      <select
        value={current}
        onChange={e => router.push(e.target.value)}
        className="border rounded px-2 py-2 text-sm flex-1 font-medium"
      >
        {tabs.map(t => (
          <option key={t.href} value={t.href}>{t.label}</option>
        ))}
      </select>
    </div>
  )
}