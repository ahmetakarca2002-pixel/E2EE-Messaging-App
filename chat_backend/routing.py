# /routing.py (Proje ana dizininde)
from django.urls import re_path
# consumers modülünü doğru yerden import edin
import consumers # Eğer consumers.py proje ana dizinindeyse

websocket_urlpatterns = [
    # Desen: ws/chat/<sayisal_chat_id>/
    re_path(r'ws/chat/(?P<chat_id>\d+)/$', consumers.ChatConsumer.as_asgi()),
    # Başka websocket desenleriniz varsa buraya ekleyebilirsiniz
]