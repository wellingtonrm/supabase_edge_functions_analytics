import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { FileMetadata } from './types.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const BUCKET = Deno.env.get('STORAGE_BUCKET') ?? 'uploads'

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

export async function uploadFile(
  path: string,
  file: File,
): Promise<FileMetadata> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
      cacheControl: '3600',
    })

  if (error) throw error

  return {
    bucket: BUCKET,
    path: data.path,
    name: path.split('/').pop() ?? '',
    size: file.size,
    mimeType: file.type,
  }
}

export async function deleteFile(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw error
}

export function getPublicUrl(path: string): string {
  const publicUrl = Deno.env.get('PUBLIC_STORAGE_URL')
  if (publicUrl) {
    return `${publicUrl}/${BUCKET}/${path}`
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

export async function createSignedUrl(
  path: string,
  expiresIn = 3600,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn)

  if (error) throw error
  return data.signedUrl
}
