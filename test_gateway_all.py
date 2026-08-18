import json, urllib.request, time, sys

# Test through the gateway for providers we can reach
GATEWAY = 'http://localhost:47113'
ADMIN = 'dmrx-local-admin-key-2026'

# Each test: (provider, model_in_gateway, payload)
tests = [
    ('cohere', 'cohere/command-r-plus', {'model': 'cohere/command-r-plus', 'messages': [{'role': 'user', 'content': 'ping'}], 'max_tokens': 5}),
    ('gitlawb', 'gitlawb/tencent/hy3', {'model': 'gitlawb/tencent/hy3', 'messages': [{'role': 'user', 'content': 'ping'}], 'max_tokens': 5}),
    ('mistral', 'mistral/codestral-2508', {'model': 'mistral/codestral-2508', 'messages': [{'role': 'user', 'content': 'ping'}], 'max_tokens': 5}),
    ('google', 'google/gemini-2.0-flash', {'model': 'google/gemini-2.0-flash', 'messages': [{'role': 'user', 'content': 'ping'}], 'max_tokens': 5}),
    ('tokenrouter', 'tokenrouter/auto', {'model': 'tokenrouter/auto', 'messages': [{'role': 'user', 'content': 'ping'}], 'max_tokens': 5}),
]

results = {}
for provider, model, payload in tests:
    body = json.dumps(payload).encode()
    req = urllib.request.Request(f'{GATEWAY}/v1/chat/completions', data=body, headers={
        'Authorization': f'Bearer {ADMIN}',
        'Content-Type': 'application/json'
    })
    start = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            lat = (time.monotonic()-start)*1000
            d = json.loads(resp.read().decode())
            content = d.get('choices',[{}])[0].get('message',{}).get('content','')[:30]
            results[provider] = f'✅ {lat:.0f}ms'
    except urllib.error.HTTPError as e:
        lat = (time.monotonic()-start)*1000
        err = e.read().decode()[:80] if e.fp else ''
        results[provider] = f'❌ {e.code} {lat:.0f}ms — {err}'
    except Exception as e:
        lat = (time.monotonic()-start)*1000
        results[provider] = f'❌ {lat:.0f}ms — {str(e)[:50]}'
    time.sleep(1)

print('=== GATEWAY TESTS (all providers with keys) ===')
for provider, result in results.items():
    print(f'  {provider:20s} {result}')
