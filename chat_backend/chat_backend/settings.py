# chat_project/settings.py

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Üçüncü parti uygulamalar
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    # Kendi uygulamamız
    'chat_api',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware', # CORS middleware'ı MÜMKÜNSE en başa yakın olmalı
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'chat_project.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'chat_project.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

AUTH_PASSWORD_VALIDATORS = [
    # ... (varsayılanları koruyun)
]

# --- REST Framework Ayarları ---
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticatedOrReadOnly', # Varsayılan olarak okuma izni, yazma için login
    ),
     'DEFAULT_PARSER_CLASSES': ( # Dosya yükleme için MultiPartParser ekleyin
         'rest_framework.parsers.JSONParser',
         'rest_framework.parsers.FormParser',
         'rest_framework.parsers.MultiPartParser',
     ),
}

# --- Simple JWT Ayarları ---
from datetime import timedelta

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60), # Örnek: Erişim tokenı 1 saat geçerli
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),   # Örnek: Yenileme tokenı 7 gün geçerli
    'ROTATE_REFRESH_TOKENS': True, # Yenileme tokenını kullandıkça yenisi verilir
    'BLACKLIST_AFTER_ROTATION': True, # Eski yenileme tokenını karalisteye al
    # ... diğer ayarlar ...
}

# --- CORS Ayarları ---
# Ngrok adresinizi ve localhost'u buraya ekleyin
# Ngrok adresi her değiştiğinde güncelleyin!
CORS_ALLOWED_ORIGINS = [
    "http://localhost:8081", # Expo Go'nun varsayılan web portu
    "http://localhost:19006", # React Native Web için başka bir olası port
    "https://YOUR_NGROK_SUBDOMAIN.ngrok-free.app", # Ngrok adresiniz (https)
    # Geliştirme için ekleyebilirsiniz:
    # "http://127.0.0.1:8000",
    # "http://localhost:8000",
]
# Ngrok adresini buraya da eklemek GÜVENLİK için önemlidir
CSRF_TRUSTED_ORIGINS = [
    "https://YOUR_NGROK_SUBDOMAIN.ngrok-free.app",
     # "http://localhost:8081", # CSRF genellikle API'ler için daha az kritiktir, ancak ekleyebilirsiniz
     # "http://localhost:19006",
]
# İzin verilen başlıkları (headers) kontrol edin, gerekirse ekleyin
# CORS_ALLOW_HEADERS = list(default_headers) + ['my-custom-header']

LANGUAGE_CODE = 'tr-tr' # Türkçe ayarları
TIME_ZONE = 'Europe/Istanbul'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
# --- Medya Dosyaları Ayarları ---
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# --- Özel User Modeli Kullanmıyorsanız ---
# AUTH_USER_MODEL = 'chat_api.CustomUser' # Özel User modeli kullanıyorsanız aktif edin

# E-posta ayarları (şifre sıfırlama vb. için gerekirse)
# EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend' # Test için konsola yazar