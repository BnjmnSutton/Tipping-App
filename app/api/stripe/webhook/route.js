import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

export async function POST(request) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  let event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const { payment_id, competition_id, member_count } = session.metadata || {}

    if (payment_id && competition_id) {
      const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

      await admin.from('payments').update({ status: 'completed' }).eq('id', payment_id)

      // Only ever raise coverage, never lower it - guards against a stray webhook replay
      const { data: comp } = await admin
        .from('competitions')
        .select('paid_member_count')
        .eq('id', competition_id)
        .single()

      const newCount = Math.max(comp?.paid_member_count || 0, Number(member_count) || 0)

      await admin
        .from('competitions')
        .update({ paid_member_count: newCount })
        .eq('id', competition_id)
    }
  }

  return NextResponse.json({ received: true })
}