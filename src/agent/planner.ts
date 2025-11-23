import { PostRecord } from '../models';
import axios from 'axios';

const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

type Planned = Partial<PostRecord> & { raw?: any };

function simpleSafetyChecks(text: string) {
	const errors: string[] = [];
	if (!text || text.trim().length === 0) errors.push('text-empty');
	if (text && text.length > 280) errors.push('text-too-long');

	// Very small, conservative blacklist for demo (expand for production)
	const banned = ['bomb', 'kill', 'terror', 'assassinate'];
	const low = text.toLowerCase();
	for (const b of banned) if (low.includes(b)) errors.push('safety-problem');
	return errors;
}

// Call OpenAI Chat Completions and parse a JSON reply describing a planned post.
export async function planPostFromPrompt(prompt: string): Promise<Planned> {
	// If no API key configured, return a deterministic mock so the app still works offline.
	if (!OPENAI_KEY) {
		return {
			text: prompt.trim().slice(0, 280),
			media: [],
			platform: ['twitter'],
			raw: { mocked: true }
		} as Planned;
	}

	const system = `You are a social media assistant. Given a user's prompt, produce a JSON object only (no extra text) with the following schema: {"text": string, "media": string[], "platform": string[], "scheduledAt": number | null}. Keep text concise (<=280 chars for tweets).`;
	const user = `Plan a post for: ${prompt}\nReturn JSON exactly matching the schema.`;

	try {
		const resp = await axios.post(
			'https://api.openai.com/v1/chat/completions',
			{
				model: OPENAI_MODEL,
				messages: [
					{ role: 'system', content: system },
					{ role: 'user', content: user }
				],
				temperature: 0.2,
				max_tokens: 400
			},
			{ headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' } }
		);

		const content = resp.data?.choices?.[0]?.message?.content;
		if (!content || typeof content !== 'string') {
			return { text: prompt.trim().slice(0, 280), media: [], platform: ['twitter'], raw: resp.data } as Planned;
		}

		// Try to extract JSON from the model output
		const jsonMatch = content.match(/\{[\s\S]*\}/);
		let parsed: any = null;
		if (jsonMatch) {
			try {
				parsed = JSON.parse(jsonMatch[0]);
			} catch (e) {
				parsed = null;
			}
		}

		if (!parsed) {
			// fallback: return the content as text
			return { text: content.trim().slice(0, 280), media: [], platform: ['twitter'], raw: resp.data } as Planned;
		}

		const planned: Planned = {
			text: (parsed.text || '').toString().trim(),
			media: Array.isArray(parsed.media) ? parsed.media : [],
			platform: Array.isArray(parsed.platform) ? parsed.platform : ['twitter'],
			scheduledAt: parsed.scheduledAt ? Number(parsed.scheduledAt) : undefined,
			raw: resp.data
		};

		return planned;
	} catch (err: any) {
		// On error, return a simple fallback
		return { text: prompt.trim().slice(0, 280), media: [], platform: ['twitter'], raw: { error: String(err) } } as Planned;
	}
}

export function validatePlannedPost(partial: Partial<PostRecord>) {
	const errors: string[] = [];
	if (!partial.text || partial.text.trim().length === 0) errors.push('text-empty');
	if (partial.text && partial.text.length > 280) errors.push('text-too-long');

	// run simple safety checks
	if (partial.text) {
		errors.push(...simpleSafetyChecks(partial.text));
	}
	// dedupe errors
	return Array.from(new Set(errors));
}