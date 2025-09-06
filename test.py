import requests

# 基础URL
BASE_URL = "http://localhost:5000"

def main():
    headers = {'token': 'Bearer ' + "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9"}
    url = BASE_URL + "/api/urls/batch-update-label"
    json = {
        'updates': [{"url_id": 63, "label": "新标签"},{"url_id": 64, "label": "新标签"},{"url_id": 6, "label": "新标签"}]
    }
    r = requests.post(url, headers=headers, json=json)
    print(r.text)

if __name__ == "__main__":
    main()