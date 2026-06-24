import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

export type SupabaseClient = ReturnType<typeof createClient>

export interface DevicePayload {
  deviceId: string
  installationId: string
  platform: string
  appVersion?: string
  buildNumber: string
  packageName?: string
  timezone?: string
  language?: string
  timestamp: number
}

export interface BootstrapPayload {
  androidId: string
  platform: string
  appVersion?: string
  buildNumber?: string
}

export interface DeviceRecord {
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

export const ALLOWED_PLATFORMS = ['android']
export const TOKEN_EXPIRY_DAYS = 30
export const RATE_LIMIT_WINDOW_MS = 3600_000
export const RATE_LIMIT_MAX_REQUESTS = 20
export const MIN_ID_LENGTH = 10
export const MAX_ID_LENGTH = 255

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

export function handleCors(request: Request): Response | null {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  return null
}

// --- Validação de payload legado (device-register antigo) ---

export interface ValidationResult {
  valid: boolean
  payload?: DevicePayload
  error?: string
}

export function validateDevicePayload(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object' }
  }

  const data = body as Record<string, unknown>
  const requiredFields = ['deviceId', 'installationId', 'platform', 'appVersion', 'buildNumber', 'timestamp']
  const missing = requiredFields.filter((f) => data[f] === undefined || data[f] === null)

  if (missing.length > 0) {
    return { valid: false, error: `Missing required fields: ${missing.join(', ')}` }
  }

  const { deviceId, installationId, platform, timestamp, buildNumber } = data

  if (
    typeof deviceId !== 'string' ||
    deviceId.length < MIN_ID_LENGTH ||
    deviceId.length > MAX_ID_LENGTH
  ) {
    return {
      valid: false,
      error: `deviceId must be a string between ${MIN_ID_LENGTH} and ${MAX_ID_LENGTH} characters`,
    }
  }

  if (
    typeof installationId !== 'string' ||
    installationId.length < MIN_ID_LENGTH ||
    installationId.length > MAX_ID_LENGTH
  ) {
    return {
      valid: false,
      error: `installationId must be a string between ${MIN_ID_LENGTH} and ${MAX_ID_LENGTH} characters`,
    }
  }

  if (typeof platform !== 'string' || !ALLOWED_PLATFORMS.includes(platform)) {
    return { valid: false, error: `platform must be one of: ${ALLOWED_PLATFORMS.join(', ')}` }
  }

  if (typeof timestamp !== 'number' || isNaN(timestamp)) {
    return { valid: false, error: 'timestamp must be a numeric value' }
  }

  const now = Math.floor(Date.now() / 1000)
  if (timestamp > now + 300) {
    return { valid: false, error: 'timestamp exceeds maximum allowed future time' }
  }
  if (timestamp < now - 86400) {
    return { valid: false, error: 'timestamp is too old' }
  }

  if (typeof data.appVersion !== 'string' || data.appVersion.length === 0) {
    return { valid: false, error: 'appVersion must be a non-empty string' }
  }

  if (typeof buildNumber !== 'string' || buildNumber.length === 0) {
    return { valid: false, error: 'buildNumber must be a non-empty string' }
  }

  return {
    valid: true,
    payload: {
      deviceId: deviceId as string,
      installationId: installationId as string,
      platform: platform as string,
      appVersion: data.appVersion as string,
      buildNumber: buildNumber as string,
      packageName: typeof data.packageName === 'string' ? data.packageName : undefined,
      timezone: typeof data.timezone === 'string' ? data.timezone : undefined,
      language: typeof data.language === 'string' ? data.language : undefined,
      timestamp: timestamp as number,
    },
  }
}

// --- Validação de payload bootstrap (novo) ---

export function validateBootstrapPayload(body: unknown): { valid: boolean; payload?: BootstrapPayload; error?: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object' }
  }

  const data = body as Record<string, unknown>

  if (!data.androidId || typeof data.androidId !== 'string' || data.androidId.length < 8) {
    return { valid: false, error: 'androidId must be a string with at least 8 characters' }
  }

  if (!data.platform || typeof data.platform !== 'string' || !ALLOWED_PLATFORMS.includes(data.platform)) {
    return { valid: false, error: `platform must be one of: ${ALLOWED_PLATFORMS.join(', ')}` }
  }

  return {
    valid: true,
    payload: {
      androidId: data.androidId as string,
      platform: data.platform as string,
      appVersion: typeof data.appVersion === 'string' ? data.appVersion : undefined,
      buildNumber: typeof data.buildNumber === 'string' ? data.buildNumber : undefined,
    },
  }
}

// --- Geração de hash (device_hash) ---

export async function generateDeviceHash(androidId: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(androidId))
  const bytes = new Uint8Array(hash)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// --- Geração legada de fingerprint (para compatibilidade) ---

export async function generateFingerprint(payload: DevicePayload): Promise<string> {
  const data =
    `${payload.deviceId}${payload.installationId}${payload.platform}${payload.packageName ?? ''}`
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))
  const bytes = new Uint8Array(hash)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// --- JWT utilities ---

function base64urlEncode(obj: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(obj))
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlEncodeBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

// --- Criação de token legado (v1) ---

export async function createToken(
  deviceId: string,
  installationId: string,
  fingerprint: string,
  jwtSecret: string,
): Promise<{ token: string; expiresAt: string }> {
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + TOKEN_EXPIRY_DAYS * 86400

  const payload = {
    deviceId,
    installationId,
    fingerprint,
    tier: 'free',
    iat: now,
    exp: expiresAt,
  }

  const header = { alg: 'HS256', typ: 'JWT' }
  const headerBase64 = base64urlEncode(header)
  const payloadBase64 = base64urlEncode(payload)
  const signingInput = `${headerBase64}.${payloadBase64}`

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(jwtSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signingInput),
  )
  const signatureBase64 = base64urlEncodeBuffer(signature)

  return {
    token: `${signingInput}.${signatureBase64}`,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  }
}

// --- Criação de token v2 (novo payload) ---

export async function createTokenV2(
  device: DeviceRecord,
  jwtSecret: string,
): Promise<{ token: string; expiresAt: string }> {
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + TOKEN_EXPIRY_DAYS * 86400

  const payload = {
    sub: device.id,
    device_hash: device.device_hash,
    plan: device.plan,
    planExpiresAt: device.plan_expires_at,
    createdAt: device.created_at,
    updatedAt: device.updated_at,
    iat: now,
    exp: expiresAt,
  }

  const header = { alg: 'HS256', typ: 'JWT' }
  const headerBase64 = base64urlEncode(header)
  const payloadBase64 = base64urlEncode(payload)
  const signingInput = `${headerBase64}.${payloadBase64}`

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(jwtSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signingInput),
  )
  const signatureBase64 = base64urlEncodeBuffer(signature)

  return {
    token: `${signingInput}.${signatureBase64}`,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  }
}

// --- Verificação de token (compatível com v1 e v2) ---

export async function verifyToken(
  token: string,
  jwtSecret: string,
): Promise<Record<string, unknown> | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const [headerBase64, payloadBase64, signatureBase64] = parts
    const signingInput = `${headerBase64}.${payloadBase64}`

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(jwtSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    )

    const signatureBytes = base64urlDecode(signatureBase64)
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes,
      new TextEncoder().encode(signingInput),
    )

    if (!valid) return null

    const payloadBytes = base64urlDecode(payloadBase64)
    const payloadStr = new TextDecoder().decode(payloadBytes)
    const payload = JSON.parse(payloadStr)

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null
    }

    return payload as Record<string, unknown>
  } catch {
    return null
  }
}

// --- Supabase client ---

export function createSupabaseClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(supabaseUrl, serviceRoleKey)
}

// --- Rate limiting (usa device_events_v2) ---

export async function checkRateLimit(
  supabase: SupabaseClient,
  deviceHash: string,
): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString()

  const { count, error } = await supabase
    .from('device_events_v2')
    .select('id', { count: 'exact', head: true })
    .eq('device_hash', deviceHash)
    .gte('created_at', oneHourAgo)

  if (error) {
    console.error('[rate-limit] Error checking rate limit:', error)
    return false
  }

  return (count ?? 0) >= RATE_LIMIT_MAX_REQUESTS
}

// --- Rate limiting v2 (usa device_events_v2) ---

export async function checkRateLimitV2(
  supabase: SupabaseClient,
  deviceHash: string,
): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString()

  const { count, error } = await supabase
    .from('device_events_v2')
    .select('id', { count: 'exact', head: true })
    .eq('device_hash', deviceHash)
    .gte('created_at', oneHourAgo)

  if (error) {
    console.error('[rate-limit-v2] Error checking rate limit:', error)
    return false
  }

  return (count ?? 0) >= RATE_LIMIT_MAX_REQUESTS
}

// --- Client info ---

export function getClientInfo(request: Request): {
  ipAddress: string
  userAgent: string
} {
  return {
    ipAddress:
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown',
    userAgent: request.headers.get('user-agent') || 'unknown',
  }
}
