import os
from dotenv import load_dotenv

basedir = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(basedir, '..', '.env'))

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or '1234567'
    DATABASE_URL = os.environ.get('DATABASE_URL') or \
                   'postgresql://postgres:1332@localhost:5432/postgres'
    SQLALCHEMY_DATABASE_URI = DATABASE_URL
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    PKG_NAME = 'com.a8jbctzav.cj02cuuma'
    TG_PKG_NAME = 'org.telegram.messenger.web'