# /chat_backend/asgi.py
import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack # Kimlik doğrulama için önemli
from channels.security.websocket import AllowedHostsOriginValidator # Güvenlik için

# routing.py dosyasının konumuna göre import yolunu ayarlayın:
# Eğer routing.py proje ana dizinindeyse:
import routing
# Eğer routing.py chat_api uygulamasındaysa:
# import chat_api.routing

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'chat_backend.settings')

# HTTP için normal Django uygulamasını al
django_asgi_app = get_asgi_application()

application = ProtocolTypeRouter({
    # Django'nun normal HTTP isteklerini işlemesi için:
    "http": django_asgi_app,

    # WebSocket bağlantılarını işlemesi için:
    "websocket": AllowedHostsOriginValidator( # Güvenlik katmanı
        AuthMiddlewareStack( # Kimlik doğrulama katmanı (scope.user'ı doldurur)
            URLRouter(
                # routing.py dosyanızın yoluna göre doğru değişkeni kullanın:
                routing.websocket_urlpatterns # Eğer routing.py proje ana dizinindeyse
                # chat_api.routing.websocket_urlpatterns # Eğer chat_api uygulamasındaysa
            )
        )
    ),
})