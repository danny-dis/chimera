/**
 * `chimera projects` — track active projects in a local web UI.
 *
 *   chimera projects                 — serve the tracker UI at http://localhost:8787
 *   chimera projects --port 9000     — serve on a different port
 *
 * Data lives in .chimera/projects.json (project root). Plain node:http, no deps.
 */
import { Command } from 'commander';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const PORT = 8787;

type Project = {
  id: string;
  name: string;
  status: 'active' | 'hold' | 'done';
  priority: 'low' | 'med' | 'high';
  due: string;
  notes: string;
  created: number;
};

// ponytail: single JSON file, whole-array read/write. Fine for one user's
// project list. Swap for a DB if it ever gets big (it won't).
const dataFile = () => join(process.cwd(), '.chimera', 'projects.json');
const uiFile = join(__dirname, 'projects-ui.html');

const load = async (): Promise<Project[]> => {
  try {
    return JSON.parse(await readFile(dataFile(), 'utf-8'));
  } catch {
    return [];
  }
};

const save = async (projects: Project[]): Promise<void> => {
  await mkdir(join(process.cwd(), '.chimera'), { recursive: true });
  await writeFile(dataFile(), JSON.stringify(projects, null, 2), 'utf-8');
};

const readBody = (req: import('node:http').IncomingMessage): Promise<any> =>
  new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data ? JSON.parse(data) : {}));
    req.on('error', reject);
  });

export function registerProjectsCommand(parent: Command): Command {
  return parent
    .command('projects')
    .description('Track active projects with a local web UI')
    .option('--port <n>', 'Port to serve on', String(PORT))
    .action(async (opts) => {
      const port = Number(opts.port) || PORT;
      const ui = await readFile(uiFile, 'utf-8');
      const server = createServer(async (req, res) => {
        // ponytail: no router lib — method + path is the whole surface.
        if (req.method === 'GET' && req.url === '/') {
          res.writeHead(200, { 'content-type': 'text/html' });
          res.end(ui);
          return;
        }
        if (req.url === '/api') {
          try {
            if (req.method === 'GET') {
              res.writeHead(200, { 'content-type': 'application/json' });
              res.end(JSON.stringify(await load()));
              return;
            }
            const body = await readBody(req);
            const projects = await load();
            if (req.method === 'PUT') {
              projects.push({
                id: crypto.randomUUID(),
                name: body.name || 'Untitled',
                status: body.status || 'active',
                priority: body.priority || 'med',
                due: body.due || '',
                notes: body.notes || '',
                created: Date.now(),
              });
            } else if (req.method === 'POST') {
              // Cycle status active -> hold -> done -> active.
              const order: Project['status'][] = ['active', 'hold', 'done'];
              const p = projects.find((x) => x.id === body.id);
              if (p) p.status = order[(order.indexOf(p.status) + 1) % order.length];
            } else if (req.method === 'DELETE') {
              const kept = projects.filter((x) => x.id !== body.id);
              await save(kept);
              res.writeHead(200, { 'content-type': 'application/json' });
              res.end(JSON.stringify(kept));
              return;
            }
            await save(projects);
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify(projects));
            return;
          } catch (err) {
            res.writeHead(500, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: String(err) }));
            return;
          }
        }
        res.writeHead(404);
        res.end();
      });
      server.listen(port, () => {
        console.log(`\n  Project tracker running at http://localhost:${port}`);
        console.log(`  Data: ${dataFile()}`);
        console.log('  Press Ctrl+C to stop.\n');
      });
    });
}
