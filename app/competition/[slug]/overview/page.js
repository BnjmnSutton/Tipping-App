'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import BottomTabBar from '@/components/BottomTabBar'

export default function OverviewPage() {
  const { slug } = useParams()
  const [competition, setCompetition] = useState(null)
  const [members, setMembers] = useState([])
  const [currentUserId, setCurrentUserId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    init()
  }, [slug])

  async function init() {
    const { data: comp } = await supabase
      .from('competitions')
      .select('*')
      .eq('slug', slug)
      .single()
    if (!comp) { setLoading(false); return }
    setCompetition(comp)

    const { data: { user } } = await supabase.auth.getUser()
    setCurrentUserId(user?.id || null)

    const { data: mems } = await supabase
      .from('members')
      .select('*')
      .eq('comp_id', comp.id)
    setMembers(mems || [])

    setLoading(false)
  }

  const inviteLink = typeof window !== 'undefined'
    ? `${window.location.origin}/join?comp=${slug}`
    : ''

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return <p className="p-8">Loading...</p>
  if (!competition) return <p className="p-8">Competition not found.</p>

  // The admin is whoever owns the competition
  const isOwner = !!currentUserId && competition.owner_id === currentUserId

  return (
    <div className="flex flex-col items-center min-h-screen gap-3 px-4 pt-8 pb-24">
      <h1 className="text-2xl font-semibold">{competition.name}</h1>
      <p>{competition.sport} {competition.season}</p>
      <p className="text-sm text-zinc-500">Status: {competition.status}</p>

      <BottomTabBar slug={slug} />

      {isOwner && (
        <Link
          href={`/competition/${slug}/settings`}
          className="w-full max-w-sm border rounded px-3 py-2 text-sm text-center font-medium"
        >
          Competition settings
        </Link>
      )}

      <div className="w-full max-w-sm mt-2 flex flex-col gap-2">
        <p className="text-sm font-medium">Invite link</p>
        <div className="flex gap-2">
          <input
            readOnly
            value={inviteLink}
            className="border rounded px-3 py-2 flex-1 text-sm"
          />
          <button onClick={copyLink} className="border rounded px-3 py-2 text-sm">
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="w-full max-w-sm mt-4">
        <h2 className="font-semibold mb-2">Members ({members.length})</h2>
        <ul className="flex flex-col gap-1">
          {members.map((m) => {
            const isAdmin = !!m.user_id && m.user_id === competition.owner_id
            return (
              <li key={m.id} className="border rounded px-3 py-2 text-sm flex items-center justify-between">
                <span>{m.display_name}</span>
                {isAdmin && (
                  <span className="text-xs font-medium bg-primary-50 text-primary-700 rounded px-2 py-0.5">
                    Admin
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}