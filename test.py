import requests

# 基础URL
BASE_URL = "http://localhost:5000"

def main():
    headers = {'token': 'Bearer ' + "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9"}
    url = BASE_URL + "/api/config"
    r = requests.get(url, headers=headers)
    print(r.text)

if __name__ == "__main__":
    main()