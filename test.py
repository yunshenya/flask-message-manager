import requests

# 基础URL
BASE_URL = "http://localhost:5000"

def main():
    headers = {'token': 'Bearer ' + "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9"}
    url = BASE_URL + "/api/update_phone_number"
    json = {
        'pade_code': "123",
        "phone_number": "收到goe1111111s",
    }
    r = requests.post(url, headers=headers, json=json)
    print(r.json())

if __name__ == "__main__":
    main()