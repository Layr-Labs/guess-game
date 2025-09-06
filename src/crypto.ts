import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { Sealed } from './game/types';

/**
 * Derives a strong sealing key from a mnemonic using scrypt.
 * @param mnemonic The input mnemonic from which to derive the key.
 * @returns A 32-byte Buffer representing the derived key.
 */
export function deriveSealingKey(mnemonic: string): Buffer {
    return scryptSync(Buffer.from(mnemonic, 'utf8'), Buffer.from('guess-game-salt', 'utf8'), 32);
}

/**
 * Encrypts a JSON-serializable object using AES-256-GCM.
 * @param obj The object to encrypt.
 * @param key The 32-byte encryption key.
 * @returns A Sealed object containing the iv, ciphertext, and auth tag.
 */
export function encryptJSON(obj: any, key: Buffer): Sealed {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const plaintext = Buffer.from(JSON.stringify(obj), 'utf8');
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
        iv: iv.toString('base64'),
        ciphertext: ciphertext.toString('base64'),
        tag: tag.toString('base64'),
    };
}

/**
 * Decrypts a Sealed object back into its original JSON object.
 * @param sealed The Sealed object to decrypt.
 * @param key The 32-byte decryption key.
 * @returns The original decrypted object.
 */
export function decryptJSON<T = any>(sealed: Sealed, key: Buffer): T {
    const iv = Buffer.from(sealed.iv, 'base64');
    const ciphertext = Buffer.from(sealed.ciphertext, 'base64');
    const tag = Buffer.from(sealed.tag, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString('utf8')) as T;
}

/**
 * Generates a cryptographically secure random ID.
 * @returns A 32-character hex string.
 */
export function cryptoRandomId(): string {
    return randomBytes(16).toString('hex');
}
