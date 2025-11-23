import axios from 'axios';
import { Platform } from '../models';

const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

type Q3Result = { summary: string; recommendations: string[]; raw?: any };
type ImproveResult = { text: string; raw?: any };
type ScheduleResult = { scheduledAt: number; rationale: string; raw?: any };

async function callOpenAI(system: string, user: string) {
  if (!OPENAI_KEY) return null;
  try {
    const resp = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      { model: OPENAI_MODEL, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0.2, max_tokens: 400 },
      { headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' } }
    );
    return resp.data?.choices?.[0]?.message?.content || null;
  } catch (err: any) {
    return null;
  }
}

export async function q3Reasoning(context: string): Promise<Q3Result> {
  // Provide high-level business quarter (Q3) reasoning: summarize and give recommendations.
  const system = 'You are a strategic product-marketing analyst. Given context about product performance, customers, and prior campaigns, summarize key points and produce 3 concise strategic recommendations for Q3. Return JSON only: {"summary":string, "recommendations": [string]}.';
  const user = `Context:\n${context}`;
  const content = await callOpenAI(system, user);
  if (!content) {
    // fallback heuristics
    return { summary: context.slice(0, 400), recommendations: ['Focus on top-performing channels', 'Increase cadence around product launches', 'Run A/B tests on CTA copy'], raw: { mocked: true } };
  }

  // try extract JSON
  const m = content.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const parsed = JSON.parse(m[0]);
      return { summary: String(parsed.summary || '').slice(0, 1000), recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [], raw: parsed };
    } catch (e) {
      // fallback to raw
      return { summary: content.slice(0, 1000), recommendations: [], raw: content };
    }
  }
  return { summary: content.slice(0, 1000), recommendations: [], raw: content };
}

export async function improvePost(text: string): Promise<ImproveResult> {
  const system = 'You are a social copywriter. Improve the given social media post for clarity, engagement, and brevity. Return JSON only: {"text": string}.';
  const user = `Post:\n${text}`;
  const content = await callOpenAI(system, user);
  if (!content) {
    // simple fallback: trim and ensure punctuation
    let t = text.trim();
    if (!/[.!?]$/.test(t)) t = t + '.';
    if (t.length > 280) t = t.slice(0, 277) + '...';
    return { text: t, raw: { mocked: true } };
  }

  const m = content.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const parsed = JSON.parse(m[0]);
      return { text: String(parsed.text || text).trim(), raw: parsed };
    } catch (e) {
      return { text: content.trim().slice(0, 280), raw: content };
    }
  }
  return { text: content.trim().slice(0, 280), raw: content };
}

export async function suggestSchedule(text: string, platform?: Platform): Promise<ScheduleResult> {
  // Heuristic + optional LLM to suggest a scheduled timestamp and short rationale.
  const heuristics = () => {
    const now = Date.now();
    // if near morning, schedule next hour; else schedule next weekday 9:00 local time
    const oneHour = 60 * 60 * 1000;
    const next = now + oneHour;
    const rationale = 'Heuristic: schedule shortly to validate reach; adjust by platform-specific peak times later.';
    return { scheduledAt: next, rationale };
  };

  const system = 'You are an expert social media strategist. Given a post and optional platform, recommend a best time to publish (timestamp in ms) and a short rationale. Return JSON only: {"scheduledAt": number, "rationale": string}.';
  const user = `Post: ${text}\nPlatform: ${platform || 'any'}`;
  const content = await callOpenAI(system, user);
  if (!content) return heuristics();

  const m = content.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const parsed = JSON.parse(m[0]);
      return { scheduledAt: Number(parsed.scheduledAt || Date.now() + 60 * 60 * 1000), rationale: String(parsed.rationale || '') , raw: parsed };
    } catch (e) {
      return heuristics();
    }
  }
  return heuristics();
}

export default { q3Reasoning, improvePost, suggestSchedule };
