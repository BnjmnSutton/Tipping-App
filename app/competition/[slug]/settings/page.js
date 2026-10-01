'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DEFAULT_FORMAT_LABELS, TOGGLEABLE_FORMATS, NAMEABLE_FORMATS } from '@/lib/formatConfig'

const ROUND_OVERRIDE_FIELDS = [
  { key: 'eliminator', label: 'Eliminator', hasEnd: true },
  { key: 'ko_cup_1', label: 'KO Cup 1', hasEnd: false },
  { key: 'ko_cup_2', label: 'KO Cup 2', hasEnd: false },
  { key: 'champions_league', label: 'Champions League', hasEnd: false },
  { key: 'night_prem', label: 'Night Premiership', hasEnd: false },
]

export default function CompetitionSettingsPage() {
  const { slug } = useParams()
  const router = useRouter()
  const supabase = createClient()

  const [competition, setCompetition] = useState(null)
  const [isOwner, setIsOwner] = useState(false)
  const [roundOptions, setRoundOptions] = useState([])
  const [enabled, setEnabled] = useState({})
  const [names, setNames] = useState({})
  const [rounds, setRounds] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [memberCount, setMemberCount] = useState(0)
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState('')

  useEffect(() => { init() }, [slug])

  async function init() {
    const { data: comp } = await supabase.from('competitions').select('*').eq('slug', slug).single()
    if (!comp) { setLoading(false); return }
    setCompetition(comp)

    const { data: { user } } = await supabase.auth.getUser()
    setIsOwner(!!user && user.id === comp.owner_id)

    setEnabled(comp.format_config?.enabled || {})
    setNames(comp.format_config?.names || {})
    setRounds(comp.format_config?.rounds || {})

    const { count } = await supabase
      .from('members')
      .select('*', { count: 'exact', head: true })
      .eq('comp_id', comp.id)
    setMemberCount(count || 0)

    if (comp.season_id) {
      const { data: fx } = await supabase
        .from('season_fixtures')
        .select('round_name, sequence')
        .eq('season_id', comp.season_id)
        .eq('round_type', 'regular')
        .order('sequence', { ascending: true })
      const seen = new Set()
      const opts = []
      ;(fx || []).forEach(f => {
        if (!seen.has(f.round_name)) { seen.add(f.round_name); opts.push(f.round_name) }
      })
      setRoundOptions(opts)
    }

    setLoading(false)
  }

  function updateRoundField(key, field, value) {
    setRounds(r => ({ ...r, [key]: { ...r[key], [field]: value || undefined } }))
  }

  async function handlePay() {
    setPaying(true)
    setPayError('')
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/stripe/create-checkout-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ competitionId: competition.id }),
    })
    const data = await res.json()
    if (!res.ok) {
      setPayError(data.error || 'Something went wrong.')
      setPaying(false)
      return
    }
    window.location.href = data.url
  }

  async function handleSave() {
    setSaving(true)
    setSaveMsg('')
    const { error } = await supabase
      .from('competitions')
      .update({ format_config: { enabled, names, rounds } })
      .eq('id', competition.id)
    setSaving(false)
    setSaveMsg(error ? `Error: ${error.message}` : 'Saved.')
  }

  if (loading) return <p className="p-8">Loading...</p>
  if (!competition) return <p className="p-8">Competition not found.</p>
  if (!isOwner) return <p className="p-8">Only the competition owner can edit these settings.</p>

  return (
    <div className="flex flex-col items-center min-h-screen gap-4 px-4 py-8">
      <h1 className="text-2xl font-semibold">{competition.name}</h1>
      <p className="text-sm text-zinc-500">Competition Settings</p>

      <div className="w-full max-w-sm flex flex-col gap-6 mt-2">

        <div>
          <h2 className="font-semibold mb-2 text-sm">Billing</h2>
          <div className="border rounded px-3 py-3 flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-500">Current members</span>
              <span className="font-medium">{memberCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Paid for</span>
              <span className="font-medium">{competition.paid_member_count || 0}</span>
            </div>
            {competition.admin_unlocked && (
              <p className="text-xs text-amber-600">Admin-unlocked - billing checks are bypassed for this competition.</p>
            )}
            {!competition.admin_unlocked && memberCount > (competition.paid_member_count || 0) && (
              <>
                <p className="text-xs text-red-600">
                  {memberCount - (competition.paid_member_count || 0)} member{memberCount - (competition.paid_member_count || 0) === 1 ? '' : 's'} not yet covered - each gets a 2-week grace period from when they joined before tipping pauses for them.
                </p>
                <button
                  onClick={handlePay}
                  disabled={paying}
                  className="border rounded px-3 py-2 text-sm bg-primary-700 text-white mt-1"
                >
                  {paying ? 'Redirecting to payment...' : `Pay for ${memberCount} members - $${(memberCount * 5).toFixed(2)}`}
                </button>
                {payError && <p className="text-xs text-red-600">{payError}</p>}
              </>
            )}
            {!competition.admin_unlocked && memberCount <= (competition.paid_member_count || 0) && (
              <p className="text-xs text-green-700">Fully paid for the current roster.</p>
            )}
          </div>
        </div>

        <div>
          <h2 className="font-semibold mb-2 text-sm">Which side competitions are on</h2>
          <div className="flex flex-col gap-1">
            {TOGGLEABLE_FORMATS.map(key => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={enabled[key] !== false}
                  onChange={e => setEnabled(en => ({ ...en, [key]: e.target.checked }))}
                />
                {DEFAULT_FORMAT_LABELS[key]}
              </label>
            ))}
          </div>
        </div>

        <div>
          <h2 className="font-semibold mb-2 text-sm">Custom names</h2>
          <div className="flex flex-col gap-2">
            {NAMEABLE_FORMATS.map(key => (
              <label key={key} className="flex flex-col gap-1 text-sm">
                {DEFAULT_FORMAT_LABELS[key]}
                <input
                  type="text"
                  placeholder={DEFAULT_FORMAT_LABELS[key]}
                  value={names[key] || ''}
                  onChange={e => setNames(n => ({ ...n, [key]: e.target.value }))}
                  className="border rounded px-2 py-1 text-sm"
                />
              </label>
            ))}
          </div>
        </div>

        <div>
          <h2 className="font-semibold mb-2 text-sm">Start rounds (leave blank for automatic placement)</h2>
          {roundOptions.length === 0 ? (
            <p className="text-xs text-zinc-500">No fixture loaded for this season yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {ROUND_OVERRIDE_FIELDS.map(f => (
                <div key={f.key} className="flex flex-col gap-1">
                  <p className="text-sm font-medium">{f.label}</p>
                  <div className="flex gap-2">
                    <select
                      value={rounds[f.key]?.start || ''}
                      onChange={e => updateRoundField(f.key, 'start', e.target.value)}
                      className="border rounded px-2 py-1 text-sm flex-1"
                    >
                      <option value="">Auto</option>
                      {roundOptions.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    {f.hasEnd && (
                      <select
                        value={rounds[f.key]?.end || ''}
                        onChange={e => updateRoundField(f.key, 'end', e.target.value)}
                        className="border rounded px-2 py-1 text-sm flex-1"
                      >
                        <option value="">Auto (end of season)</option>
                        {roundOptions.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="border rounded px-4 py-2 text-sm bg-black text-white"
          >
            {saving ? 'Saving...' : 'Save settings'}
          </button>
          {saveMsg && <span className="text-sm text-zinc-600">{saveMsg}</span>}
        </div>
      </div>
    </div>
  )
}