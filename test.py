import requests
import json
import time

# 基础URL
BASE_URL = "http://localhost:5000"

def safe_json_response(response):
    """安全地处理JSON响应"""
    print(f"Status Code: {response.status_code}")
    print(f"Response Headers: {dict(response.headers)}")
    print(f"Raw Response: {response.text[:500]}...")  # 显示前500个字符

    if response.status_code == 200 or response.status_code == 201:
        try:
            return response.json()
        except json.JSONDecodeError as e:
            print(f"JSON解码错误: {e}")
            return {"error": "Invalid JSON response", "raw_text": response.text}
    else:
        print(f"HTTP错误: {response.status_code}")
        return {"error": f"HTTP {response.status_code}", "raw_text": response.text}

def test_server_connection():
    """测试服务器连接"""
    try:
        print("=== 测试服务器连接 ===")
        response = requests.get(f"{BASE_URL}/", timeout=5)
        result = safe_json_response(response)
        print("连接结果:", json.dumps(result, indent=2, ensure_ascii=False))
        return response.status_code == 200
    except requests.exceptions.ConnectionError:
        print("❌ 无法连接到服务器！请确保Flask应用正在运行。")
        return False
    except requests.exceptions.Timeout:
        print("❌ 连接超时！")
        return False
    except Exception as e:
        print(f"❌ 连接错误: {e}")
        return False

def get_config_info():
    """获取配置信息"""
    try:
        print("\n=== 获取配置信息 ===")
        response = requests.get(f"{BASE_URL}/api/config", timeout=10)
        result = safe_json_response(response)
        print("配置信息:", json.dumps(result, indent=2, ensure_ascii=False))
        return result
    except Exception as e:
        print(f"❌ 获取配置信息错误: {e}")
        return None

def get_existing_urls(config_id=1):
    """获取现有的URL列表"""
    try:
        print(f"\n=== 获取配置{config_id}的现有URL ===")
        response = requests.get(f"{BASE_URL}/api/config/{config_id}/urls", timeout=10)
        result = safe_json_response(response)
        print("现有URL:", json.dumps(result, indent=2, ensure_ascii=False))
        return result
    except Exception as e:
        print(f"❌ 获取URL列表错误: {e}")
        return None

def create_url(config_id, url, name, duration=30, max_num=3):
    """创建新URL"""
    try:
        print(f"\n=== 创建新URL: {name} ===")
        data = {
            "config_id": config_id,
            "url": url,
            "name": name,
            "duration": duration,
            "max_num": max_num
        }
        print("发送数据:", json.dumps(data, indent=2, ensure_ascii=False))

        response = requests.post(f"{BASE_URL}/api/url", json=data, timeout=10)
        result = safe_json_response(response)
        print("创建结果:", json.dumps(result, indent=2, ensure_ascii=False))
        return result
    except Exception as e:
        print(f"❌ 创建URL错误: {e}")
        return None

def update_url(url_id, **kwargs):
    """更新URL"""
    try:
        print(f"\n=== 更新URL ID: {url_id} ===")
        print("更新数据:", json.dumps(kwargs, indent=2, ensure_ascii=False))

        response = requests.put(f"{BASE_URL}/api/url/{url_id}", json=kwargs, timeout=10)
        result = safe_json_response(response)
        print("更新结果:", json.dumps(result, indent=2, ensure_ascii=False))
        return result
    except Exception as e:
        print(f"❌ 更新URL错误: {e}")
        return None

def batch_create_urls(config_id, urls_data):
    """批量创建URL"""
    try:
        print(f"\n=== 批量创建URL到配置{config_id} ===")
        data = {"urls": urls_data}
        print("批量数据:", json.dumps(data, indent=2, ensure_ascii=False))

        response = requests.post(f"{BASE_URL}/api/config/{config_id}/urls/batch", json=data, timeout=10)
        result = safe_json_response(response)
        print("批量创建结果:", json.dumps(result, indent=2, ensure_ascii=False))
        return result
    except Exception as e:
        print(f"❌ 批量创建URL错误: {e}")
        return None

def test_url_execution(url_id):
    """测试URL执行"""
    try:
        print(f"\n=== 执行URL ID: {url_id} ===")
        response = requests.post(f"{BASE_URL}/api/url/{url_id}/execute", timeout=10)
        result = safe_json_response(response)
        print("执行结果:", json.dumps(result, indent=2, ensure_ascii=False))
        return result
    except Exception as e:
        print(f"❌ 执行URL错误: {e}")
        return None

def main():
    """主测试函数"""
    print("🚀 开始测试Flask Message Manager API")
    print("=" * 60)

    # 1. 测试服务器连接
    if not test_server_connection():
        print("\n❌ 服务器连接失败，请检查:")
        print("1. Flask应用是否在运行？")
        print("2. 端口5000是否正确？")
        print("3. 防火墙是否阻止连接？")
        return

    # 2. 获取配置信息
    config_info = get_config_info()
    if not config_info or 'error' in config_info:
        print("⚠️  获取配置信息失败，但继续测试...")

    # 3. 获取现有URL
    existing_urls = get_existing_urls(1)
    if existing_urls and 'urls' in existing_urls:
        print(f"✅ 找到 {len(existing_urls['urls'])} 个现有URL")

    # 4. 创建单个URL
    create_result = create_url(
        config_id=1,
        url="https://t.me/testchannel_new",
        name="测试频道_新",
        duration=45,
        max_num=5
    )

    created_url_id = None
    if create_result and 'url_data' in create_result:
        created_url_id = create_result['url_data']['id']
        print(f"✅ 成功创建URL，ID: {created_url_id}")

    # 5. 批量创建URL
    urls_to_create = [
        {
            "url": "https://t.me/batch_test_1",
            "name": "批量测试1",
            "duration": 30,
            "max_num": 3
        },
        {
            "url": "https://t.me/batch_test_2",
            "name": "批量测试2",
            "duration": 60,
            "max_num": 4
        }
    ]

    batch_result = batch_create_urls(1, urls_to_create)
    if batch_result and 'created' in batch_result:
        print(f"✅ 批量创建成功: {batch_result['created']}")

    # 6. 更新URL
    if created_url_id:
        update_result = update_url(
            created_url_id,
            name="更新后的测试频道",
            max_num=10,
            duration=90
        )
        if update_result and 'message' in update_result:
            print("✅ 更新URL成功")

    # 7. 测试URL执行
    if created_url_id:
        execution_result = test_url_execution(created_url_id)
        if execution_result and 'message' in execution_result:
            print("✅ URL执行成功")

    # 8. 获取更新后的URL列表
    print("\n=== 最终URL列表 ===")
    final_urls = get_existing_urls(1)
    if final_urls and 'urls' in final_urls:
        print(f"✅ 最终共有 {len(final_urls['urls'])} 个URL")
        for url in final_urls['urls']:
            print(f"  - {url['name']}: {url['url']} (执行次数: {url['current_count']}/{url['max_num']})")

    print("\n🎉 测试完成！")

if __name__ == "__main__":
    main()