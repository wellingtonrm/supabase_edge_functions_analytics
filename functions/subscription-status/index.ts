import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import {
  handleCors,
  jsonResponse,
  verifyToken,
  createTokenV2,
  createSupabaseClient,
  DeviceRecord,
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

    const jwtSecret = Deno.env.get('JWT_SECRET')
    if (!jwtSecret) throw new Error('JWT_SECRET not configured')

    const claims = await verifyToken(authHeader.slice(7), jwtSecret)
    if (!claims) {
      return jsonResponse({ success: false, error: 'Invalid or expired token', code: 'UNAUTHORIZED' }, 401)
    }

    const deviceHash = claims.device_hash as string
    if (!deviceHash) {
      return jsonResponse({ success: false, error: 'Invalid token claims', code: 'UNAUTHORIZED' }, 401)
    }

    const supabase = createSupabaseClient()

    const { data: device, error: lookupErr } = await supabase
      .from('devices')
      .select('*')
      .eq('device_hash', deviceHash)
      .maybeSingle()

    if (lookupErr) throw lookupErr

    if (!device) {
      return jsonResponse({ success: false, error: 'Device not found', code: 'DEVICE_NOT_FOUND' }, 404)
    }

    const planExpiresAt = device.plan_expires_at
    const isExpired = planExpiresAt && new Date(planExpiresAt) < new Date()

    const response: Record<string, unknown> = {
      success: true,
      device_hash: device.device_hash,
      plan: isExpired ? 'free' : device.plan,
      planExpiresAt: planExpiresAt,
      installCount: device.install_count,
    }

    const needsTokenRefresh =
      claims.plan !== device.plan ||
      claims.planExpiresAt !== device.plan_expires_at ||
      (claims.exp as number) < Math.floor(Date.now() / 1000) + 86400

    if (needsTokenRefresh) {
      const { token, expiresAt } = await createTokenV2(device as DeviceRecord, jwtSecret)
      response.token = token
      response.tokenExpiresAt = expiresAt
    }

    return jsonResponse(response, 200)
  } catch (error) {
    console.error('[subscription-status] Error:', error)
    return jsonResponse({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500)
  }
})
