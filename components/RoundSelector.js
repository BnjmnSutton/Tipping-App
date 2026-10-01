'use client'
import { shortRoundLabel } from '@/lib/roundLabels'

export default function RoundSelector({ roundsList, selectedRound, onChange }) {
  const idx = roundsList.findIndex(r => r.round_name === selectedRound)
  const prevRound = idx > 0 ? roundsList[idx - 1].round_name : null
  const nextRound = idx < roundsList.length - 1 ? roundsList[idx + 1].round_name : null

  return (
    <div className="w-full max-w-sm flex items-center gap-2 mb-2">
      <button
        disabled={!prevRound}
        onClick={() => prevRound && onChange(prevRound)}
        className="border rounded px-3 py-2 text-sm disabled:opacity-30"
      >
        ‹
      </button>

      <select
        value={selectedRound || ''}
        onChange={e => onChange(e.target.value)}
        className="border rounded px-2 py-2 text-sm flex-1 text-center"
      >
        {roundsList.map(r => (
          <option key={r.round_name} value={r.round_name}>
            {/* Finals get their short code (WF/QF/EF/SF/PF/GF); regular rounds keep
                the full "Round N" name, since there's room for it in a dropdown */}
            {r.round_type === 'final' ? shortRoundLabel(r.round_name) : r.round_name}
          </option>
        ))}
      </select>

      <button
        disabled={!nextRound}
        onClick={() => nextRound && onChange(nextRound)}
        className="border rounded px-3 py-2 text-sm disabled:opacity-30"
      >
        ›
      </button>
    </div>
  )
}