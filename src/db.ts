import { LowSync, JSONFileSync } from 'lowdb';
import { join } from 'path';
import { DBSchema } from './models';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';


// store JSON in ./data/db.json
const dataDir = join(process.cwd(), 'data');
if (!existsSync(dataDir)) mkdirSync(dataDir);
const file = join(dataDir, 'db.json');
const adapter = new JSONFileSync<DBSchema>(file);
const db = new LowSync(adapter);


// initialize
db.read();
if (!db.data) {
	db.data = { tokens: [], posts: [], analytics: [], oauthStates: [] } as any;
db.write();
}


export default db;
