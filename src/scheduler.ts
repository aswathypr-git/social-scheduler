import cron from 'cron';
import db from './db';
import { executePost } from './agent/executor';


// runs every minute
export function startScheduler() {
const job = new cron.CronJob('* * * * *', async () => {
try {
db.read();
const now = Date.now();
const due = db.data!.posts.filter((p) => p.status === 'scheduled' && (p.scheduledAt || 0) <= now);
for (const p of due) {
console.log('scheduling post', p.id);
p.status = 'queued';
db.write();
// run execution in background (non-blocking)
executePost(p.id).then((r) => console.log('execute result', r)).catch((e) => console.error(e));
}
} catch (e) {
console.error('scheduler error', e);
}
});
job.start();
console.log('Scheduler started (runs every minute)');
}