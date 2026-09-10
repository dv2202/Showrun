import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AppError } from '../errors.js';

const VERSION = 'v1';

export class EncryptionService {
  private readonly key: Buffer;

  constructor(encodedKey: string) {
    const key = Buffer.from(encodedKey, 'base64');
    if (key.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be a base64-encoded 32-byte key');
    }
    this.key = key;
  }

  encrypt(value: unknown): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
  }

  decrypt<T>(payload: string): T {
    try {
      const [version, iv, tag, ciphertext] = payload.split('.');
      if (version !== VERSION || !iv || !tag || !ciphertext) throw new Error('Malformed ciphertext');
      const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64url')),
        decipher.final(),
      ]);
      return JSON.parse(plaintext.toString('utf8')) as T;
    } catch (error) {
      throw new AppError('AUTHENTICATION_FAILED', 'Encrypted authentication data is unavailable', 500, {
        cause: error,
      });
    }
  }
}
