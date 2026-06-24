import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import {
  handleCors,
  jsonResponse,
  verifyToken,
  createSupabaseClient,
  getClientInfo,
} from '../_shared/utils.ts'

serve(async (req) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    if (req.method !== 'POST') {
      return jsonResponse({ success: false, error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' }, 405)
    }

    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ success: false, error: 'Missing or invalid authorization', code: 'UNAUTHORIZED' }, 401)
    }

    const jwtSecret = Deno.env.get('SUPABASE_JWT_SECRET')
    if (!jwtSecret) throw new Error('SUPABASE_JWT_SECRET not configured')

    const claims = await verifyToken(authHeader.slice(7), jwtSecret)
    if (!claims) {
      return jsonResponse({ success: false, error: 'Invalid or expired token', code: 'UNAUTHORIZED' }, 401)
    }

    const deviceHash = claims.device_hash as string
    if (!deviceHash) {
      return jsonResponse({ success: false, error: 'Invalid token claims', code: 'UNAUTHORIZED' }, 401)
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ success: false, error: 'Invalid JSON body', code: 'INVALID_PAYLOAD' }, 400)
    }

    if (!body || typeof body !== 'object') {
      return jsonResponse({ success: false, error: 'Request body must be a JSON object', code: 'INVALID_PAYLOAD' }, 400)
    }

    const supabase = createSupabaseClient()
    const now = new Date().toISOString()
    const profileData = (body as Record<string, unknown>).profile ?? {}

    const { error: upsertErr } = await supabase
      .from('device_profiles')
      .upsert(
        {
          device_id: deviceHash,
          profile_data: profileData,
          updated_at: now,
        },
        { onConflict: 'device_id' },
      )

    if (upsertErr) throw upsertErr

    const { data: synced } = await supabase
      .from('device_profiles')
      .select('profile_data, updated_at')
      .eq('device_id', deviceHash)
      .single()

    console.log(`[profile-sync] Profile synced for device: ${deviceHash}`)

    return jsonResponse(
      {
        success: true,
        profile: synced?.profile_data ?? {},
        updatedAt: synced?.updated_at ?? now,
      },
      200,
    )
  } catch (error) {
    console.error('[profile-sync] Error:', error)
    return jsonResponse({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500)
  }
})
