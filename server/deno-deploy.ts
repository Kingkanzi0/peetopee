/**
 * Peetopee API — Deno Deploy version
 * Uses Deno KV (built-in, free, persistent) as the database.
 * Deploy at: https://dash.deno.com/new
 */

const kv = await Deno.openKv()

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
function err(msg: string, status = 400) { return json({ error: msg }, status) }

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const path = url.pathname

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }})

  if (path === '/health') return json({ ok: true })

  if (req.method === 'POST' && path === '/register') {
    const body = await req.json()
    const { email, ptpId, displayName, countryCode = '', avatarUrl = '' } = body
    if (!email || !ptpId || !displayName) return err('email, ptpId and displayName required')
    const normalised = ptpId.startsWith('@') ? ptpId : `@${ptpId}`

    // Check uniqueness
    const handleEntry = await kv.get<string>(['handle_to_email', normalised])
    if (handleEntry.value && handleEntry.value !== email) return err('That Peetopee ID is already taken', 409)

    const existing = await kv.get<Record<string, unknown>>(['user', email])
    const user = { email, ptpId: normalised, displayName, countryCode, avatarUrl: avatarUrl || existing.value?.avatarUrl || '' }
    await kv.atomic()
      .set(['user', email], user)
      .set(['handle_to_email', normalised], email)
      .commit()
    return json({ ok: true, ptpId: normalised })
  }

  if (req.method === 'GET' && path === '/lookup') {
    const q = url.searchParams.get('q')?.trim()
    if (!q) return err('q required')
    const isHandle = q.startsWith('@') || !q.includes('@')
    const term = isHandle ? (q.startsWith('@') ? q : `@${q}`) : q

    let userEmail: string | null = null
    if (isHandle) {
      const r = await kv.get<string>(['handle_to_email', term])
      userEmail = r.value ?? null
    } else {
      userEmail = term
    }
    if (!userEmail) return json({ found: false })

    const userEntry = await kv.get<Record<string, unknown>>(['user', userEmail])
    if (!userEntry.value) return json({ found: false })

    const walletsEntry = await kv.get<Record<string, string>>(['wallets', userEmail])
    const walletAddresses: Record<number, string> = {}
    for (const [k, v] of Object.entries(walletsEntry.value ?? {})) {
      walletAddresses[parseInt(k)] = v
    }

    return json({ found: true, user: { ...userEntry.value, walletAddresses } })
  }

  if (req.method === 'POST' && path === '/link-wallet') {
    const body = await req.json()
    const { email, chainId, address } = body
    if (!email || !chainId || !address) return err('email, chainId, address required')
    const existing = await kv.get<Record<string, string>>(['wallets', email])
    const wallets = { ...(existing.value ?? {}), [String(chainId)]: address }
    await kv.set(['wallets', email], wallets)
    return json({ ok: true })
  }

  return err('Not found', 404)
})
