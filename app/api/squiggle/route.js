import { NextResponse } from 'next/server'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const year = searchParams.get('year')

  if (!year) {
    return NextResponse.json(
      { error: 'year is required' },
      { status: 400 }
    )
  }

  const squiggleUrl = `https://api.squiggle.com.au/?q=games;year=${year}`

  try {
    const response = await fetch(squiggleUrl, {
      headers: {
        'User-Agent': 'Collectif Tipping App - ballbagger@hotmail.com',
      },
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: `Squiggle API returned status ${response.status}` },
        { status: 502 }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to reach Squiggle: ${err.message}` },
      { status: 502 }
    )
  }
}