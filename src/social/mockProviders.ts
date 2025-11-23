import { PostRecord, Platform } from '../models';


// Simple mock: pretend to post and return success after a short delay.
export async function postToPlatform(platform: Platform, post: PostRecord, token?: string) {
console.log(`MOCK POST to ${platform}:`, post.text.slice(0, 80));
// simulate network latency
await new Promise((r) => setTimeout(r, 400));


// fake random failure for testing retries
if (Math.random() < 0.12) {
const err = new Error('Mock network error');
// @ts-ignore
err.code = 'E_MOCK_FAIL';
throw err;
}


return {
success: true,
platformId: `mock-${platform}-${Date.now()}`,
raw: { postedAt: Date.now() }
};
}


export async function fetchAnalytics(platform: Platform, platformId: string) {
await new Promise((r) => setTimeout(r, 200));
return {
impressions: Math.floor(Math.random() * 1000),
clicks: Math.floor(Math.random() * 200),
engagement: Math.floor(Math.random() * 500)
};
}