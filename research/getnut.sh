UA="Mozilla/5.0 (X11; Linux x86_64)"
fetch () {
  q="$1"
  fdc=$(curl -sS -G -H "User-Agent: $UA" --max-time 30 "https://api.nal.usda.gov/fdc/v1/foods/search" --data-urlencode "api_key=DEMO_KEY" --data-urlencode "query=$q" --data-urlencode "pageSize=1" | python -c "import sys,json;d=json.load(sys.stdin);f=d.get('foods',[]);print(f[0]['fdcId'] if f else 'NONE')")
  if [ "$fdc" = "NONE" ]; then echo "$1 | NO FOOD"; return; fi
  curl -sS -H "User-Agent: $UA" --max-time 30 "https://api.nal.usda.gov/fdc/v1/food/$fdc?api_key=DEMO_KEY" | python -c "
import sys,json
fd=json.load(sys.stdin)
n={x.get('nutrient',{}).get('name'):x.get('amount') for x in fd.get('foodNutrients',[])}
def g(names):
    for nm in names:
        if nm in n and n[nm] is not None: return n[nm]
    return None
print('$1 |', fd.get('description'),
 '| A_RAE=',g(['Vitamin A, RAE']),
 '| A_IU=',g(['Vitamin A, IU']),
 '| C=',g(['Vitamin C, total ascorbic acid']),
 '| Fe=',g(['Iron, Fe']),
 '| Ca=',g(['Calcium, Ca']),
 '| Prot=',g(['Protein']))
"
}
fetch "amaranth leaves raw"
fetch "sweet potato raw"
fetch "cassava raw"
fetch "cowpea raw"
fetch "pigeon pea raw"
fetch "sorghum grain"
fetch "pumpkin raw"
fetch "spinach raw"
fetch "cabbage raw"
