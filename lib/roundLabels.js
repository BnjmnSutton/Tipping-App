// Short display code for a round name - finals get standard AFL finals-series
// codes (WF/QF/EF/SF/PF/GF) instead of their full names; regular season rounds
// get "Round 12" -> "R12". Matches by substring (case-insensitive) rather than
// an exact lookup table, so it's resilient to whatever exact wording the
// fixture source (Squiggle, or however a round was named) uses.
export function shortRoundLabel(roundName) {
  if (!roundName) return roundName
  const lower = roundName.toLowerCase()
  if (lower.includes('wildcard')) return 'WF'
  if (lower.includes('qualifying')) return 'QF'
  if (lower.includes('elimination')) return 'EF'
  if (lower.includes('preliminary')) return 'PF'
  if (lower.includes('semi')) return 'SF'
  if (lower.includes('grand')) return 'GF'
  return roundName.replace('Round ', 'R')
}