import json, urllib.request, time

keys = {
    'BETTY/BYTE/FAEY': 'sk-84xSo2kC1lkbE73GpQDn0SmM6xpOtwAQZkY1vbFzVmE6aWdaVvda6W4H3qDNw3EZY',
    'NOCTURNE': 'sk-lIVHkjMJV2Scml69JJ5m4RI6G5W2efximXIwvhfONZBiWhoZRAkPFuhxo9WbUHtD',
    'kallmedis': 'sk-Iep2A6KPw4sYxHp4WqB1jJ8e1Mk2Qz5Uv8Kx9Lm3Nq6Rt7Sw0Tx1Yz2Az4Bc5JCbp',
}
models = ['deepseek-v4-flash-free', 'hy3-free', 'mimo-v2.5-free', 'laguna-s-2.1-free', 'nemotron-3-ultra-free', 'nemotron-3.5-lightning-free']

for label, key in keys.items():
    print(f'=== {label} ===')
    for model in models:
        body = json.dumps({'model': model, 'messages': [{'role':'user','content':'ping'}], 'max_tokens': 5}).encode()
        req = urllib.request.Request('https://opencode.ai/zen/v1/chat/completions', data=body, headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                d = json.loads(resp.read().decode())
                content = d.get('choices',[{}])[0].get('message',{}).get('content','')[:30]
                print(f'  {model:40s} ✅ {content}')
        except urllib.error.HTTPError as e:
            err = e.read().decode() if e.fp else ''
            print(f'  {model:40s} ❌ {e.code} {err[:50]}')
        except Exception as e:
            print(f'  {model:40s} ❌ {str(e)[:40]}')
        time.sleep(0.5)
