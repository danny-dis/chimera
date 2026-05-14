import { promises as fs } from 'node:fs';
import path from 'node:path';

export async function createSession(root, metadata) {
  const id = createSessionId(metadata.mode);
  const dir = path.join(root, '.chimera', 'sessions', id);
  await fs.mkdir(dir, { recursive: true });
  const eventsPath = path.join(dir, 'events.jsonl');
  const session = {
    id,
    dir,
    eventsPath,
    async record(event) {
      const payload = {
        timestamp: new Date().toISOString(),
        sessionId: id,
        ...event,
      };
      await fs.appendFile(eventsPath, `${JSON.stringify(payload)}\n`, 'utf8');
    },
  };
  await session.record({ type: 'session_started', metadata });
  return session;
}

function createSessionId(mode) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const random = Math.random().toString(36).slice(2, 8);
  return `${stamp}-${mode || 'session'}-${random}`;
}
