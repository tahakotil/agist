import { createHash, randomBytes } from 'crypto'

/**
 * Generate a new API key in the format: agist_<base64url>
 * Returns both the raw key (shown once) and the SHA-256 hash (stored in DB).
 */
export function generateApiKey(): { key: string; hash: string } {
  const raw = randomBytes(24).toString('base64url')
  const key = `agist_${raw}`
  const hash = hashApiKey(key)
  return { key, hash }
}

/**
 * Hash an API key using SHA-256. This is the value stored in the DB.
 * Raw keys are never persisted.
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}
