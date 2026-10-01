const GRACE_PERIOD_MS = 14 * 24 * 60 * 60 * 1000 // 2 weeks

// Ranks members by join order and marks which ones are covered by the
// competition's current paid_member_count. Payment always covers the
// earliest joiners first - anyone joining later, beyond that count, is
// uncovered until a future top-up raises the count high enough to include them.
export function getMemberCoverage(members, paidMemberCount) {
  const sorted = [...members].sort((a, b) => new Date(a.joined_at) - new Date(b.joined_at))
  return sorted.map((m, i) => ({
    member: m,
    rank: i + 1,
    covered: (i + 1) <= paidMemberCount,
  }))
}

// Lock status for one specific member. Only ever locks members who are both
// (a) uncovered by payment and (b) past their own 2-week grace period since
// joining - covered/earlier members are never affected by a later join.
export function getMemberLockStatus(memberId, members, competition) {
  if (competition?.admin_unlocked) {
    return { locked: false, covered: true, graceExpiresAt: null, daysLeft: null }
  }

  const coverage = getMemberCoverage(members, competition?.paid_member_count || 0)
  const entry = coverage.find(c => c.member.id === memberId)
  if (!entry || entry.covered) {
    return { locked: false, covered: true, graceExpiresAt: null, daysLeft: null }
  }

  const joinedAt = new Date(entry.member.joined_at)
  const graceExpiresAt = new Date(joinedAt.getTime() + GRACE_PERIOD_MS)
  const now = new Date()
  const locked = now > graceExpiresAt
  const daysLeft = locked ? 0 : Math.ceil((graceExpiresAt - now) / (24 * 60 * 60 * 1000))

  return { locked, covered: false, graceExpiresAt, daysLeft }
}