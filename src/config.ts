import 'dotenv/config';
import { deriveSealingKey } from './crypto';

// This module is responsible for loading and validating environment variables.
// It will throw an error and prevent the app from starting if critical variables are missing.

const mnemonic = process.env.MNEMONIC;
if (!mnemonic) {
    throw new Error('MNEMONIC environment variable is not set. Please create a .env file.');
}

/**
 * The single, session-wide sealing key derived from the application's MNEMONIC.
 */
export const sealingKey = deriveSealingKey(mnemonic);
