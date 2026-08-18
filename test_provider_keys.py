import json, urllib.request, time, sys

# Test each key directly against upstream APIs (bypass gateway)
tests = [
    {
        'provider': 'cohere',
        'base_url': 'https://api.cohere.com/v2',
        'auth_header': 'Authorization',
        'prefix': 'Bearer',
        'endpoint': '/chat',
        'payload': {'model': 'command-r-plus', 'messages': [{'role': 'USER', 'message': 'ping'}], 'max_tokens': 5},
        'keys': [
            ('Default', 'cohere-default-key'),
            ('BETTY-free', 'cohere-betty-free'),
            ('BYTE-free', 'cohere-byte-free'),
            ('BETTY-free-2', 'cohere-betty-free-2'),
            ('BYTE-free-2', 'cohere-byte-free-2'),
            ('NOCTURNE-free', 'cohere-nocturne-free'),
            ('FAEY-free', 'cohere-faey-free'),
            ('kallmedis-free', 'cohere-kallmedis-free'),
        ]
    },
    {
        'provider': 'gitlawb',
        'base_url': 'https://opengateway.gitlawb.com/v1',
        'auth_header': 'Authorization',
        'prefix': 'Bearer',
        'endpoint': '/chat/completions',
        'payload': {'model': 'tencent/hy3', 'messages': [{'role': 'user', 'content': 'ping'}], 'max_tokens': 5},
        'keys': [
            ('Default', 'ogw_live_default'),
            ('BYTE-free', 'ogw_live_9000caa642ff60c547de4b0d12e7604f'),
            ('NOCTURNE-free', 'ogw_live_663df3d619b791029b124607a888b227'),
            ('BYTE-free-2', 'ogw_live_9000caa642ff60c547de4b0d12e7604f'),
            ('NOCTURNE-free-2', 'ogw_live_663df3d619b791029b124607a888b227'),
            ('FAEY-free', 'ogw_live_e713624f7898a5ac8e91d7c7771d7b09'),
            ('kallmedis-free', 'ogw_live_9f06cc943ece6f0345e185d417641dfc'),
        ]
    },
    {
        'provider': 'mistral',
        'base_url': 'https://api.mistral.ai/v1',
        'auth_header': 'Authorization',
        'prefix': 'Bearer',
        'endpoint': '/chat/completions',
        'payload': {'model': 'codestral-2508', 'messages': [{'role': 'user', 'content': 'ping'}], 'max_tokens': 5},
        'keys': [
            ('Default', '5ObWxj4xtjr5NjqjlhhWHTlFGNNzbRpm'),
            ('FAEY-free', 'SKN3Sx9Bq2cKVz8oVkcv49FrqIsPeB5u'),
            ('kallmedis-free', 'jG7GbtMolcrozu3ZfCEmu748H6TuvZl3'),
        ]
    },
    {
        'provider': 'opencode-zen',
        'base_url': 'https://opencode.ai/zen/v1',
        'auth_header': 'Authorization',
        'prefix': 'Bearer',
        'endpoint': '/chat/completions',
        'payload': {'model': 'nemotron-3-ultra-free', 'messages': [{'role': 'user', 'content': 'ping'}], 'max_tokens': 5},
        'keys': [
            ('Default', 'sk-84xSo2kC1lkbE73GpQDn0SmM6xpOtwAQZkY1vbFzVmE6aWdaVvda6W4H3qDNw3EZY'),
            ('NOCTURNE', 'sk-lIVHkjMJV2Scml69JJ5m4RI6G5W2efximXIwvhfONZBiWhoZRAkPFuhxo9WbUHtD'),
        ]
    },
]

for t in tests:
    print(f"\n{'='*60}")
    print(f"{t['provider'].upper()}")
    print(f"{'='*60}")
    for label, key in t['keys']:
        url = f"{t['base_url']}{t['endpoint']}"
        body = json.dumps(t['payload']).encode()
        req = urllib.request.Request(url, data=body, headers={
            t['auth_header']: f"{t['prefix']} {key}",
            'Content-Type': 'application/json'
        })
        start = time.monotonic()
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                lat = (time.monotonic()-start)*1000
                print(f"  {label:25s} ✅ {lat:.0f}ms")
        except urllib.error.HTTPError as e:
            lat = (time.monotonic()-start)*1000
            err = e.read().decode() if e.fp else ''
            # Extract key error info
            try:
                ed = json.loads(err)
                msg = ed.get('error',{}).get('message','')[:50] or ed.get('message','')[:50] or err[:50]
            except:
                msg = err[:50]
            print(f"  {label:25s} ❌ {e.code} {msg}")
        except Exception as e:
            lat = (time.monotonic()-start)*1000
            print(f"  {label:25s} ❌ {str(e)[:40]}")
        time.sleep(0.5)
