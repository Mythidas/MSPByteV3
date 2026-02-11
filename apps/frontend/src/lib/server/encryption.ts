// src/lib/server/crypto.ts
import { env } from '$env/dynamic/private';
import crypto from 'node:crypto';

export class Encryption {
  static algorithm = 'aes-256-gcm';

  static getKey() {
    const ENCRYPTION_KEY_HEX = env.ENCRYPTION_KEY;

    if (!ENCRYPTION_KEY_HEX || ENCRYPTION_KEY_HEX.length !== 64) {
      throw new Error('ENCRYPTION_KEY must be 64 hex chars (32 bytes)');
    }

    return Buffer.from(ENCRYPTION_KEY_HEX, 'hex');
  }

  static encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(12); // GCM sweet spot = 12 bytes

    const cipher = crypto.createCipheriv(this.algorithm, this.getKey(), iv);

    // You can collect in 'binary'/'base64' — base64 is fine and common
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    // MUST call final() BEFORE getAuthTag()
    const authTag = cipher.getAuthTag(); // returns Buffer

    // Store as base64 : base64 : base64
    // Order: iv : tag : ciphertext  (very standard)
    return [iv.toString('base64'), authTag.toString('base64'), encrypted].join(':');
  }

  static decrypt(encryptedData: string): string {
    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted format — expected iv:tag:ciphertext');
      }

      const [ivB64, tagB64, ciphertextB64] = parts;

      const iv = Buffer.from(ivB64, 'base64');
      const authTag = Buffer.from(tagB64, 'base64');
      const ciphertext = Buffer.from(ciphertextB64, 'base64');

      const decipher = crypto.createDecipheriv(this.algorithm, this.getKey(), iv);

      // This is required for GCM — must set before any update/final
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(ciphertext, undefined, 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (err: any) {
      console.error('Decryption failed:', err.message);
      throw new Error('Decryption failed — wrong key, tampered data, or format error');
    }
  }
}
