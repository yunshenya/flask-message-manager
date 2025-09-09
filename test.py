import requests

# 基础URL
BASE_URL = "http://localhost:5000"

def main():
    headers = {'token': 'Bearer ' + "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9"}
    url = BASE_URL + "/api/update_last_time"
    json = {
        'url_id': 145,
        "last_time": "2025-09-09 11:45:14.00000",
    }
    r = requests.post(url, headers=headers, json=json)
    print(r.json())

if __name__ == "__main__":
    main()