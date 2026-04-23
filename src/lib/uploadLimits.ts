/**
 * Vercel serverless rejects requests when the **entire** POST body exceeds ~4.5 MiB
 * (`FUNCTION_PAYLOAD_TOO_LARGE`). Multipart overhead (boundaries + field names) needs margin,
 * so cap each image file slightly below that.
 */
export const MAX_IMAGE_FILE_BYTES_VERCEL =
  Math.floor(4.5 * 1024 * 1024) - 192 * 1024;
