import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { deleteFile } from '../_shared/storage.ts'
import { json } from '../_shared/response.ts'

serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID()
  const start = Date.now()

  try {
    if (req.method !== 'DELETE') {
      return json(
        { success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido' } },
        405,
      )
    }

    const body = await req.json()
    const { path } = body as { path?: string }

    if (!path || typeof path !== 'string') {
      return json(
        { success: false, error: { code: 'PATH_REQUIRED', message: 'Path é obrigatório' } },
        400,
      )
    }

    await deleteFile(path)

    console.log(JSON.stringify({
      requestId,
      level: 'info',
      action: 'delete',
      path,
      duration: Date.now() - start,
    }))

    return json({ success: true, message: 'Arquivo removido com sucesso' })
  } catch (err) {
    console.error(JSON.stringify({
      requestId,
      level: 'error',
      action: 'delete',
      message: err instanceof Error ? err.message : 'Erro desconhecido',
      duration: Date.now() - start,
    }))

    return json(
      { success: false, error: { code: 'DELETE_FAILED', message: 'Falha ao remover arquivo' } },
      500,
    )
  }
})
