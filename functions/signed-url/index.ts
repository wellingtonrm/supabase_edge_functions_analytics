import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createSignedUrl } from '../_shared/storage.ts'
import { json } from '../_shared/response.ts'

serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID()

  try {
    if (req.method !== 'GET') {
      return json(
        { success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido' } },
        405,
      )
    }

    const url = new URL(req.url)
    const path = url.searchParams.get('path')
    const expiresIn = Number(url.searchParams.get('expiresIn')) || 3600

    if (!path) {
      return json(
        { success: false, error: { code: 'PATH_REQUIRED', message: 'Path é obrigatório' } },
        400,
      )
    }

    const signedUrl = await createSignedUrl(path, expiresIn)

    return json({ success: true, signedUrl, expiresIn })
  } catch (err) {
    console.error(JSON.stringify({
      requestId,
      level: 'error',
      action: 'signed-url',
      message: err instanceof Error ? err.message : 'Erro desconhecido',
    }))

    return json(
      { success: false, error: { code: 'SIGNED_URL_FAILED', message: 'Falha ao gerar URL' } },
      500,
    )
  }
})
