import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import {
  handleCors,
  jsonResponse,
  createTokenV2,
  createSupabaseClient,
  checkRateLimitV2,
  getClientInfo,
  DeviceRecord,
} from '../_shared/utils.ts'

serve(async (req) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    if (req.method !== 'POST') {
      return jsonResponse({ success: false, error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' }, 405)
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ success: false, error: 'Invalid JSON body', code: 'INVALID_PAYLOAD' }, 400)
    }

    const data = body as Record<string, unknown>
    const deviceHash = data.device_hash as string | undefined

    if (!deviceHash || typeof deviceHash !== 'string' || deviceHash.length < 10) {
      return jsonResponse(
        { success: false, error: 'device_hash is required and must be a valid string', code: 'INVALID_PAYLOAD' },
        400,
      )
    }

    const supabase = createSupabaseClient()
    const clientInfo = getClientInfo(req)

    const rateLimited = await checkRateLimitV2(supabase, deviceHash)
    if (rateLimited) {
      console.log(`[device-token] Rate limit exceeded for device: ${deviceHash}`)
      return jsonResponse({ success: false, error: 'Too many requests', code: 'RATE_LIMITED' }, 429)
    }

    const { data: device, error: lookupErr } = await supabase
      .from('devices')
      .select('*')
      .eq('device_hash', deviceHash)
      .maybeSingle()

    if (lookupErr) throw lookupErr

    if (!device) {
      console.log(`[device-token] Device not found: ${deviceHash}`)
      return jsonResponse({ success: false, error: 'Device not found. Please register first.', code: 'DEVICE_NOT_FOUND' }, 404)
    }

    const jwtSecret = Deno.env.get('SUPABASE_JWT_SECRET')
    if (!jwtSecret) throw new Error('SUPABASE_JWT_SECRET not configured')

    const { token, expiresAt } = await createTokenV2(device as DeviceRecord, jwtSecret)

    const { error: eventErr } = await supabase
      .from('device_events_v2')
      .insert({
        event_name: 'DEVICE_TOKEN_REFRESHED',
        payload: { deviceHash },
        device_hash: deviceHash,
      })

    if (eventErr) console.error('[device-token] Failed to register event:', eventErr)

    console.log(`[device-token] Token refreshed for device: ${deviceHash}`)

    return jsonResponse(
      {
        success: true,
        token,
        expiresAt,
        device: {
          device_hash: device.device_hash,
          plan: device.plan,
          planExpiresAt: device.plan_expires_at,
        },
      },
      200,
    )
  } catch (error) {
    console.error('[device-token] Error:', error)
    return jsonResponse({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500)
  }
})
