# Supabase Edge Functions — GuardTron Storage

API de storage serverless com Supabase Edge Functions (Deno). Faz upload, remoção e geração de URLs assinadas no bucket `uploads`.

---

## Funções

### 1. `upload-file` — `POST /`

Upload de arquivos com validação de tipo, tamanho e sanitização.

**Requisição:** `multipart/form-data`

| Campo | Tipo | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|
| `file` | File | Sim | — | Arquivo a ser enviado |
| `folder` | string | Não | `"misc"` | Subpasta dentro do bucket |
| `visibility` | string | Não | `"private"` | `"public"` → URL pública; `"private"` → URL assinada |

**MIME types permitidos:** `image/jpeg`, `image/png`, `image/webp`, `application/pdf`, `text/plain`

**Limites:** imagem 5 MB, documento 20 MB (configurável via env).

**Resposta `201`:**
```json
{
  "success": true,
  "file": {
    "bucket": "uploads",
    "path": "misc/uuid.jpg",
    "name": "uuid.jpg",
    "size": 12345,
    "mimeType": "image/jpeg",
    "url": "https://...",
    "signedUrl": "https://...",
    "expiresIn": 3600
  }
}
```

---

### 2. `delete-file` — `DELETE /`

Remove um arquivo do bucket pelo path.

**Requisição:** `application/json`
```json
{
  "path": "misc/uuid.jpg"
}
```

**Resposta `200`:**
```json
{
  "success": true,
  "message": "Arquivo removido com sucesso"
}
```

---

### 3. `signed-url` — `GET /`

Gera uma URL assinada temporária para acesso a arquivos privados.

| Parâmetro (query) | Tipo | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|
| `path` | string | Sim | — | Caminho do arquivo no bucket |
| `expiresIn` | number | Não | `3600` | Tempo de expiração em segundos |

**Resposta `200`:**
```json
{
  "success": true,
  "signedUrl": "https://...",
  "expiresIn": 3600
}
```

---

## Códigos de erro comuns

| Código | Descrição |
|---|---|
| `FILE_REQUIRED` | Nenhum arquivo enviado |
| `FILE_EMPTY` | Arquivo vazio (size = 0) |
| `FORBIDDEN_MIME` | Tipo de arquivo bloqueado (ex: `.exe`, `.html`, `.js`) |
| `INVALID_MIME` | Tipo de arquivo não suportado |
| `FILE_TOO_LARGE` | Arquivo excede o limite de tamanho |
| `METHOD_NOT_ALLOWED` | Método HTTP incorreto |
| `PATH_REQUIRED` | Path não informado (delete/signed-url) |
| `UPLOAD_FAILED` | Erro interno no upload |
| `DELETE_FAILED` | Erro interno ao remover |
| `SIGNED_URL_FAILED` | Erro interno ao gerar URL assinada |

---

## Compartilhados (`_shared/`)

| Arquivo | Responsabilidade |
|---|---|
| `types.ts` | Interfaces `FileMetadata`, `UploadResponse`, `ErrorResponse`, `StorageResponse` |
| `response.ts` | Helpers `success()`, `error()`, `json()` para padronizar respostas HTTP |
| `storage.ts` | Cliente Supabase (`service_role`), funções `uploadFile`, `deleteFile`, `getPublicUrl`, `createSignedUrl` |

---

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (admin) |
| `STORAGE_BUCKET` | Nome do bucket (padrão: `uploads`) |
| `MAX_FILE_SIZE_IMAGE` | Limite para imagens (padrão: `5242880`) |
| `MAX_FILE_SIZE_DOCUMENT` | Limite para documentos (padrão: `20971520`) |
| `PUBLIC_STORAGE_URL` | URL base pública do storage |

---

## Comandos

```bash
supabase functions serve upload-file --env-file ../.env
supabase functions serve delete-file --env-file ../.env
supabase functions serve signed-url --env-file ../.env
supabase functions deploy upload-file --no-verify-jwt
supabase functions deploy delete-file --no-verify-jwt
supabase functions deploy signed-url --no-verify-jwt
```

Autenticação via `service_role` (as funções não validam JWT do usuário).
