import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import {
  handleCors,
  jsonResponse,
  createSupabaseClient,
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
    const eventName = data.event_name as string | undefined
    const payload = data.payload ?? {}
    const deviceHash = data.device_hash as string | undefined

    if (!eventName || typeof eventName !== 'string') {
      return jsonResponse(
        { success: false, error: 'event_name is required and must be a string', code: 'INVALID_PAYLOAD' },
        400,
      )
    }

    if (!deviceHash || typeof deviceHash !== 'string') {
      return jsonResponse(
        { success: false, error: 'device_hash is required and must be a string', code: 'INVALID_PAYLOAD' },
        400,
      )
    }

    const supabase = createSupabaseClient()

    const { error: insertErr } = await supabase
      .from('device_events_v2')
      .insert({
        event_name: eventName,
        payload: payload,
        device_hash: deviceHash,
      })

    if (insertErr) throw insertErr

    console.log(`[device-event] Event ${eventName} registered for device: ${deviceHash}`)

    return jsonResponse({ success: true }, 200)
  } catch (error) {
    console.error('[device-event] Error:', error)
    return jsonResponse({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500)
  }
})
