export function loadProviderConfig(env = process.env) {
  const apiKey = env.CHIMERA_API_KEY || env.OPENAI_API_KEY;
  const model = env.CHIMERA_MODEL;
  if (!apiKey || !model) return null;
  return {
    apiKey,
    model,
    baseUrl: (env.CHIMERA_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
  };
}

export async function completeWithProvider({ system, user, schemaHint }, env = process.env) {
  const config = loadProviderConfig(env);
  if (!config) return null;

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `${user}\n\n${schemaHint || ''}`.trim() },
      ],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`provider request failed (${response.status}): ${body.slice(0, 500)}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content?.trim() || null;
}
