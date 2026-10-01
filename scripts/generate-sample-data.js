// Interactive sample data generator + season reset tool.
// Run with: node scripts/generate-sample-data.js

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const readline = require('node:readline/promises')
const { stdin: input, stdout: output } = require('node:process')

const CONF_VALUES = {
  9: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  8: [1, 2, 3, 4, 6, 7, 8, 9],
  7: [1, 2, 3, 5, 7, 8, 9],
  6: [1, 2, 4, 6, 8, 9],
  5: [1, 3, 5, 7, 9],
  4: [2, 4, 6, 8],
  3: [2, 5, 8],
  2: [4, 8],
  1: [9],
}
function getConfValues(n) {
  return CONF_VALUES[n] || Array.from({ length: n }, (_, i) => i + 1)
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function makeSlug(text) {
  return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

async function ask(rl, question, { default: def } = {}) {
  const suffix = def !== undefined && def !== '' ? ` (${def})` : ''
  const answer = (await rl.question(`${question}${suffix}: `)).trim()
  return answer === '' && def !== undefined ? String(def) : answer
}

async function askInt(rl, question, { default: def, min } = {}) {
  while (true) {
    const raw = await ask(rl, question, { default: def })
    const n = parseInt(raw, 10)
    if (!Number.isNaN(n) && (min === undefined || n >= min)) return n
    console.log(`  Please enter a whole number${min !== undefined ? ` >= ${min}` : ''}.`)
  }
}

// Prompts for a season from the ones populated via /admin/fixtures, and returns
// its full, sequence-ordered fixture list plus the unique list of round names in
// order. Shared by both the generator and the reset tool since they both need
// to know "what rounds exist for this season" before doing anything else.
async function pickSeasonAndFixtures(supabase, rl) {
  const { data: seasons, error: seasonsErr } = await supabase
    .from('seasons')
    .select('*')
    .eq('available', true)
    .order('display_name')
  if (seasonsErr || !seasons || seasons.length === 0) {
    throw new Error('No available seasons found - populate one via /admin/fixtures first')
  }
  console.log('\nAvailable seasons:')
  seasons.forEach((s, i) => console.log(`  ${i + 1}) ${s.display_name}`))
  let season
  while (true) {
    const raw = await ask(rl, `Select season (1-${seasons.length})`, { default: 1 })
    const n = parseInt(raw, 10)
    if (n >= 1 && n <= seasons.length) { season = seasons[n - 1]; break }
    console.log('  Invalid selection, try again.')
  }

  const { data: fixturesAll, error: fxErr } = await supabase
    .from('season_fixtures')
    .select('*')
    .eq('season_id', season.id)
    .order('sequence', { ascending: true })
  if (fxErr || !fixturesAll || fixturesAll.length === 0) {
    throw new Error(`No fixtures found for ${season.display_name} - populate it via /admin/fixtures first`)
  }

  const roundOrder = []
  const seenRounds = new Set()
  fixturesAll.forEach(f => {
    if (!seenRounds.has(f.round_name)) { seenRounds.add(f.round_name); roundOrder.push(f.round_name) }
  })

  return { season, fixturesAll, roundOrder }
}

async function generateSampleCompetition(supabase, rl) {
  console.log('\n=== Generate Sample Competition & Data ===\n')

  // --- Competition name ---
  const compName = await ask(rl, 'Competition name', { default: 'QA Test Comp' })

  // --- Sport / season ---
  const { season, fixturesAll, roundOrder } = await pickSeasonAndFixtures(supabase, rl)
  const totalRounds = roundOrder.length

  // --- Owner ---
  const defaultOwner = process.env.DEFAULT_OWNER_EMAIL || undefined
  let ownerEmail
  while (true) {
    ownerEmail = await ask(rl, 'Your login email (becomes comp owner)', { default: defaultOwner })
    if (ownerEmail) break
    console.log('  Email is required.')
  }
  const { data: userList, error: userErr } = await supabase.auth.admin.listUsers()
  if (userErr) { rl.close(); throw new Error('Failed to list users: ' + userErr.message) }
  const owner = userList.users.find(u => u.email === ownerEmail)
  if (!owner) { rl.close(); throw new Error(`No user found with email ${ownerEmail}`) }

  // --- Number of competitors ---
  const numTipsters = await askInt(rl, 'Number of competitors', { default: 20, min: 1 })

  // --- Rounds of data to fill ---
  let numRounds = await askInt(rl, `Rounds of data to fill (season has ${totalRounds})`, { default: totalRounds, min: 1 })
  if (numRounds > totalRounds) {
    console.log(`  Only ${totalRounds} rounds exist this season - generating for the entire season instead.`)
    numRounds = totalRounds
  }
  const roundsToFill = new Set(roundOrder.slice(0, numRounds))
  const fixtures = fixturesAll.filter(f => roundsToFill.has(f.round_name))

  rl.close()

  // --- Create competition ---
  console.log('\nCreating competition...')
  const slug = `${makeSlug(compName)}-${Date.now().toString(36)}`
  const { data: comp, error: compErr } = await supabase
    .from('competitions')
    .insert({
      name: compName,
      slug,
      owner_id: owner.id,
      sport: season.sport,
      season: season.season,
      season_id: season.id,
      status: 'active',
    })
    .select()
    .single()
  if (compErr) throw new Error('Failed to create competition: ' + compErr.message)
  console.log(`  Created "${comp.name}" -> /competition/${comp.slug}`)

  // --- Create tipsters ---
  console.log(`Creating ${numTipsters} tipsters with varied skill levels...`)
  const newMembers = Array.from({ length: numTipsters }, (_, i) => ({
    comp_id: comp.id,
    user_id: null,
    display_name: `Tipster ${i + 1}`,
    paid: true,
    role: 'member',
  }))
  const { data: insertedBots, error: memErr } = await supabase
    .from('members')
    .insert(newMembers)
    .select('id')
  if (memErr) throw new Error('Failed to create tipsters: ' + memErr.message)

  // Also add the owner as a real member, so they can see the comp's data
  // themselves without a manual join step - tips RLS only shows data to
  // fellow members, and the owner alone doesn't count as one.
  console.log('Adding owner as a member too...')
  const { data: ownerMember, error: ownerMemErr } = await supabase
    .from('members')
    .insert({
      comp_id: comp.id,
      user_id: owner.id,
      display_name: owner.email.split('@')[0],
      paid: true,
      role: 'member',
    })
    .select('id')
    .single()
  if (ownerMemErr) throw new Error('Failed to add owner as member: ' + ownerMemErr.message)

  const insertedMembers = [...insertedBots, ownerMember]

  const memberSkill = {}
  insertedMembers.forEach(m => { memberSkill[m.id] = 0.45 + Math.random() * 0.30 })

  // --- Build tips (with occasional upsets, so the bonus multiplier gets exercised) ---
  const rounds = {}
  fixtures.forEach(g => {
    if (!rounds[g.round_name]) rounds[g.round_name] = []
    rounds[g.round_name].push(g)
  })
  const roundNames = Object.keys(rounds)

  const gameCrowdPick = {}
  fixtures.forEach(g => {
    if (!g.result) return
    const isUpset = Math.random() < 0.15
    gameCrowdPick[g.id] = isUpset ? (g.result === g.home ? g.away : g.home) : g.result
  })

  console.log(`Building tips for ${insertedMembers.length} tipsters across ${roundNames.length} rounds (${fixtures.length} games)...`)
  const tipRows = []
  for (const member of insertedMembers) {
    const skill = memberSkill[member.id]
    for (const roundName of roundNames) {
      const games = rounds[roundName]
      const confValues = shuffle(getConfValues(games.length))
      games.forEach((g, idx) => {
        let pick
        if (g.result) {
          const crowdPick = gameCrowdPick[g.id]
          const followsCrowd = Math.random() < 0.85
          const base = followsCrowd ? crowdPick : (crowdPick === g.home ? g.away : g.home)
          pick = Math.random() < skill ? g.result : base
        } else {
          pick = Math.random() < 0.5 ? g.home : g.away
        }
        tipRows.push({ member_id: member.id, fixture_id: g.id, pick, confidence: confValues[idx] })
      })
    }
  }

  console.log(`Upserting ${tipRows.length} tip rows...`)
  const CHUNK = 500
  for (let i = 0; i < tipRows.length; i += CHUNK) {
    const chunk = tipRows.slice(i, i + CHUNK)
    const { error } = await supabase.from('tips').upsert(chunk, { onConflict: 'member_id,fixture_id' })
    if (error) throw new Error('Upsert failed at row ' + i + ': ' + error.message)
  }
  console.log('  Upsert complete.')

  // --- Verification: exact counts straight from the DB ---
  console.log('\nVerifying...')
  const expectedCount = fixtures.length
  let allGood = true
  for (const member of insertedMembers) {
    const { count, error } = await supabase
      .from('tips')
      .select('*', { count: 'exact', head: true })
      .eq('member_id', member.id)
    if (error) throw new Error('Verification query failed: ' + error.message)
    const ok = count === expectedCount
    if (!ok) allGood = false
    console.log(`  ${ok ? 'OK  ' : 'FAIL'}  member ${member.id}: ${count} / ${expectedCount} tips`)
  }

  console.log(allGood
    ? `\nAll ${insertedMembers.length} members verified with exactly ${expectedCount} tips each.`
    : '\nSome members have unexpected counts - see FAIL lines above.')
  console.log(`\nYou've been added as a member (display name "${owner.email.split('@')[0]}") - no need to join separately.`)
  console.log(`Competition ready: /competition/${comp.slug}`)
}

// Resets a season's results back to "not yet played" beyond a chosen round, so
// mid-season states (partial brackets, partial groups, still-live Eliminator)
// can actually be tested instead of every sort/format showing its final,
// fully-resolved state. Only touches `completed`/`result` on season_fixtures -
// never touches tips data, so nobody's picks are lost.
//
// season_fixtures is shared across every competition on that season, so this
// is unavoidably a whole-season operation, not scoped to one competition -
// the same sharing that meant the tips query needed a member_id filter earlier
// means a reset here affects every comp on the season, not just the one you
// have in mind. This function warns with the full list before doing anything.
async function resetSeasonToRound(supabase, rl) {
  console.log('\n=== Reset Season Results To A Round ===\n')

  const { season, fixturesAll, roundOrder } = await pickSeasonAndFixtures(supabase, rl)
  const totalRounds = roundOrder.length

  console.log(`\n${season.display_name} has ${totalRounds} rounds: ${roundOrder[0]} -> ${roundOrder[totalRounds - 1]}`)
  const keepThrough = await askInt(rl, `Keep results through which round number (1-${totalRounds})`, { default: totalRounds, min: 1 })
  if (keepThrough > totalRounds) {
    rl.close()
    throw new Error(`${season.display_name} only has ${totalRounds} rounds.`)
  }
  const cutoffRoundName = roundOrder[keepThrough - 1]
  const cutoffSequence = fixturesAll.find(f => f.round_name === cutoffRoundName).sequence

  const affectedFixtures = fixturesAll.filter(f => f.sequence > cutoffSequence)
  if (affectedFixtures.length === 0) {
    rl.close()
    console.log('\nNothing to reset - already at or before that round.')
    return
  }

  const { data: comps } = await supabase
    .from('competitions')
    .select('name, slug')
    .eq('season_id', season.id)

  console.log(`\nThis will reset ${affectedFixtures.length} game(s) - everything after ${cutoffRoundName} - back to not-yet-played.`)
  console.log(`season_fixtures is shared, so this affects EVERY competition on ${season.display_name}, not just one:`)
  ;(comps || []).forEach(c => console.log(`  - ${c.name}  (/competition/${c.slug})`))
  console.log(`\nThis only resets completed/result - tips data is untouched, nobody's picks are lost.`)
  console.log(`To restore full results afterward, use /admin/fixtures -> Re-populate.`)

  const confirm = await ask(rl, '\nType "yes" to proceed', { default: 'no' })
  rl.close()
  if (confirm.toLowerCase() !== 'yes') {
    console.log('Cancelled - nothing changed.')
    return
  }

  console.log('\nResetting...')
  const idsToReset = affectedFixtures.map(f => f.id)
  const CHUNK = 500
  for (let i = 0; i < idsToReset.length; i += CHUNK) {
    const chunk = idsToReset.slice(i, i + CHUNK)
    const { error } = await supabase
      .from('season_fixtures')
      .update({ completed: false, result: null })
      .in('id', chunk)
    if (error) throw new Error('Reset failed: ' + error.message)
  }

  console.log(`\nDone - ${idsToReset.length} game(s) after ${cutoffRoundName} reset to not-yet-played.`)
  console.log(`Rounds 1-${keepThrough} (through ${cutoffRoundName}) are untouched.`)
}

async function main() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY in .env.local')
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const rl = readline.createInterface({ input, output })

  console.log('=== Sample Data Tool ===')
  console.log('  1) Generate a new sample competition')
  console.log('  2) Reset a season\'s results to a specific round (for testing mid-season states)')
  const mode = await ask(rl, 'Choose an option', { default: '1' })

  if (mode.trim() === '2') {
    await resetSeasonToRound(supabase, rl)
  } else {
    await generateSampleCompetition(supabase, rl)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})