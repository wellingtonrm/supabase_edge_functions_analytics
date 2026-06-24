import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import {
  handleCors,
  jsonResponse,
  validateDevicePayload,
  validateBootstrapPayload,
  generateFingerprint,
  generateDeviceHash,
  createToken,
  createTokenV2,
  verifyToken,
  getClientInfo,
  DevicePayload,
  DeviceRecord,
  CORS_HEADERS,
} from '../functions/_shared/utils.ts'

const JWT_SECRET = 'test-jwt-secret-supabase-jwt-secret-local'
const PORT = 8080

interface StoredDevice {
  id: string
  device_id: string
  installation_id: string
  fingerprint: string
  platform: string
  app_version: string | null
  build_number: string | null
  created_at: string
  updated_at: string
  last_seen_at: string
}

interface StoredEvent {
  id: string
  device_id: string
  event_type: string
  payload: unknown
  created_at: string
  ip_address: string
  user_agent: string
}

interface StoredSubscription {
  id: string
  device_id: string
  tier: string
  status: string
  expires_at: string | null
  created_at: string
  updated_at: string
}

interface StoredProfile {
  id: string
  device_id: string
  profile_data: unknown
  created_at: string
  updated_at: string
}

interface StoredDeviceV2 {
  id: string
  device_hash: string
  install_count: number
  plan: string
  plan_expires_at: string | null
  first_seen_at: string
  last_seen_at: string
  created_at: string
  updated_at: string
}

interface StoredEventV2 {
  id: string
  event_name: string
  payload: unknown
  device_hash: string
  created_at: string
  expires_at: string
}

const devices: StoredDevice[] = []
const events: StoredEvent[] = []
const subscriptions: StoredSubscription[] = []
const profiles: StoredProfile[] = []
const devicesV2: StoredDeviceV2[] = []
const eventsV2: StoredEventV2[] = []

let nextId = 1
function genId(): string { return `test_${nextId++}` }

function findDeviceByFingerprint(fp: string): StoredDevice | undefined {
  return devices.find((d) => d.fingerprint === fp)
}

function findSubByDeviceId(did: string): StoredSubscription | undefined {
  return subscriptions.find((s) => s.device_id === did)
}

function findProfileByDeviceId(did: string): StoredProfile | undefined {
  return profiles.find((p) => p.device_id === did)
}

function findDeviceV2ByHash(hash: string): StoredDeviceV2 | undefined {
  return devicesV2.find((d) => d.device_hash === hash)
}

function countRecentEvents(deviceId: string, windowMs: number): number {
  const cutoff = Date.now() - windowMs
  return events.filter(
    (e) => e.device_id === deviceId && new Date(e.created_at).getTime() > cutoff,
  ).length
}

function countRecentEventsV2(deviceHash: string, windowMs: number): number {
  const cutoff = Date.now() - windowMs
  return eventsV2.filter(
    (e) => e.device_hash === deviceHash && new Date(e.created_at).getTime() > cutoff,
  ).length
}

async function handler(req: Request): Promise<Response> {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  const url = new URL(req.url)
  const path = url.pathname.replace(/\/$/, '')

  try {
    switch (path) {
      case '/device-register':
        return handleRegister(req)
      case '/device-token':
        return handleToken(req)
      case '/device-event':
        return handleEvent(req)
      case '/device-bootstrap':
        return handleBootstrap(req)
      case '/subscription-status':
        return handleSubscriptionStatus(req)
      case '/profile-sync':
        return handleProfileSync(req)
      default:
        return jsonResponse({ success: false, error: 'Not found' }, 404)
    }
  } catch (err) {
    console.error(`[${path}] Error:`, err)
    return jsonResponse({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500)
  }
}

async function handleRegister(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' }, 405)
  }

  let body: unknown
  try { body = await req.json() }
  catch { return jsonResponse({ success: false, error: 'Invalid JSON body', code: 'INVALID_PAYLOAD' }, 400) }

  const validation = validateDevicePayload(body)
  if (!validation.valid) {
    return jsonResponse({ success: false, error: validation.error, code: 'INVALID_PAYLOAD' }, 400)
  }

  const payload = validation.payload!
  const clientInfo = getClientInfo(req)

  if (countRecentEvents(payload.deviceId, 3600_000) >= 20) {
    return jsonResponse({ success: false, error: 'Too many requests', code: 'RATE_LIMITED' }, 429)
  }

  const fingerprint = await generateFingerprint(payload)
  const existing = findDeviceByFingerprint(fingerprint)
  let isNew = false

  if (existing) {
    existing.last_seen_at = new Date().toISOString()
    existing.app_version = payload.appVersion ?? null
    existing.build_number = payload.buildNumber ?? null
    existing.updated_at = new Date().toISOString()
  } else {
    isNew = true
    devices.push({
      id: genId(),
      device_id: payload.deviceId,
      installation_id: payload.installationId,
      fingerprint,
      platform: payload.platform,
      app_version: payload.appVersion ?? null,
      build_number: payload.buildNumber ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    })
    subscriptions.push({
      id: genId(),
      device_id: payload.deviceId,
      tier: 'free',
      status: 'active',
      expires_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  }

  events.push({
    id: genId(),
    device_id: payload.deviceId,
    event_type: 'DEVICE_REGISTERED',
    payload: { fingerprint, isNew },
    created_at: new Date().toISOString(),
    ip_address: clientInfo.ipAddress,
    user_agent: clientInfo.userAgent,
  })

  return jsonResponse({
    success: true,
    device: { deviceId: payload.deviceId, fingerprint, isNew },
  }, 200)
}

async function handleToken(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' }, 405)
  }

  let body: unknown
  try { body = await req.json() }
  catch { return jsonResponse({ success: false, error: 'Invalid JSON body', code: 'INVALID_PAYLOAD' }, 400) }

  const data = body as Record<string, unknown>
  const deviceHash = data.device_hash as string | undefined

  if (!deviceHash || typeof deviceHash !== 'string') {
    return jsonResponse(
      { success: false, error: 'device_hash is required', code: 'INVALID_PAYLOAD' },
      400,
    )
  }

  const clientInfo = getClientInfo(req)

  if (countRecentEventsV2(deviceHash, 3600_000) >= 20) {
    return jsonResponse({ success: false, error: 'Too many requests', code: 'RATE_LIMITED' }, 429)
  }

  const device = findDeviceV2ByHash(deviceHash)
  if (!device) {
    return jsonResponse({ success: false, error: 'Device not found. Please register first.', code: 'DEVICE_NOT_FOUND' }, 404)
  }

  const deviceRecord: DeviceRecord = {
    id: device.id,
    device_hash: device.device_hash,
    install_count: device.install_count,
    plan: device.plan,
    plan_expires_at: device.plan_expires_at,
    first_seen_at: device.first_seen_at,
    last_seen_at: device.last_seen_at,
    created_at: device.created_at,
    updated_at: device.updated_at,
  }

  const { token, expiresAt } = await createTokenV2(deviceRecord, JWT_SECRET)

  eventsV2.push({
    id: genId(),
    event_name: 'DEVICE_TOKEN_REFRESHED',
    payload: { deviceHash },
    device_hash: deviceHash,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 90 * 86400 * 1000).toISOString(),
  })

  return jsonResponse({
    success: true,
    token,
    expiresAt,
    device: {
      device_hash: device.device_hash,
      plan: device.plan,
      planExpiresAt: device.plan_expires_at,
    },
  }, 200)
}

async function handleEvent(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' }, 405)
  }

  let body: unknown
  try { body = await req.json() }
  catch { return jsonResponse({ success: false, error: 'Invalid JSON body', code: 'INVALID_PAYLOAD' }, 400) }

  const data = body as Record<string, unknown>
  const eventName = data.event_name as string | undefined
  const payload = data.payload ?? {}
  const deviceHash = data.device_hash as string | undefined

  if (!eventName || typeof eventName !== 'string') {
    return jsonResponse(
      { success: false, error: 'event_name is required', code: 'INVALID_PAYLOAD' },
      400,
    )
  }
  if (!deviceHash || typeof deviceHash !== 'string') {
    return jsonResponse(
      { success: false, error: 'device_hash is required', code: 'INVALID_PAYLOAD' },
      400,
    )
  }

  eventsV2.push({
    id: genId(),
    event_name: eventName,
    payload,
    device_hash: deviceHash,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 90 * 86400 * 1000).toISOString(),
  })

  return jsonResponse({ success: true }, 200)
}

async function handleBootstrap(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' }, 405)
  }

  let body: unknown
  try { body = await req.json() }
  catch { return jsonResponse({ success: false, error: 'Invalid JSON body', code: 'INVALID_PAYLOAD' }, 400) }

  const validation = validateBootstrapPayload(body)
  if (!validation.valid) {
    return jsonResponse({ success: false, error: validation.error, code: 'INVALID_PAYLOAD' }, 400)
  }

  const payload = validation.payload!
  const clientInfo = getClientInfo(req)

  const deviceHash = await generateDeviceHash(payload.androidId)

  if (countRecentEventsV2(deviceHash, 3600_000) >= 20) {
    return jsonResponse({ success: false, error: 'Too many requests', code: 'RATE_LIMITED' }, 429)
  }

  const existing = findDeviceV2ByHash(deviceHash)
  let isNew = false
  let device: StoredDeviceV2

  if (existing) {
    const now = new Date().toISOString()
    existing.install_count += 1
    existing.last_seen_at = now
    existing.updated_at = now
    device = existing
  } else {
    isNew = true
    const now = new Date().toISOString()
    device = {
      id: genId(),
      device_hash: deviceHash,
      install_count: 1,
      plan: 'free',
      plan_expires_at: null,
      first_seen_at: now,
      last_seen_at: now,
      created_at: now,
      updated_at: now,
    }
    devicesV2.push(device)
  }

  const deviceRecord: DeviceRecord = {
    id: device.id,
    device_hash: device.device_hash,
    install_count: device.install_count,
    plan: device.plan,
    plan_expires_at: device.plan_expires_at,
    first_seen_at: device.first_seen_at,
    last_seen_at: device.last_seen_at,
    created_at: device.created_at,
    updated_at: device.updated_at,
  }

  const { token, expiresAt } = await createTokenV2(deviceRecord, JWT_SECRET)

  eventsV2.push({
    id: genId(),
    event_name: 'DEVICE_BOOTSTRAP',
    payload: { deviceHash, isNew, installCount: device.install_count },
    device_hash: deviceHash,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 90 * 86400 * 1000).toISOString(),
  })

  return jsonResponse({
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
  }, 200)
}

async function handleSubscriptionStatus(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' }, 405)
  }

  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return jsonResponse({ success: false, error: 'Missing authorization', code: 'UNAUTHORIZED' }, 401)
  }

  const claims = await verifyToken(auth.slice(7), JWT_SECRET)
  if (!claims) {
    return jsonResponse({ success: false, error: 'Invalid or expired token', code: 'UNAUTHORIZED' }, 401)
  }

  const deviceHash = claims.device_hash as string
  const device = findDeviceV2ByHash(deviceHash)

  const planExpiresAt = device?.plan_expires_at ?? null
  const isExpired = planExpiresAt && new Date(planExpiresAt) < new Date()
  const plan = isExpired ? 'free' : device?.plan ?? 'free'

  const response: Record<string, unknown> = {
    success: true,
    device_hash: deviceHash,
    plan,
    planExpiresAt,
    installCount: device?.install_count ?? 1,
  }

  const needsTokenRefresh =
    claims.plan !== plan ||
    claims.planExpiresAt !== planExpiresAt ||
    (claims.exp as number) < Math.floor(Date.now() / 1000) + 86400

  if (needsTokenRefresh && device) {
    const deviceRecord: DeviceRecord = {
      id: device.id,
      device_hash: device.device_hash,
      install_count: device.install_count,
      plan,
      plan_expires_at: device.plan_expires_at,
      first_seen_at: device.first_seen_at,
      last_seen_at: device.last_seen_at,
      created_at: device.created_at,
      updated_at: device.updated_at,
    }
    const { token, expiresAt } = await createTokenV2(deviceRecord, JWT_SECRET)
    response.token = token
    response.tokenExpiresAt = expiresAt
  }

  return jsonResponse(response, 200)
}

async function handleProfileSync(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' }, 405)
  }

  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return jsonResponse({ success: false, error: 'Missing authorization', code: 'UNAUTHORIZED' }, 401)
  }

  const claims = await verifyToken(auth.slice(7), JWT_SECRET)
  if (!claims) {
    return jsonResponse({ success: false, error: 'Invalid or expired token', code: 'UNAUTHORIZED' }, 401)
  }

  let body: unknown
  try { body = await req.json() }
  catch { return jsonResponse({ success: false, error: 'Invalid JSON body', code: 'INVALID_PAYLOAD' }, 400) }

  const deviceHash = claims.device_hash as string
  const profileData = (body as Record<string, unknown>).profile ?? {}
  const now = new Date().toISOString()

  let profile = findProfileByDeviceId(deviceHash)
  if (profile) {
    profile.profile_data = profileData
    profile.updated_at = now
  } else {
    profile = {
      id: genId(),
      device_id: deviceHash,
      profile_data: profileData,
      created_at: now,
      updated_at: now,
    }
    profiles.push(profile)
  }

  return jsonResponse({
    success: true,
    profile: profile.profile_data,
    updatedAt: profile.updated_at,
  }, 200)
}

console.log(`[test] Guardian VPN test server running on http://localhost:${PORT}`)
console.log(`[test] Endpoints:`)
console.log(`[test]   POST /device-register    (legacy)`)
console.log(`[test]   POST /device-token        (refresh - v2)`)
console.log(`[test]   POST /device-event        (events - v2)`)
console.log(`[test]   POST /device-bootstrap    (new unified)`)
console.log(`[test]   POST /subscription-status [Bearer]`)
console.log(`[test]   POST /profile-sync        [Bearer]`)
console.log(`[test] JWT_SECRET: ${JWT_SECRET}`)

serve(handler, { port: PORT })
