// Live check: does the harness run a real web search right now?
const { webSearchTool } = require('../packages/chimera-tools/dist/index.js');

(async () => {
  const res = await webSearchTool.execute({ query: 'chimera multi-agent coding', numResults: 3 }, {});
  const results = res.results || [];
  console.log('total:', res.total, '| warning:', res._warning || 'none');
  for (const r of results.slice(0, 3)) console.log(' -', r.title, '\n   ', r.url);
  const pass = results.length > 0;
  console.log(pass ? 'LIVE WEBSEARCH PASS' : 'LIVE WEBSEARCH FAIL');
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error('THREW:', e.message); process.exit(1); });
