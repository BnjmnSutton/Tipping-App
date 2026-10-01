export const DEFAULT_FORMAT_LABELS = {
  leaderboard: 'Leaderboard',
  mvp: 'MVP',
  finals_leaderboard: 'Finals Leaderboard',
  eliminator: 'Eliminator',
  ko_cup_1: 'KO Cup 1',
  ko_cup_2: 'KO Cup 2',
  champions_league: 'Champions League',
  night_prem: 'Night Premiership',
}

// Formats that can be turned off entirely. Tips/Round Results/Leaderboard/Overview
// are core and always on - not included here.
export const TOGGLEABLE_FORMATS = ['mvp', 'finals_leaderboard', 'eliminator', 'ko_cup_1', 'ko_cup_2', 'champions_league', 'night_prem']

// Formats that support a custom name, even if not toggleable (Leaderboard is core but nameable)
export const NAMEABLE_FORMATS = ['leaderboard', 'mvp', 'finals_leaderboard', 'eliminator', 'ko_cup_1', 'ko_cup_2', 'champions_league', 'night_prem']

export function getFormatLabel(key, competition) {
  return competition?.format_config?.names?.[key] || DEFAULT_FORMAT_LABELS[key] || key
}

export function isFormatEnabled(key, competition) {
  const enabled = competition?.format_config?.enabled
  if (!enabled || !(key in enabled)) return true // default on if not explicitly configured
  return !!enabled[key]
}

// Round-window override - returns a round_name string (e.g. "Round 7") or null if unset
export function getRoundOverride(key, competition) {
  return competition?.format_config?.rounds?.[key]?.start || null
}