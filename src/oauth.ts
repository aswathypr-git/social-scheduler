import axios from 'axios';
import { nanoid } from 'nanoid';
import crypto from 'crypto';
import db from './db';

export type Platform = 'facebook' | 'instagram' | 'linkedin' | 'twitter';

const SUPPORTED: Platform[] = ['facebook', 'instagram', 'linkedin', 'twitter'];

export function isSupported(platform: string): platform is Platform {
  return SUPPORTED.includes(platform as Platform);
}

function upper(p: Platform) {
  return p.toUpperCase();
}

function envVar(name: string) {
  return process.env[name] || '';
}

// Build a provider auth URL from env vars. If not configured, return a mocked URL.
export function generateAuthUrl(platform: Platform, state = nanoid()) {
  const AUTH_URL = envVar(`${upper(platform)}_AUTH_URL`);
  const CLIENT_ID = envVar(`${upper(platform)}_CLIENT_ID`);
  const REDIRECT = envVar('OAUTH_REDIRECT_URI') || 'http://localhost:3000/api/oauth/callback';
  const SCOPE = envVar(`${upper(platform)}_SCOPE`) || 'read write';

  if (AUTH_URL && CLIENT_ID) {
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT,
      response_type: 'code',
      scope: SCOPE,
      state
    });
    // code_challenge may be appended by caller when using PKCE
    return `${AUTH_URL}?${params.toString()}`;
  }

  // fallback mocked URL
  return `https://example.com/oauth/authorize?platform=${platform}&state=${state}&redirect_uri=${encodeURIComponent(REDIRECT)}`;
}

// Exchange code for tokens using provider token URL if configured; otherwise return mock tokens.
export async function exchangeCodeForToken(platform: Platform, code: string, codeVerifier?: string) {
  const TOKEN_URL = envVar(`${upper(platform)}_TOKEN_URL`);
  const CLIENT_ID = envVar(`${upper(platform)}_CLIENT_ID`);
  const CLIENT_SECRET = envVar(`${upper(platform)}_CLIENT_SECRET`);
  const REDIRECT = envVar('OAUTH_REDIRECT_URI') || 'http://localhost:3000/api/oauth/callback';

  // If provider supports PKCE, caller may include `code_verifier` in the params map passed via options.
  if (TOKEN_URL && CLIENT_ID && CLIENT_SECRET) {
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', REDIRECT);
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);
    // If caller provides a PKCE code_verifier, include it in the token exchange
    if (codeVerifier) params.append('code_verifier', codeVerifier);

    const resp = await axios.post(TOKEN_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    const data = resp.data;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in ? Date.now() + Number(data.expires_in) * 1000 : undefined
    } as any;
  }

  // mocked fallback
  await new Promise((r) => setTimeout(r, 200));
  const now = Date.now();
  return {
    accessToken: `access-${platform}-${now}-${nanoid(6)}`,
    refreshToken: `refresh-${platform}-${now}-${nanoid(6)}`,
    expiresAt: now + 60 * 60 * 1000
  };
}

// Refresh access token using provider's token endpoint if configured; otherwise mock.
export async function refreshAccessToken(platform: Platform, refreshToken: string) {
  const TOKEN_URL = envVar(`${upper(platform)}_TOKEN_URL`);
  const CLIENT_ID = envVar(`${upper(platform)}_CLIENT_ID`);
  const CLIENT_SECRET = envVar(`${upper(platform)}_CLIENT_SECRET`);

  if (TOKEN_URL && CLIENT_ID && CLIENT_SECRET) {
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken);
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);

    const resp = await axios.post(TOKEN_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    const data = resp.data;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresAt: data.expires_in ? Date.now() + Number(data.expires_in) * 1000 : undefined
    } as any;
  }

  // mocked fallback
  await new Promise((r) => setTimeout(r, 150));
  const now = Date.now();
  return {
    accessToken: `access-${platform}-${now}-${nanoid(6)}`,
    refreshToken: refreshToken || `refresh-${platform}-${now}-${nanoid(6)}`,
    expiresAt: now + 60 * 60 * 1000
  };
}

// Persist tokens into lowdb. Upsert by platform.
export function storeTokenRecord(platform: Platform, tokens: { accessToken: string; refreshToken?: string; expiresAt?: number }) {
  db.read();
  const existingIdx = db.data!.tokens.findIndex((t) => t.platform === platform);
  if (existingIdx !== -1) {
    const rec = db.data!.tokens[existingIdx];
    rec.accessToken = tokens.accessToken;
    if (tokens.refreshToken) rec.refreshToken = tokens.refreshToken;
    if (tokens.expiresAt !== undefined) rec.expiresAt = tokens.expiresAt;
    db.write();
    return rec;
  }
  const rec = { id: nanoid(), platform, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: tokens.expiresAt } as any;
  db.data!.tokens.push(rec);
  db.write();
  return rec;
}

export function getStoredTokenRecord(platform: Platform) {
  db.read();
  return db.data!.tokens.find((t) => t.platform === platform);
}

// Ensure we return a valid access token: refresh if expired/near-expiry and persist updated tokens.
export async function getValidAccessToken(platform: Platform) {
  db.read();
  const rec = db.data!.tokens.find((t) => t.platform === platform);
  if (!rec) return undefined;

  const now = Date.now();
  // Refresh if expiresAt is set and less than 60s from now
  if (rec.expiresAt && rec.expiresAt - now < 60 * 1000) {
    if (!rec.refreshToken) return rec.accessToken; // can't refresh
    try {
      const refreshed = await refreshAccessToken(platform, rec.refreshToken);
      // persist
      rec.accessToken = refreshed.accessToken;
      rec.refreshToken = refreshed.refreshToken || rec.refreshToken;
      rec.expiresAt = refreshed.expiresAt;
      db.write();
      return rec.accessToken;
    } catch (err) {
      // on refresh failure, return existing token (may still work) and surface later
      return rec.accessToken;
    }
  }

  return rec.accessToken;
}

export default {
  isSupported,
  generateAuthUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  storeTokenRecord,
  getStoredTokenRecord,
  getValidAccessToken
};

