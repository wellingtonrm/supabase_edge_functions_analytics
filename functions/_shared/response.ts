import type { FileMetadata, StorageResponse } from './types.ts'

export function success(file: FileMetadata): StorageResponse {
  return { success: true, file }
}

export function error(code: string, message: string): StorageResponse {
  return { success: false, error: { code, message } }
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
