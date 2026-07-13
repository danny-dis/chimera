import { createRequire } from 'module';
const require = createRequire('C:/Users/pc/Documents/projects/chimera/packages/chimera-cli/package.json');
const { OpenAICompatibleProvider } = require('@chimera/providers');

function makeProvider() {
  const p = new OpenAICompatibleProvider({
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'test',
    model: 'tencent/hy3',
  });
  return p;
}

const MALFORMED_TOOL_CALL = {
  id: 'call_1',
  type: 'function',
  function: undefined, // <-- missing function object
};

const OK_RESPONSE = {
  id: 'x',
  object: 'chat.completion',
  choices: [{
    index: 0,
    message: { role: 'assistant', content: '', tool_calls: [MALFORMED_TOOL_CALL] },
    finish_reason: 'tool_calls',
  }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
};

async function run(label, messages, tools) {
  const captured = {};
  globalThis.fetch = async (url, init) => {
    captured.body = init && init.body;
    return {
      ok: true,
      status: 200,
      json: async () => OK_RESPONSE,
      text: async () => JSON.stringify(OK_RESPONSE),
    };
  };
  const provider = makeProvider();
  try {
    const res = await provider.complete(messages, { tools });
    console.log(`[${label}] OK ->`, JSON.stringify(res).slice(0, 200));
  } catch (e) {
    console.log(`[${label}] THREW:`, e && e.message);
    console.log(`[${label}] STACK:\n`, (e && e.stack) || '(no stack)');
  }
  if (captured.body) {
    try {
      const parsed = JSON.parse(captured.body);
      const leaked = JSON.stringify(parsed).includes('"name":null') || JSON.stringify(parsed).includes('"name":undefined');
      console.log(`[${label}] request had name:null/undefined leaked =`, leaked);
    } catch {}
  }
}

(async () => {
  const messages = [{ role: 'user', content: 'write greeter.js' }];
  const tools = [{ name: 'write_file', description: 'write', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } } } }];

  // Case A: clean tools, malformed tool_call in RESPONSE
  await run('A-response-malformed-tc', messages, tools);

  // Case B: malformed tool DEF in request (name undefined)
  const badTools = [{ name: undefined, description: 'x', parameters: {} }];
  await run('B-request-malformed-def', messages, badTools);
})();
