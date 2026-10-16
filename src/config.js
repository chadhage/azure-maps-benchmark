import { PocError } from '../public/modules/errors.js';

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
  if (requirePlatformAuth && !platformHosted) throw new PocError('INVALID_CONFIG', 'Platform authentication requires an Azure App Service host.');
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !(requirePlatformAuth && platformHosted)) throw new PocError('UNPROTECTED_HOST', 'Non-loopback binding requires App Service with platform authentication enforced.');
  const geography = env.AZURE_MAPS_GEOGRAPHY ?? 'global';
  if (!['global', 'us', 'eu'].includes(geography)) throw new PocError('INVALID_CONFIG', 'AZURE_MAPS_GEOGRAPHY must be global, us, or eu.');
  const enableLive = boolean('ENABLE_LIVE', false);
  const clientId = env.AZURE_MAPS_CLIENT_ID ?? '';
  if (enableLive && !clientId.trim()) throw new PocError('MISSING_MAPS_CLIENT_ID', 'Set AZURE_MAPS_CLIENT_ID before enabling live requests.');
  return { host, port, platformHosted, requirePlatformAuth, enableLive, clientId, geography, hostname: env.WEBSITE_HOSTNAME ?? '' };
}

/** @typedef {ReturnType<typeof readConfig>} Config */
