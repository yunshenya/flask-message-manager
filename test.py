import requests

BASE_URL = "http://localhost:5000"

def main():
    headers = {'token': 'Bearer ' + "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9"}
    json_data = {
        "url_id": "34",
        'label': "运行中"
    }
    url = BASE_URL + "/api/add_label"

    try:
        r = requests.post(url, headers=headers, json=json_data)

        print(f"状态码: {r.status_code}")
        print(r.json())

        if r.status_code == 200:
            print(f"JSON响应: {r.json()}")

    except Exception as e:
        print(f"请求错误: {e}")

if __name__ == "__main__":
    main()