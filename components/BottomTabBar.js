'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getFormatLabel, isFormatEnabled } from '@/lib/formatConfig'

export default function BottomTabBar({ slug }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [competition, setCompetition] = useState(null)
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    supabase
      .from('competitions')
      .select('id, format_config')
      .eq('slug', slug)
      .single()
      .then(({ data }) => setCompetition(data))
  }, [slug])

  const moreTabs = [
    { key: null, href: `/competition/${slug}/leaderboard`, label: getFormatLabel('leaderboard', competition) },
    { key: 'mvp', href: `/competition/${slug}/mvp` },
    { key: 'finals_leaderboard', href: `/competition/${slug}/finals-leaderboard` },
    { key: 'eliminator', href: `/competition/${slug}/eliminator` },
    { key: 'ko_cup_1', href: `/competition/${slug}/ko-cup-1` },
    { key: 'ko_cup_2', href: `/competition/${slug}/ko-cup-2` },
    { key: 'champions_league', href: `/competition/${slug}/champions-league` },
    { key: 'night_prem', href: `/competition/${slug}/night-prem` },
    { key: null, href: `/competition/${slug}/overview`, label: 'Overview' },
  ]
    .filter(t => !t.key || isFormatEnabled(t.key, competition))
    .map(t => ({ ...t, label: t.key ? getFormatLabel(t.key, competition) : t.label }))

  const fixedTabs = [
    { href: `/competition/${slug}/tips`, label: 'Tips', icon: '📝' },
    { href: `/competition/${slug}/round`, label: 'Round', icon: '📅' },
  ]

  const isMoreActive = moreTabs.some(t => t.href === pathname)
  const isHomeActive = pathname === '/'

  return (
    <>
      {moreOpen && (
        <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setMoreOpen(false)}>
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl p-4 max-h-[70vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
          >
            <div className="w-10 h-1 bg-zinc-300 rounded-full mx-auto mb-4" />
            <div className="flex flex-col gap-1">
              {moreTabs.map(t => (
                <button
                  key={t.href}
                  onClick={() => { setMoreOpen(false); router.push(t.href) }}
                  className={`text-left px-3 py-3 rounded-lg text-sm font-medium ${
                    pathname === t.href ? 'bg-primary-50 text-primary-700' : 'text-zinc-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav
        className="fixed bottom-0 left-0 right-0 bg-white border-t border-zinc-200 flex items-stretch z-30"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {fixedTabs.map(t => {
          const active = pathname === t.href
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex-1 flex flex-col items-center justify-center py-2 text-xs gap-0.5 ${
                active ? 'text-primary-700 font-semibold' : 'text-zinc-500'
              }`}
            >
              <span className="text-lg leading-none">{t.icon}</span>
              {t.label}
            </Link>
          )
        })}
        <Link
          href="/"
          className={`flex-1 flex flex-col items-center justify-center py-2 text-xs gap-0.5 ${
            isHomeActive ? 'text-primary-700 font-semibold' : 'text-zinc-500'
          }`}
        >
          <span className="text-lg leading-none">🏠</span>
          Home
        </Link>
        <button
          onClick={() => setMoreOpen(true)}
          className={`flex-1 flex flex-col items-center justify-center py-2 text-xs gap-0.5 ${
            isMoreActive ? 'text-primary-700 font-semibold' : 'text-zinc-500'
          }`}
        >
          <span className="text-lg leading-none">☰</span>
          More
        </button>
      </nav>
    </>
  )
}