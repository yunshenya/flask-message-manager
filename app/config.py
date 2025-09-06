import os
from dotenv import load_dotenv

basedir = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(basedir, '..', '.env'))

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or '1234567'
    DATABASE_URL = os.environ.get('DATABASE_URL') or \
                   'postgresql://postgres:1332@localhost:5432/postgres'
    SQLALCHEMY_DATABASE_URI = DATABASE_URL
    SQLALCHEMY_TRACK_MODIFICATIONS_str = os.getenv('SQLALCHEMY_TRACK_MODIFICATIONS')
    SQLALCHEMY_TRACK_MODIFICATIONS = SQLALCHEMY_TRACK_MODIFICATIONS_str.lower() == 'true' if SQLALCHEMY_TRACK_MODIFICATIONS_str else False
    PKG_NAME = os.environ.get('PKG_NAME')
    TG_PKG_NAME = os.environ.get('TG_PKG_NAME')
    API_SECRET_TOKEN=os.getenv("API_SECRET_TOKEN")
    DEBUG_str = os.getenv('DEBUG')
    DEBUG = DEBUG_str.lower() == 'true' if DEBUG_str else False