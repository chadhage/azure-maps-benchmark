import { PocError } from '../public/modules/errors.js';
import { join } from 'node:path';

/** @param {NodeJS.ProcessEnv} [env] */
export function readConfig(env = process.env) {
  /** @param {string} key @param {boolean} fallback */
  const boolean = (key, fallback) => {
    if (env[key] === undefined || env[key] === '') return fallback;
    if (!['true', 'false'].includes(env[key] ?? '')) throw new PocError('INVALID_CONFIG', `${key} must be true or false.`);
    return env[key] === 'true';
  };
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new PocError('INVALID_CONFIG', 'PORT must be an integer from 0 to 65535.');
  const host = env.HOST ?? '127.0.0.1';
  const platformHosted = Boolean(env.WEBSITE_INSTANCE_ID);
  const requirePlatformAuth = boolean('REQUIRE_PLATFORM_AUTH', false);
  const publicDemo = boolean('PUBLIC_DEMO', false);
  if (publicDemo && (!platformHosted || requirePlatformAuth)) throw new PocError('INVALID_CONFIG', 'PUBLIC_DEMO requires App Service with REQUIRE_PLATFORM_AUTH=false.');
  if (requirePlatformAuth && !platformHosted) throw new PocError('INVALID_CONFIG', 'Platform authentication requires an Azure App Service host.');
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !(platformHosted && (requirePlatformAuth || publicDemo))) throw new PocError('UNPROTECTED_HOST', 'Non-loopback binding requires App Service with platform authentication or explicit PUBLIC_DEMO mode.');
  const geography = env.AZURE_MAPS_GEOGRAPHY ?? 'global';
  if (!['global', 'us', 'eu'].includes(geography)) throw new PocError('INVALID_CONFIG', 'AZURE_MAPS_GEOGRAPHY must be global, us, or eu.');
  const enableLive = boolean('ENABLE_LIVE', false);
  const clientId = env.AZURE_MAPS_CLIENT_ID ?? '';
  const attemptLimit = Number(env.LIVE_HTTP_ATTEMPT_LIMIT ?? 0);
  if (!Number.isSafeInteger(attemptLimit) || attemptLimit < 0) throw new PocError('INVALID_CONFIG', 'LIVE_HTTP_ATTEMPT_LIMIT must be a nonnegative integer.');
  const attemptLedgerPath = env.LIVE_HTTP_ATTEMPT_LEDGER ?? (platformHosted && env.HOME ? join(env.HOME, 'data', 'maps-demo-attempts.log') : '');
  if (attemptLimit > 0 && !attemptLedgerPath) throw new PocError('INVALID_CONFIG', 'A persistent LIVE_HTTP_ATTEMPT_LEDGER path is required for the attempt limit.');
  if (publicDemo && enableLive && attemptLimit === 0) throw new PocError('INVALID_CONFIG', 'Public live submissions require a positive persistent LIVE_HTTP_ATTEMPT_LIMIT.');
  if (enableLive && !clientId.trim()) throw new PocError('MISSING_MAPS_CLIENT_ID', 'Set AZURE_MAPS_CLIENT_ID before enabling live requests.');
  return { host, port, platformHosted, requirePlatformAuth, publicDemo, enableLive, clientId, geography, attemptLimit, attemptLedgerPath, hostname: env.WEBSITE_HOSTNAME ?? '' };
}

/** @typedef {ReturnType<typeof readConfig>} Config */
