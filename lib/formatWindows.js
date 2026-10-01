import { getKoCupSize } from './koCup'

// Eliminator's active window within regularRoundsList, honoring admin start/end overrides.
export function getEliminatorWindow(regularRoundsList, competition) {
  const elimConfig = competition.format_config?.rounds?.eliminator || {}
  let startIdx = elimConfig.start ? regularRoundsList.findIndex(r => r.round_name === elimConfig.start) : 0
  let endIdx = elimConfig.end ? regularRoundsList.findIndex(r => r.round_name === elimConfig.end) : regularRoundsList.length - 1
  if (startIdx < 0) startIdx = 0
  if (endIdx < 0) endIdx = regularRoundsList.length - 1
  return { startIdx, endIdx }
}

// KO Cup 1 and 2 share the same placement logic (Cup 2 anchors the end of the
// regular season, Cup 1 finishes right as Cup 2 - or Champions League - would
// begin), honoring admin start overrides. Pass isCup2 to pick which one.
export function getKoCupWindow(N, regularRoundsList, competition, isCup2) {
  const R = regularRoundsList.length
  const { k } = getKoCupSize(N)
  let cup2StartIdx = Math.max(R - k, 0)
  let cup1StartIdx = Math.max(Math.floor(R / 2) - k, 0)
  if (cup1StartIdx + k > cup2StartIdx) cup1StartIdx = Math.max(0, cup2StartIdx - k)
  let startIdx = isCup2 ? cup2StartIdx : cup1StartIdx
  const overrideKey = isCup2 ? 'ko_cup_2' : 'ko_cup_1'
  const override = competition.format_config?.rounds?.[overrideKey]?.start
  if (override) {
    const idx = regularRoundsList.findIndex(r => r.round_name === override)
    if (idx >= 0) startIdx = idx
  }
  return { k, startIdx, endIdx: startIdx + k - 1 }
}

// Champions League's 11-round block (6 group + 2 QF + 2 SF + 1 GF), centered
// on the regular season's midpoint, honoring an admin start override.
export function getChampionsLeagueWindow(regularRoundsList, competition) {
  const R = regularRoundsList.length
  const CL_LEN = 11
  let startIdx = Math.floor(R / 2) - Math.floor(CL_LEN / 2)
  startIdx = Math.max(0, Math.min(startIdx, R - CL_LEN))
  const override = competition.format_config?.rounds?.champions_league?.start
  if (override) {
    const idx = regularRoundsList.findIndex(r => r.round_name === override)
    if (idx >= 0) startIdx = idx
  }
  return { CL_LEN, startIdx, endIdx: startIdx + CL_LEN - 1 }
}

// Night Prem's cutoff position - computed from the regular-season count so
// finals never shift where it falls, honoring an admin start override.
// `roundsList` here should be the full season (regular + finals), matching
// how computeNightPremState uses it.
export function getNightPremStartIdx(regularCount, roundsList, competition) {
  let startIdx = Math.floor(regularCount / 2)
  const override = competition.format_config?.rounds?.night_prem?.start
  if (override) {
    const idx = roundsList.findIndex(r => r.round_name === override)
    if (idx >= 0) startIdx = idx
  }
  return startIdx
}

// Cheap (no simulation) check of whether `selectedRound` falls inside a
// format's active window - used to grey out a sort option that has nothing
// meaningful to show for whichever round is currently being viewed, without
// re-running that format's actual bracket/group simulation just to find out.
export function isFormatActiveForRound(sortMode, {
  members, roundsList, regularRoundsList, competition, selectedRound,
}) {
  if (sortMode === 'round' || sortMode === 'gc') return true

  const currentRound = roundsList.find(r => r.round_name === selectedRound)

  if (sortMode === 'mvp') {
    return currentRound?.round_type !== 'final'
  }

  if (sortMode === 'finals_leaderboard') {
    return currentRound?.round_type === 'final'
  }

  if (sortMode === 'eliminator') {
    const { startIdx, endIdx } = getEliminatorWindow(regularRoundsList, competition)
    const idx = regularRoundsList.findIndex(r => r.round_name === selectedRound)
    return idx >= startIdx && idx <= endIdx
  }

  if (sortMode === 'ko_cup_1' || sortMode === 'ko_cup_2') {
    const N = members.length
    if (N <= 1) return false
    const { k, startIdx, endIdx } = getKoCupWindow(N, regularRoundsList, competition, sortMode === 'ko_cup_2')
    if (regularRoundsList.length < k) return false
    const idx = regularRoundsList.findIndex(r => r.round_name === selectedRound)
    return idx >= startIdx && idx <= endIdx
  }

  if (sortMode === 'champions_league') {
    const { CL_LEN, startIdx, endIdx } = getChampionsLeagueWindow(regularRoundsList, competition)
    if (regularRoundsList.length < CL_LEN) return false
    const idx = regularRoundsList.findIndex(r => r.round_name === selectedRound)
    return idx >= startIdx && idx <= endIdx
  }

  if (sortMode === 'night_prem') {
    const startIdx = getNightPremStartIdx(regularRoundsList.length, roundsList, competition)
    const idx = roundsList.findIndex(r => r.round_name === selectedRound)
    return idx >= startIdx
  }

  return true
}