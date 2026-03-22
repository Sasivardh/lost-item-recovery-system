import requests
import json

SUPABASE_URL = "https://xomclzzklfhuilubvtbz.supabase.co/rest/v1/items"
SUPABASE_KEY = "sb_secret_nsaHSANyXZ9vlvFtSsFyqQ_o9oZCx7I"

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json"
}

try:
    print(f"Fetching from {SUPABASE_URL} ...")
    response = requests.get(f"{SUPABASE_URL}?select=*&limit=1", headers=headers)
    print(f"Status Code: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print("Schema Sample:")
        if data:
            print(json.dumps(data[0], indent=2))
            for key, val in data[0].items():
                print(f"{key}: {type(val).__name__}")
        else:
            print("No data found in table.")
    else:
        print(f"Response: {response.text}")
except Exception as e:
    print(f"Error: {e}")
