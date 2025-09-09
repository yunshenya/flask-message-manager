from app import Config

if __name__ == '__main__':
    config = Config.reset_time
    print(int(config) + 1)