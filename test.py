import requests

# 基础URL
BASE_URL = "http://103.115.64.73:5000"

def main():
    headers = {'token': 'Bearer ' + "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9"}
    url = BASE_URL + "/api/callback"
    json = {
        "pade_code" : "AC20250226YXQG8Z"
    }
    r = requests.post(url, headers=headers, json=json)
    print(r.text)

if __name__ == "__main__":
    main()