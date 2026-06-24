import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import {
  handleCors,
  jsonResponse,
  validateBootstrapPayload,
  generateDeviceHash,
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

    const validation = validateBootstrapPayload(body)
    if (!validation.valid) {
      return jsonResponse({ success: false, error: validation.error, code: 'INVALID_PAYLOAD' }, 400)
    }

    const payload = validation.payload!

    const jwtSecret = Deno.env.get('JWT_SECRET')
    if (!jwtSecret) throw new Error('JWT_SECRET not configured')

    const supabase = createSupabaseClient()
    const clientInfo = getClientInfo(req)

    const deviceHash = await generateDeviceHash(payload.androidId)

    const rateLimited = await checkRateLimitV2(supabase, deviceHash)
    if (rateLimited) {
      console.log(`[device-bootstrap] Rate limit exceeded for device: ${deviceHash}`)
      return jsonResponse({ success: false, error: 'Too many requests', code: 'RATE_LIMITED' }, 429)
    }

    const { data: existing } = await supabase
      .from('devices')
      .select('*')
      .eq('device_hash', deviceHash)
      .maybeSingle()

    let isNew = false
    let device: DeviceRecord

    if (existing) {
      const now = new Date().toISOString()
      const { data: updated, error: updateErr } = await supabase
        .from('devices')
        .update({
          install_count: existing.install_count + 1,
          last_seen_at: now,
          updated_at: now,
        })
        .eq('id', existing.id)
        .select('*')
        .single()

      if (updateErr) throw updateErr
      device = updated as DeviceRecord
    } else {
      isNew = true
      const now = new Date().toISOString()
      const { data: inserted, error: insertErr } = await supabase
        .from('devices')
        .insert({
          device_hash: deviceHash,
          install_count: 1,
          plan: 'free',
          first_seen_at: now,
          last_seen_at: now,
          created_at: now,
          updated_at: now,
        })
        .select('*')
        .single()

      if (insertErr) throw insertErr
      device = inserted as DeviceRecord
    }

    const { token, expiresAt } = await createTokenV2(device, jwtSecret)

    const { error: eventErr } = await supabase
      .from('device_events_v2')
      .insert({
        event_name: 'DEVICE_BOOTSTRAP',
        payload: { deviceHash, isNew, installCount: device.install_count },
        device_hash: deviceHash,
      })

    if (eventErr) console.error('[device-bootstrap] Failed to register event:', eventErr)

    console.log(`[device-bootstrap] Device ${isNew ? 'created' : 'updated'}: ${deviceHash} (count: ${device.install_count})`)

    return jsonResponse(
      {
        success: true,
        device: {
          device_hash: device.device_hash,
          plan: device.plan,
          planExpiresAt: device.plan_expires_at,
          isNew,
          installCount: device.install_count,
        },
        token,
        expiresAt,
      },
      200,
    )
  } catch (error) {
    console.error('[device-bootstrap] Error:', error)
    return jsonResponse({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500)
  }
})
