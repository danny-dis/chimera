import json, urllib.request, time

GATEWAY = 'http://localhost:47113'
ADMIN = 'dmrx-local-admin-key-2026'

# All providers with keys, one representative model each
providers = [
    ('codestral-free', 'codestral-free/codestral-2508', {'model': 'codestral-free/codestral-2508', 'messages': [{'role': 'user', 'content': 'ping'}], 'max_tokens': 5}),
    ('cohere', 'cohere/command-r-plus', {'model': 'cohere/command-r-plus', 'messages': [{'role': 'user', 'content': 'ping'}], 'max_tokens': 5}),
    ('gitlawb', 'gitlawb/tencent/hy3', {'model': 'gitlawb/tencent/hy3', 'messages': [{'role': 'user', 'content': 'ping'}], 'max_tokens': 5}),
    ('google', 'google/gemini-2.0-flash', {'model': 'google/gemini-2.0-flash', 'messages': [{'role': 'user', 'content': 'ping'}], 'max_tokens': 5}),
    ('mistral', 'mistral/codestral-2508', {'model': 'mistral/codestral-2508', 'messages': [{'role': 'user', 'content': 'ping'}], 'max_tokens': 5}),
    ('nvidia-nim', 'nvidia-nim/llama-3.1-8b-instruct', {'model': 'nvidia-nim/llama-3.1-8b-instruct', 'messages': [{'role': 'user', 'content': 'ping'}], 'max_tokens': 5}),
    ('opencode-zen', 'opencode-zen/nemotron-3-ultra-free', {'model': 'opencode-zen/nemotron-3-ultra-free', 'messages': [{'role': 'user', 'content': 'ping'}], 'max_tokens': 5}),
    ('openrouter-free', 'openrouter-free/openrouter/auto', {'model': 'openrouter-free/openrouter/auto', 'messages': [{'role': 'user', 'content': 'ping'}], 'max_tokens': 5}),
    ('tokenrouter', 'tokenrouter/auto', {'model': 'tokenrouter/auto', 'messages': [{'role': 'user', 'content': 'ping'}], 'max_tokens': 5}),
]

print('=== ALL PROVIDERS WITH KEYS — GATEWAY TEST ===')
for provider, model, payload in providers:
    body = json.dumps(payload).encode()
    req = urllib.request.Request(f'{GATEWAY}/v1/chat/completions', data=body, headers={
        'Authorization': f'Bearer {ADMIN}',
        'Content-Type': 'application/json'
    })
    start = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            lat = (time.monotonic()-start)*1000
            d = json.loads(resp.read().decode())
            content = d.get('choices',[{}])[0].get('message',{}).get('content','')[:30]
            print(f'  {provider:20s} ✅ {lat:.0f}ms  {content}')
    except urllib.error.HTTPError as e:
        lat = (time.monotonic()-start)*1000
        err = e.read().decode() if e.fp else ''
        # Try to extract meaningful error
        try:
            ed = json.loads(err)
            msg = ed.get('error',{}).get('message','')[:60] or ed.get('message','')[:60]
        except:
            msg = err[:60]
        print(f'  {provider:20s} ❌ {e.code} {lat:.0f}ms  {msg}')
    except Exception as e:
        lat = (time.monotonic()-start)*1000
        print(f'  {provider:20s} ❌ {lat:.0f}ms  {str(e)[:50]}')
    time.sleep(1.5)
