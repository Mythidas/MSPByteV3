import { ENCRYPTION_KEY } from '$env/static/private';
import Encryption from '@workspace/shared/lib/utils/encryption';

export function encryptSecret(text: string): Promise<string> {
  return Encryption.encrypt(text, ENCRYPTION_KEY);
}

export function decryptSecret(text: string): Promise<string | undefined> {
  return Encryption.decrypt(text, ENCRYPTION_KEY);
}
