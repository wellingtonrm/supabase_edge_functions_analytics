import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import {
  handleCors,
  jsonResponse,
  validateDevicePayload,
  generateFingerprint,
  createSupabaseClient,
  checkRateLimit,
  getClientInfo,
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

    const validation = validateDevicePayload(body)
    if (!validation.valid) {
      return jsonResponse({ success: false, error: validation.error, code: 'INVALID_PAYLOAD' }, 400)
    }

    const supabase = createSupabaseClient()
    const payload = validation.payload!
    const clientInfo = getClientInfo(req)

    const fingerprint = await generateFingerprint(payload)

    const rateLimited = await checkRateLimit(supabase, fingerprint)
    if (rateLimited) {
      console.log(`[device-register] Rate limit exceeded for device: ${payload.deviceId}`)
      return jsonResponse({ success: false, error: 'Too many requests', code: 'RATE_LIMITED' }, 429)
    }

    const { data: existing } = await supabase
      .from('devices')
      .select('id, install_count')
      .eq('device_hash', fingerprint)
      .maybeSingle()

    let isNew = false

    if (existing) {
      const { error: updateErr } = await supabase
        .from('devices')
        .update({
          install_count: existing.install_count + 1,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)

      if (updateErr) throw updateErr
    } else {
      isNew = true
      const now = new Date().toISOString()

      const { error: insertErr } = await supabase
        .from('devices')
        .insert({
          device_hash: fingerprint,
          install_count: 1,
          plan: 'free',
          first_seen_at: now,
          last_seen_at: now,
          created_at: now,
          updated_at: now,
        })

      if (insertErr) throw insertErr
    }

    const { error: eventErr } = await supabase
      .from('device_events_v2')
      .insert({
        event_name: 'DEVICE_REGISTERED',
        payload: { fingerprint, isNew },
        device_hash: fingerprint,
      })

    if (eventErr) console.error('[device-register] Failed to register event:', eventErr)

    console.log(`[device-register] Device ${isNew ? 'created' : 'updated'}: ${payload.deviceId}`)

    return jsonResponse(
      {
        success: true,
        device: {
          deviceId: payload.deviceId,
          fingerprint,
          isNew,
        },
      },
      200,
    )
  } catch (error) {
    console.error('[device-register] Error:', error)
    return jsonResponse({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500)
  }
})
