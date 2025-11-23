import express from 'express';
import db from './db';
import { nanoid } from 'nanoid';
import { planPostFromPrompt, validatePlannedPost } from './agent/planner';
import { fetchAnalytics } from './social/providers';
import reasoner from './agent/reasoner';
import oauth, { isSupported as isOauthSupported } from './oauth';
import crypto from 'crypto';


const router = express.Router();


// schedule post (manual)
router.post('/posts/schedule', async (req, res) => {
const { text, platforms, at } = req.body;
if (!text || !platforms) return res.status(400).send({ error: 'missing' });


const id = nanoid();
const post = {
id,
text,
platform: platforms,
status: 'scheduled',
scheduledAt: at ? new Date(at).getTime() : Date.now() + 5000,
createdAt: Date.now(),
attempts: 0,
lastError: null
};
db.read();
db.data!.posts.push(post as any);
db.write();
res.send({ success: true, post });
});


// plan via prompt (LLM)
router.post('/posts/plan', async (req, res) => {
const { prompt } = req.body;
if (!prompt) return res.status(400).send({ error: 'missing prompt' });
const planned = await planPostFromPrompt(prompt);
const errors = validatePlannedPost(planned);
res.send({ planned, errors });
});


// list posts
router.get('/posts', (req, res) => {
db.read();
res.send(db.data!.posts);
});


// trigger analytics fetch (mock)
router.post('/analytics/fetch', async (req, res) => {
// this is a stub; in real impl we'll call fetchers per platform
res.send({ success: true, note: 'analytics fetch is mocked in example' });
});


// --- OAuth demo routes (mocked) --------------------------------------------------
// Get a mock authorization URL for a platform. In real usage this redirects to provider.
router.get('/oauth/:platform/url', (req, res) => {
	const platform = String(req.params.platform || '');
	if (!isOauthSupported(platform)) return res.status(400).send({ error: 'unsupported platform' });

	// Twitter: support PKCE flow (generate code_verifier, store by state, return URL with code_challenge)
	if (platform === 'twitter') {
		const state = nanoid();
		// generate code_verifier and code_challenge
		const verifier = crypto.randomBytes(64).toString('base64url');
		const sh = crypto.createHash('sha256').update(verifier).digest();
		const challenge = Buffer.from(sh).toString('base64url');

		// build URL with code_challenge
		const baseUrl = oauth.generateAuthUrl(platform as any, state);
		const url = `${baseUrl}&code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=S256`;

		// store verifier against state so we can use it on callback
		db.read();
		db.data!.oauthStates.push({ state, platform, verifier, createdAt: Date.now() } as any);
		db.write();

		return res.send({ url, state });
	}

	const url = oauth.generateAuthUrl(platform as any);
	res.send({ url });
});

// OAuth callback (provider would redirect here with code). This exchanges code and stores tokens.
router.get('/oauth/callback', async (req, res) => {
	const platform = String(req.query.platform || req.body?.platform || '');
	const code = String(req.query.code || req.body?.code || '');
	if (!platform || !code) return res.status(400).send({ error: 'missing platform or code' });
	if (!isOauthSupported(platform)) return res.status(400).send({ error: 'unsupported platform' });

		try {
			let codeVerifier: string | undefined = undefined;
			// If provider used PKCE (Twitter), attempt to locate stored verifier by state
			const state = String(req.query.state || req.body?.state || '');
			if (platform === 'twitter' && state) {
				db.read();
				const idx = db.data!.oauthStates.findIndex((s: any) => s.state === state && s.platform === 'twitter');
				if (idx !== -1) {
					codeVerifier = db.data!.oauthStates[idx].verifier;
					// remove used state
					db.data!.oauthStates.splice(idx, 1);
					db.write();
				}
			}

			const tokens = await oauth.exchangeCodeForToken(platform as any, code, codeVerifier);
			// persist via oauth helper (upsert)
			oauth.storeTokenRecord(platform as any, {
				accessToken: tokens.accessToken,
				refreshToken: tokens.refreshToken,
				expiresAt: tokens.expiresAt
			});
			return res.send({ success: true, platform, tokens });
		} catch (err: any) {
			return res.status(500).send({ error: 'token-exchange-failed', detail: String(err) });
		}
});

// Refresh access token for a platform (uses stored refresh token)
router.post('/oauth/refresh/:platform', async (req, res) => {
	const platform = String(req.params.platform || '');
	if (!platform) return res.status(400).send({ error: 'missing platform' });
	if (!isOauthSupported(platform)) return res.status(400).send({ error: 'unsupported platform' });

	db.read();
	const tokenRec = db.data!.tokens.find((t) => t.platform === platform);
	if (!tokenRec || !tokenRec.refreshToken) return res.status(404).send({ error: 'no-refresh-token' });

	try {
		const refreshed = await oauth.refreshAccessToken(platform as any, tokenRec.refreshToken!);
		tokenRec.accessToken = refreshed.accessToken;
		tokenRec.refreshToken = refreshed.refreshToken;
		tokenRec.expiresAt = refreshed.expiresAt;
		db.write();
		return res.send({ success: true, tokens: refreshed });
	} catch (err: any) {
		return res.status(500).send({ error: 'refresh-failed', detail: String(err) });
	}
});

// Dev helper: list stored tokens (do not expose in production)
router.get('/oauth/tokens', (req, res) => {
	db.read();
	res.send(db.data!.tokens || []);
});

// Dev helper: create or upsert a mock token for a platform (useful for testing)
router.post('/oauth/mock-token', (req, res) => {
	const { platform, accessToken, refreshToken, expiresIn, expiresAt } = req.body || {};
	if (!platform || !accessToken) return res.status(400).send({ error: 'missing platform or accessToken' });
	const exp = expiresAt ? Number(expiresAt) : (expiresIn ? Date.now() + Number(expiresIn) * 1000 : undefined);
	try {
		oauth.storeTokenRecord(platform as any, { accessToken: String(accessToken), refreshToken: refreshToken ? String(refreshToken) : undefined, expiresAt: exp });
		return res.send({ success: true });
	} catch (err: any) {
		return res.status(500).send({ error: 'store-failed', detail: String(err) });
	}
});


// demo chat endpoint for the static UI
router.post('/chat', async (req, res) => {
	const { message } = req.body as { message?: string };
	if (!message) return res.status(400).send({ error: 'missing message' });

	const text = String(message).trim().toLowerCase();

	try {
		// schedule flow: if message contains 'schedule' we'll plan and schedule a post
		if (text.includes('schedule')) {
			const planned = await planPostFromPrompt(message);
			const errors = validatePlannedPost(planned);
			if (errors.length) return res.send({ response: `Planning failed: ${errors.join(', ')}` });

			const id = nanoid();
			const post = {
				id,
				text: planned.text || message,
				platform: planned.media ? ['twitter'] : ['twitter'],
				status: 'scheduled',
				scheduledAt: Date.now() + 5000,
				createdAt: Date.now(),
				attempts: 0,
				lastError: null
			} as any;
			db.read();
			db.data!.posts.push(post);
			db.write();
			return res.send({ response: `Scheduled post ${id} to run in ~5s` });
		}

		// fetch analytics flow
		if (text.includes('fetch analytics') || text.includes('analytics')) {
			db.read();
			const posted = db.data!.posts.filter((p) => p.status === 'posted');
			const results: any[] = [];
			for (const p of posted) {
				for (const plat of p.platform) {
					const metrics = await fetchAnalytics(plat as any, `mock-${p.id}`);
					// store
					const rec = {
						id: nanoid(),
						platform: plat,
						postId: p.id,
						fetchedAt: Date.now(),
						metrics
					} as any;
					db.data!.analytics.push(rec);
					results.push({ postId: p.id, platform: plat, metrics });
				}
			}
			db.write();
			return res.send({ response: `Fetched analytics for ${results.length} items`, results });
		}

		// improve post flow: use planner to rewrite
		if (text.includes('improve') || text.includes('rewrite')) {
			const planned = await planPostFromPrompt(message);
			const errors = validatePlannedPost(planned);
			if (errors.length) return res.send({ response: `Improve failed: ${errors.join(', ')}` });
			return res.send({ response: `Improved post: ${planned.text}` });
		}

		// fallback: echo planning result
		const planned = await planPostFromPrompt(message);
		const errors = validatePlannedPost(planned);
		const reply = errors.length ? `Unable to plan: ${errors.join(', ')}` : `Planned: ${planned.text}`;
		return res.send({ response: reply });
	} catch (err: any) {
		return res.status(500).send({ error: 'chat-error', detail: String(err) });
	}
});


// General purpose reasoning endpoint: Q3 analysis, post improvements, scheduling suggestions
router.post('/reason', async (req, res) => {
	const { type, text, platform, context } = req.body as any;
	try {
		if (type === 'improve') {
			if (!text) return res.status(400).send({ error: 'missing text' });
			const out = await reasoner.improvePost(text);
			return res.send({ success: true, improved: out });
		}

		if (type === 'schedule') {
			if (!text) return res.status(400).send({ error: 'missing text' });
			const out = await reasoner.suggestSchedule(text, platform);
			return res.send({ success: true, schedule: out });
		}

		if (type === 'q3' || type === 'q3-reasoning') {
			if (!context) return res.status(400).send({ error: 'missing context' });
			const out = await reasoner.q3Reasoning(context);
			return res.send({ success: true, q3: out });
		}

		return res.status(400).send({ error: 'unknown-type' });
	} catch (err: any) {
		return res.status(500).send({ error: 'reasoning-failed', detail: String(err) });
	}
});


export default router;
