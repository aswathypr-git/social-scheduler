import db from '../db';
import { PostRecord, Platform } from '../models';
import { postToPlatform } from '../social/providers';


export async function executePost(postId: string) {
db.read();
const post = db.data!.posts.find((p) => p.id === postId);
if (!post) throw new Error('post-not-found');


// mark queued
post.status = 'queued';
db.write();


for (const plat of post.platform) {
try {
await attemptPostWithRetries(plat, post, 3);
} catch (err: any) {
post.status = 'failed';
post.lastError = err.message || String(err);
db.write();
return { success: false, error: err.message };
}
}


post.status = 'posted';
db.write();
return { success: true };
}


async function attemptPostWithRetries(platform: Platform, post: PostRecord, maxAttempts = 3) {
let attempt = 0;
const baseDelay = 1000; // ms
while (attempt < maxAttempts) {
try {
attempt++;
await postToPlatform(platform, post);
return;
} catch (err: any) {
// exponential backoff
const delay = baseDelay * Math.pow(2, attempt - 1);
console.warn(`post attempt ${attempt} to ${platform} failed: ${err.message}. retrying in ${delay}ms`);
await new Promise((r) => setTimeout(r, delay));
}
}
throw new Error(`failed-after-${maxAttempts}`);
}