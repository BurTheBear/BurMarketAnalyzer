import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
// Exclusive creation preserves an existing key. Never print cryptographic material.
try {
 await writeFile(new URL('../.dev.vars', import.meta.url), `CREDENTIAL_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}\n`, {mode:0o600,flag:'wx'});
 console.info('Local credential vault configured. Restart the development server.');
} catch(error) { if(error.code==='EEXIST')console.info('Existing local vault configuration preserved.');else throw error; }
