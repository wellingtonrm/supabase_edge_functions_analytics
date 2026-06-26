import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { uploadFile, getPublicUrl, createSignedUrl } from '../_shared/storage.ts'
import { validateFile, sanitizeFileName, sanitizePath } from './validator.ts'
import { success, error, json } from '../_shared/response.ts'
import type { StorageResponse } from '../_shared/types.ts'

serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID()
  const start = Date.now()

  try {
    if (req.method !== 'POST') {
      return json(error('METHOD_NOT_ALLOWED', 'Método não permitido'), 405)
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const folder = (formData.get('folder') as string | null) ?? 'misc'
    const visibility = (formData.get('visibility') as string | null) ?? 'private'

    const validation = validateFile(file)
    if (!validation.valid) {
      return json(error(validation.error.code, validation.error.message), 400)
    }

    const safeName = sanitizeFileName(file!.name)
    const path = sanitizePath(folder, safeName)

    const metadata = await uploadFile(path, file!)

    if (visibility === 'public') {
      metadata.url = getPublicUrl(path)
    } else {
      metadata.signedUrl = await createSignedUrl(path, 3600)
      metadata.expiresIn = 3600
    }

    console.log(JSON.stringify({
      requestId,
      level: 'info',
      action: 'upload',
      path,
      size: file!.size,
      mimeType: file!.type,
      visibility,
      duration: Date.now() - start,
    }))

    return json(success(metadata), 201)
  } catch (err) {
    console.error(JSON.stringify({
      requestId,
      level: 'error',
      action: 'upload',
      message: err instanceof Error ? err.message : 'Erro desconhecido',
      duration: Date.now() - start,
    }))

    return json(error('UPLOAD_FAILED', 'Falha ao fazer upload'), 500)
  }
})
