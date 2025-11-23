export type Platform = 'facebook' | 'instagram' | 'linkedin' | 'twitter';


export interface TokenRecord {
id: string;
platform: Platform;
accessToken: string;
refreshToken?: string;
expiresAt?: number; // epoch ms
}


export interface PostRecord {
id: string;
text: string;
media?: string[]; // urls
platform: Platform[];
status: 'draft' | 'scheduled' | 'queued' | 'posted' | 'failed';
scheduledAt?: number; // epoch ms
attempts?: number;
lastError?: string | null;
createdAt: number;
}


export interface AnalyticsRecord {
id: string;
platform: Platform;
postId: string;
fetchedAt: number;
metrics: Record<string, number | string>;
}


export interface DBSchema {
tokens: TokenRecord[];
posts: PostRecord[];
analytics: AnalyticsRecord[];
	oauthStates: Array<{
		state: string;
		platform: Platform;
		verifier: string;
		createdAt: number;
	}>;
}