import { runtime } from './store';
/** Keys never leave the server. An operator-provided secret overrides the private-storage key. */
export function vaultReady() { return !!(runtime().CREDENTIAL_ENCRYPTION_KEY || runtime().VAULT); }
export async function vaultKey(): Promise<string> {
 const {CREDENTIAL_ENCRYPTION_KEY,VAULT}=runtime();
 if(CREDENTIAL_ENCRYPTION_KEY)return CREDENTIAL_ENCRYPTION_KEY;
 if(!VAULT)throw new Error('The encrypted credential vault is not configured.');
 const path='internal/credential-encryption-key-v1';
 const existing=await VAULT.get(path);if(existing)return existing.text();
 // Conditional creation avoids competing keys when the first connections arrive concurrently.
 const bytes=crypto.getRandomValues(new Uint8Array(32));
 const generated=btoa(String.fromCharCode(...bytes));
 await VAULT.put(path,generated,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/octet-stream'}});
 const stored=await VAULT.get(path);if(!stored)throw new Error('Credential vault initialization failed. Retry connecting.');
 return stored.text();
}
