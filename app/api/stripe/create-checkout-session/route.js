import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

export async function POST(request) {
  try {
    const { competitionId } = await request.json()
    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    // Verify who's actually calling this, using their own access token
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    const { data: { user }, error: userError } = await anon.auth.getUser(token)
    if (userError || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    // Service role for the actual reads/writes - identity is already verified above
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

    const { data: comp, error: compError } = await admin
      .from('competitions')
      .select('*')
      .eq('id', competitionId)
      .single()
    if (compError || !comp) return NextResponse.json({ error: 'Competition not found' }, { status: 404 })
    if (comp.owner_id !== user.id) {
      return NextResponse.json({ error: 'Only the competition owner can do this' }, { status: 403 })
    }

    const { count: memberCount } = await admin
      .from('members')
      .select('*', { count: 'exact', head: true })
      .eq('comp_id', competitionId)

    if (!memberCount || memberCount <= comp.paid_member_count) {
      return NextResponse.json({ error: 'This competition is already fully paid for its current members.' }, { status: 400 })
    }

    const amountCents = memberCount * 500 // $5.00/member, AUD

    const { data: payment, error: paymentError } = await admin
      .from('payments')
      .insert({
        competition_id: competitionId,
        member_count_covered: memberCount,
        amount_cents: amountCents,
        status: 'pending',
      })
      .select()
      .single()
    if (paymentError) throw paymentError

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      allow_promotion_codes: true,
      line_items: [
        {
          price_data: {
            currency: 'aud',
            product_data: { name: `${comp.name} - Season payment (${memberCount} members)` },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      success_url: `${siteUrl}/competition/${comp.slug}/settings?paid=1`,
      cancel_url: `${siteUrl}/competition/${comp.slug}/settings?paid=0`,
      metadata: {
        payment_id: payment.id,
        competition_id: competitionId,
        member_count: String(memberCount),
      },
    })

    await admin.from('payments').update({ stripe_session_id: session.id }).eq('id', payment.id)

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('Checkout session error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}