import axios from 'axios';
import db from '../db';
import { PostRecord, Platform } from '../models';
import * as mock from './mockProviders';
import oauth from '../oauth';

// Lightweight provider wrappers. These try a real HTTP call when a token and
// minimal config is available; otherwise they fall back to the mock providers.

export async function postToPlatform(platform: Platform, post: PostRecord, token?: string) {
  // prefer explicit token, otherwise attempt to get a valid token (refresh if needed)
  if (!token) {
    token = await oauth.getValidAccessToken(platform);
  }

  try {
    if (platform === 'twitter' && token) {
      // Twitter v2 post tweet endpoint
      const url = 'https://api.twitter.com/2/tweets';
      const body = { text: post.text };
      const resp = await axios.post(url, body, { headers: { Authorization: `Bearer ${token}` } });
      const id = resp.data?.data?.id || `tw-${Date.now()}`;
      return { success: true, platformId: id, raw: resp.data };
    }

    if (platform === 'facebook' && token) {
      // Facebook Graph API: post to page feed. Requires PAGE_ID in env.
      const pageId = process.env.FACEBOOK_PAGE_ID;
      if (pageId) {
        const url = `https://graph.facebook.com/${pageId}/feed`;
        const resp = await axios.post(url, new URLSearchParams({ message: post.text, access_token: token }).toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        const id = resp.data?.id || `fb-${Date.now()}`;
        return { success: true, platformId: id, raw: resp.data };
      }
    }

    if (platform === 'linkedin' && token) {
      // Minimal LinkedIn share (requires organization or user URN). Use env var for simplification.
      const owner = process.env.LINKEDIN_OWNER_URN; // e.g. urn:li:organization:12345 or urn:li:person:...
      if (owner) {
        const url = 'https://api.linkedin.com/v2/ugcPosts';
        const body = {
          author: owner,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary: { text: post.text },
              shareMediaCategory: 'NONE'
            }
          },
          visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
        };
        const resp = await axios.post(url, body, { headers: { Authorization: `Bearer ${token}`, 'X-Restli-Protocol-Version': '2.0.0', 'Content-Type': 'application/json' } });
        const id = resp.data?.id || `li-${Date.now()}`;
        return { success: true, platformId: id, raw: resp.data };
      }
    }

    // No real provider available -> fallback to mock provider
    return await mock.postToPlatform(platform, post, token);
  } catch (err: any) {
    // Bubble up provider errors so executor can retry
    throw err;
  }
}

export async function fetchAnalytics(platform: Platform, platformId: string) {
  // For now, use mock analytics as we don't have standardized metrics across providers.
  return mock.fetchAnalytics(platform, platformId);
}

export default { postToPlatform, fetchAnalytics };
