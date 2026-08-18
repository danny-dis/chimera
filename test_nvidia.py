import json, urllib.request, time

NVIDIA_KEY = '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'
BASE = 'https://integrate.api.nvidia.com/v1'

# Get model list
req = urllib.request.Request(f'{BASE}/models', headers={'Authorization': f'Bearer {NVIDIA_KEY}'})
try:
    with urllib.request.urlopen(req, timeout=15) as resp:
        d = json.loads(resp.read().decode())
        models = [m['id'] for m in d.get('data', [])]
        print(f'NVIDIA NIM: {len(models)} models available')
        for m in models:
            print(f'  {m}')
except Exception as e:
    print(f'Error: {e}')

# Test each model
print(f'\n=== TESTING {len(models)} MODELS ===')
working = []
dead = []
for model in models:
    payload = json.dumps({'model': model, 'messages': [{'role': 'user', 'content': 'ping'}], 'max_tokens': 5}).encode()
    req = urllib.request.Request(f'{BASE}/chat/completions', data=payload, headers={
        'Authorization': f'Bearer {NVIDIA_KEY}',
        'Content-Type': 'application/json'
    })
    start = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            lat = (time.monotonic()-start)*1000
            working.append((model, lat))
            print(f'  ✅ {model:50s} {lat:.0f}ms')
    except urllib.error.HTTPError as e:
        lat = (time.monotonic()-start)*1000
        err = e.read().decode()[:60] if e.fp else ''
        dead.append((model, e.code, err))
        print(f'  ❌ {model:50s} {e.code} {err}')
    except Exception as e:
        lat = (time.monotonic()-start)*1000
        dead.append((model, '?', str(e)[:50]))
        print(f'  ❌ {model:50s} {lat:.0f}ms {str(e)[:40]}')
    time.sleep(0.3)

print(f'\n=== SUMMARY: {len(working)}/{len(models)} working ===')
