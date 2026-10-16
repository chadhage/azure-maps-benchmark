import { readFile } from 'node:fs/promises';
import { createAzureProvider, createFixtureProvider } from './providers.js';
import { PocError } from '../public/modules/errors.js';

export async function loadFixtures() {
  return createFixtureProvider(JSON.parse(await readFile(new URL('../fixtures/responses.json', import.meta.url), 'utf8')));
}

/** @param {import('./config.js').Config} config */
export async function liveProvider(config) {
  const { DefaultAzureCredential, ManagedIdentityCredential } = await import('@azure/identity');
  const credential = config.platformHosted ? new ManagedIdentityCredential() : new DefaultAzureCredential();
  return createAzureProvider({
    clientId: config.clientId, geography: config.geography,
    getToken: async signal => {
      const token = await credential.getToken('https://atlas.microsoft.com/.default', { abortSignal: signal });
      if (!token) throw new PocError('TOKEN_UNAVAILABLE', 'Microsoft Entra returned no token.', 503);
      return token.token;
    }
  });
}
