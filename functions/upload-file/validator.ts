import type { ErrorResponse } from '../_shared/types.ts'

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
] as const

const BLOCKED_MIME_TYPES = [
  'application/javascript',
  'application/x-executable',
  'application/x-sh',
  'application/x-httpd-php',
  'text/html',
]

const MAX_FILE_SIZE = {
  image: Number(Deno.env.get('MAX_FILE_SIZE_IMAGE')) || 5 * 1024 * 1024,
  document: Number(Deno.env.get('MAX_FILE_SIZE_DOCUMENT')) || 20 * 1024 * 1024,
} as const

export type ValidationResult =
  | { valid: true }
  | { valid: false; error: ErrorResponse['error'] }

export function validateFile(file: File | null): ValidationResult {
  if (!file) {
    return {
      valid: false,
      error: { code: 'FILE_REQUIRED', message: 'Nenhum arquivo enviado' },
    }
  }

  if (file.size === 0) {
    return {
      valid: false,
      error: { code: 'FILE_EMPTY', message: 'Arquivo vazio' },
    }
  }

  if (BLOCKED_MIME_TYPES.includes(file.type as typeof BLOCKED_MIME_TYPES[number])) {
    return {
      valid: false,
      error: {
        code: 'FORBIDDEN_MIME',
        message: `Tipo de arquivo não permitido: ${file.type}`,
      },
    }
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type as typeof ALLOWED_MIME_TYPES[number])) {
    return {
      valid: false,
      error: {
        code: 'INVALID_MIME',
        message: `Tipo de arquivo não suportado: ${file.type}`,
      },
    }
  }

  const category = file.type.startsWith('image/') ? 'image' : 'document'
  const maxSize = MAX_FILE_SIZE[category]

  if (file.size > maxSize) {
    return {
      valid: false,
      error: {
        code: 'FILE_TOO_LARGE',
        message: `Arquivo excede o limite de ${maxSize / 1024 / 1024}MB para ${category}s`,
      },
    }
  }

  return { valid: true }
}

export function sanitizeFileName(originalName: string): string {
  const ext = originalName.split('.').pop()?.toLowerCase() ?? 'bin'
  const uuid = crypto.randomUUID()
  return `${uuid}.${ext}`
}

export function sanitizePath(folder: string, fileName: string): string {
  const safeFolder = folder
    .replace(/\.\./g, '')
    .replace(/\/+/g, '/')
    .replace(/^\/|\/$/g, '')

  return `${safeFolder}/${fileName}`
}
