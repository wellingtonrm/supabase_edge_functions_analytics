# SKILL — SUPABASE EDGE FUNCTION UPLOAD SERVICE

## ROLE

Especialista em Edge Functions para upload e gerenciamento de arquivos no Supabase Storage. Responsável por criar funções serverless que recebem, validam, armazenam e servem arquivos com segurança — sem expor a Service Role Key ao cliente, sem depender de backend intermediário e seguindo boas práticas de segurança, performance e observabilidade.

---

## TRIGGER

Ativar esta skill quando o usuário mencionar:

- Supabase Storage / upload de arquivos / gerenciamento de mídia
- Edge Function / Deno / serverless function
- File upload / signed URL / delete file
- Service Role Key / storage bucket
- Validação de MIME / tamanho de arquivo / path seguro

---

## OBJETIVO

Criar Edge Functions profissionais para upload, remoção e geração de URLs assinadas no Supabase Storage.

### Responsabilidades da Edge Function

- Receber arquivos via `multipart/form-data`
- Validar entrada, tipo (MIME), tamanho e segurança
- Gerar nome e path padronizados
- Enviar para o Storage
- Retornar metadata padronizada
- Remover arquivos
- Gerar Signed URLs para arquivos privados

### O que evitar

| Prática | Consequência |
|---|---|
| Usar `anon_key` ou `public_key` na Edge Function | Exposição de privilégio |
| Confiar em `file.name` ou `content-type` do cliente | Vulnerabilidade de segurança |
| Upload direto do frontend com Service Role | Chave exposta ao cliente |
| Path sem sanitização | Path traversal |
| URL pública para arquivos privados | Vazamento de dados |
| Logar token, secret ou conteúdo do arquivo | Exposição de dados sensíveis |

---

## FLUXO DE DADOS (OBRIGATÓRIO)

```
Client (Frontend / API)
    │  POST multipart/form-data
    ▼
Supabase Edge Function
    │  Service Role Key (apenas aqui)
    ▼
Parser → Validator → Sanitizer → Storage → Response
    │                                         │
    │    ┌────────────────────────────────────┘
    ▼    ▼
Supabase Storage (bucket)
    │
    ▼
Signed URL (privado) ou Public URL (público)
```

---

## ESTRUTURA DE DIRETÓRIOS

```
supabase/functions/
├── upload-file/
│   ├── index.ts          # Request handler (HTTP)
│   ├── storage.ts        # Operações no Storage
│   ├── validator.ts      # Validação de arquivo
│   ├── response.ts       # Respostas padronizadas
│   └── types.ts          # Tipos compartilhados
│
├── delete-file/
│   └── index.ts          # Request handler (HTTP)
│
└── signed-url/
    └── index.ts          # Geração de URLs assinadas
```

Cada função é independente — não há compartilhamento de runtime entre elas.

---

## ENVIRONMENT VARIABLES (SEGREDOS)

Definir via `supabase secrets set`:

```
SUPABASE_URL=                # Project URL
SUPABASE_SERVICE_ROLE_KEY=   # Service Role Key (NUNCA anon key)
STORAGE_BUCKET=              # Nome do bucket padrão
```

**Proibido** usar `anon_key`, `public_key` ou qualquer chave de baixo privilégio dentro da Edge Function. A Service Role Key é o único meio de acesso.

---

## TIPOS COMPARTILHADOS

`types.ts`

```ts
export interface UploadRequest {
  file: File
  folder: string
  visibility: 'public' | 'private'
}

export interface FileMetadata {
  bucket: string
  path: string
  name: string
  size: number
  mimeType: string
  url?: string
  signedUrl?: string
  expiresIn?: number
}

export interface UploadResponse {
  success: true
  file: FileMetadata
}

export interface ErrorResponse {
  success: false
  error: {
    code: string
    message: string
  }
}

export type StorageResponse = UploadResponse | ErrorResponse
```

---

## STORAGE CLIENT

`storage.ts`

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { FileMetadata } from './types.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const BUCKET = Deno.env.get('STORAGE_BUCKET') ?? 'uploads'

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

  const metadata: FileMetadata = {
    bucket: BUCKET,
    path: data.path,
    name: path.split('/').pop() ?? '',
    size: file.size,
    mimeType: file.type,
  }

  return metadata
}

export async function deleteFile(path: string): Promise<void> {
  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([path])

  if (error) throw error
}

export async function getPublicUrl(path: string): Promise<string> {
  const { data } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(path)

  return data.publicUrl
}

export async function createSignedUrl(
  path: string,
  expiresIn: number = 3600,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn)

  if (error) throw error
  return data.signedUrl
}
```

---

## VALIDAÇÃO DE ARQUIVO

`validator.ts`

```ts
import type { ErrorResponse } from './types.ts'

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
  image: 5 * 1024 * 1024,   // 5MB
  document: 20 * 1024 * 1024, // 20MB
}

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
      error: { code: 'FORBIDDEN_MIME', message: `Tipo de arquivo não permitido: ${file.type}` },
    }
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type as typeof ALLOWED_MIME_TYPES[number])) {
    return {
      valid: false,
      error: { code: 'INVALID_MIME', message: `Tipo de arquivo não suportado: ${file.type}` },
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
  // Remove caracteres perigosos e path traversal
  const safeFolder = folder
    .replace(/\.\./g, '')
    .replace(/\/+/g, '/')
    .replace(/^\/|\/$/g, '')

  return `${safeFolder}/${fileName}`
}
```

---

## RESPONSE PADRONIZADO

`response.ts`

```ts
import type { FileMetadata, StorageResponse } from './types.ts'

export function success(file: FileMetadata): StorageResponse {
  return {
    success: true,
    file,
  }
}

export function error(code: string, message: string): StorageResponse {
  return {
    success: false,
    error: { code, message },
  }
}
```

---

## UPLOAD ENDPOINT

`upload-file/index.ts`

```ts
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { uploadFile, getPublicUrl, createSignedUrl } from '../storage.ts'
import { validateFile, sanitizeFileName, sanitizePath } from '../validator.ts'
import { success, error } from '../response.ts'
import type { StorageResponse } from '../types.ts'

serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID()
  const start = Date.now()

  try {
    if (req.method !== 'POST') {
      return Response.json(error('METHOD_NOT_ALLOWED', 'Método não permitido'), { status: 405 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const folder = (formData.get('folder') as string | null) ?? 'misc'
    const visibility = (formData.get('visibility') as string | null) ?? 'private'

    // Validação
    const validation = validateFile(file)
    if (!validation.valid) {
      return Response.json(error(validation.error.code, validation.error.message), { status: 400 })
    }

    const safeName = sanitizeFileName(file!.name)
    const path = sanitizePath(folder, safeName)

    // Upload
    const metadata = await uploadFile(path, file!)

    // URL
    if (visibility === 'public') {
      metadata.url = await getPublicUrl(path)
    } else {
      metadata.signedUrl = await createSignedUrl(path, 3600)
      metadata.expiresIn = 3600
    }

    // Log seguro
    console.log(
      JSON.stringify({
        requestId,
        level: 'info',
        action: 'upload',
        path,
        size: file!.size,
        mimeType: file!.type,
        visibility,
        duration: Date.now() - start,
      }),
    )

    return Response.json(success(metadata), { status: 201 })
  } catch (err) {
    console.error(
      JSON.stringify({
        requestId,
        level: 'error',
        action: 'upload',
        message: err instanceof Error ? err.message : 'Erro desconhecido',
        duration: Date.now() - start,
      }),
    )

    return Response.json(error('UPLOAD_FAILED', 'Falha ao fazer upload'), { status: 500 })
  }
})
```

---

## DELETE ENDPOINT

`delete-file/index.ts`

```ts
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { deleteFile } from '../upload-file/storage.ts'

serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID()
  const start = Date.now()

  try {
    if (req.method !== 'DELETE') {
      return new Response(JSON.stringify({
        success: false,
        error: { code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido' },
      }), { status: 405, headers: { 'Content-Type': 'application/json' } })
    }

    const { path } = await req.json()

    if (!path || typeof path !== 'string') {
      return new Response(JSON.stringify({
        success: false,
        error: { code: 'PATH_REQUIRED', message: 'Path é obrigatório' },
      }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    await deleteFile(path)

    console.log(JSON.stringify({
      requestId,
      level: 'info',
      action: 'delete',
      path,
      duration: Date.now() - start,
    }))

    return new Response(JSON.stringify({
      success: true,
      message: 'Arquivo removido com sucesso',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error(JSON.stringify({
      requestId,
      level: 'error',
      action: 'delete',
      message: err instanceof Error ? err.message : 'Erro desconhecido',
      duration: Date.now() - start,
    }))

    return new Response(JSON.stringify({
      success: false,
      error: { code: 'DELETE_FAILED', message: 'Falha ao remover arquivo' },
    }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
```

---

## SIGNED URL ENDPOINT

`signed-url/index.ts`

```ts
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createSignedUrl } from '../upload-file/storage.ts'

serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID()

  try {
    if (req.method !== 'GET') {
      return new Response(JSON.stringify({
        success: false,
        error: { code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido' },
      }), { status: 405, headers: { 'Content-Type': 'application/json' } })
    }

    const url = new URL(req.url)
    const path = url.searchParams.get('path')
    const expiresIn = Number(url.searchParams.get('expiresIn')) || 3600

    if (!path) {
      return new Response(JSON.stringify({
        success: false,
        error: { code: 'PATH_REQUIRED', message: 'Path é obrigatório' },
      }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    const signedUrl = await createSignedUrl(path, expiresIn)

    return new Response(JSON.stringify({
      success: true,
      signedUrl,
      expiresIn,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error(JSON.stringify({
      requestId,
      level: 'error',
      action: 'signed-url',
      message: err instanceof Error ? err.message : 'Erro desconhecido',
    }))

    return new Response(JSON.stringify({
      success: false,
      error: { code: 'SIGNED_URL_FAILED', message: 'Falha ao gerar URL' },
    }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
```

---

## SEGURANÇA — REGRAS OBRIGATÓRIAS

| Regra | Implementação |
|---|---|
| Validar JWT do usuário | Extrair e verificar `Authorization: Bearer <token>` antes de processar |
| Validar path | Sanitizar contra `../`, `//`, caracteres especiais |
| Validar MIME real | Nunca confiar no `content-type` enviado pelo cliente |
| Validar tamanho | Bloquear antes do upload |
| Nome de arquivo seguro | Gerar `uuid.ext`, nunca usar `file.name` |
| Service Role Key | Usar apenas dentro da Edge Function |
| Logs seguros | Nunca logar token, secret, chave ou conteúdo do arquivo |

---

## PERFORMANCE

| Prática | Configuração |
|---|---|
| Cache Control | `cacheControl: '3600'` no upload |
| Signed URL expiration | 1 hora (padrão), configurável |
| Timeout da Edge Function | 60s (default Supabase) |
| Tamanho máximo do body | 10MB (configurável no dashboard) |

---

## LOGS PADRONIZADOS

Sempre em JSON estruturado:

```ts
console.log(JSON.stringify({
  requestId: string,
  level: 'info' | 'error',
  action: 'upload' | 'delete' | 'signed-url',
  path?: string,
  size?: number,
  mimeType?: string,
  visibility?: string,
  duration: number,
  message?: string,
}))
```

**Nunca logar**: token, secret, chave, conteúdo do arquivo, headers completos.

---

## COMANDOS ÚTEIS

```bash
# Deploy
supabase functions deploy upload-file --no-verify-jwt
supabase functions deploy delete-file --no-verify-jwt
supabase functions deploy signed-url --no-verify-jwt

# Secrets
supabase secrets set SUPABASE_URL=<url>
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<key>
supabase secrets set STORAGE_BUCKET=<bucket>

# Test local
supabase functions serve upload-file --env-file .env.local
```

---

## CHECKLIST OBRIGATÓRIO

[ ] Edge Functions criadas (upload-file, delete-file, signed-url)
[ ] Service Role Key protegida — nunca exposta ao frontend
[ ] Upload implementado com validação de MIME, tamanho e path
[ ] Nome de arquivo sanitizado (`uuid.ext`)
[ ] Path padronizado (`{folder}/uuid.ext`)
[ ] Delete implementado com validação de path
[ ] Signed URL implementada com expiração
[ ] Respostas padronizadas (`{ success, file }` / `{ success, error }`)
[ ] Logs estruturados sem dados sensíveis
[ ] Cache Control configurado
[ ] Deploy realizado com `--no-verify-jwt`
[ ] Secrets configurados no Supabase
