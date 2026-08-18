import json, urllib.request, time

# Gitlawb free models from known catalog + query
BASE = 'https://opengateway.gitlawb.com/v1'
KEYS = [
    ('BETTY', 'ogw_live_0ae34e84907dd24ea69c49ba10767975'),
    ('BYTE', 'ogw_live_9000caa642ff60c547de4b0d12e7604f'),
    ('NOCTURNE', 'ogw_live_663df3d619b791029b124607a888b227'),
    ('FAEY', 'ogw_live_e713624f7898a5ac8e91d7c7771d7b09'),
    ('kallmedis', 'ogw_live_9f06cc943ece6f0345e185d417641dfc'),
]

# First, get live model list
print('=== Querying gitlawb models ===')
req = urllib.request.Request(f'{BASE}/models', headers={'Authorization': f'Bearer {KEYS[0][1]}'})
try:
    with urllib.request.urlopen(req, timeout=15) as resp:
        d = json.loads(resp.read().decode())
        models = [m['id'] for m in d.get('data', [])]
        print(f'  Got {len(models)} models')
except Exception as e:
    print(f'  Error: {e}')
    models = []

# Known free models to test (from catalog)
free_models = [
    'google/gemini-3.1-flash-lite',
    'qwen/qwen3.7-max',
    'tencent/hy3',
    'xiaomi/mimo-v2.5',
    'xiaomi/mimo-v2.5-pro',
    'z-ai/glm-5.2',
    'inclusionai/ling-3.0-flash',
    'mindai/macaron-v1-tall',
    'mindai/macaron-v1-venti',
    'minimax/minimax-m3',
    'moonshotai/kimi-k3',
    'nvidia/nemotron-3-ultra-550b-a55b:free',
    'auto',
]

# Test all keys against all free models
print(f'\n=== GITLAWB FULL MATRIX ({len(KEYS)} keys × {len(free_models)} models) ===')
results = {}
for label, key in KEYS:
    results[label] = {'working': [], 'dead': []}
    for model in free_models:
        payload = json.dumps({'model': model, 'messages': [{'role': 'user', 'content': 'ping'}], 'max_tokens': 5}).encode()
        req = urllib.request.Request(f'{BASE}/chat/completions', data=payload, headers={
            'Authorization': f'Bearer {key}',
            'Content-Type': 'application/json'
        })
        start = time.monotonic()
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                lat = (time.monotonic()-start)*1000
                results[label]['working'].append((model, lat))
        except urllib.error.HTTPError as e:
            err = e.read().decode() if e.fp else ''
            results[label]['dead'].append((model, e.code, err[:50]))
        except Exception as e:
            results[label]['dead'].append((model, '?', str(e)[:50]))
        time.sleep(0.3)

for label, res in results.items():
    working = len(res['working'])
    dead = len(res['dead'])
    status = '✅' if dead == 0 else '⚠️' if working > 0 else '❌'
    print(f'\n{status} {label}: {working}/{working+dead} models working')
    for model, lat in res['working']:
        print(f'    ✅ {model:45s} {lat:.0f}ms')
    for model, code, err in res['dead']:
        print(f'    ❌ {model:45s} {code} {err}')
