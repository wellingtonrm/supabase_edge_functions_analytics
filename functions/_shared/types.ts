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
