# chat_api/urls.py
from django.urls import path, include
from rest_framework_nested import routers # İç içe URL'ler için nested router
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)
from .views import (
    RegisterView,
    UserDetailView,
    UserPublicKeyView,
    ChatViewSet,
    MessageViewSet,
)

# Ana router
router = routers.DefaultRouter()
router.register(r'chats', ChatViewSet, basename='chat')
# router.register(r'messages', MessageViewSet, basename='message') # Mesajlar chat'e bağlı olacak

# Chat'lere bağlı mesajlar için nested router
# /api/chats/{chat_pk}/messages/
chats_router = routers.NestedDefaultRouter(router, r'chats', lookup='chat')
chats_router.register(r'messages', MessageViewSet, basename='chat-messages')


urlpatterns = [
    # Auth
    path('register/', RegisterView.as_view(), name='register'),
    path('login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('login/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # User
    path('user/me/', UserDetailView.as_view(), name='user-detail'),
     # Public Key Endpoint'leri
     # Kendi anahtarını güncellemek için (PUT/PATCH)
     path('user/public_key/', UserPublicKeyView.as_view(), name='user-public-key-update'), # PUT/PATCH
     # Başkasının anahtarını almak için (GET)
     path('users/<int:user_id>/public_key/', UserPublicKeyView.as_view(), name='user-public-key-retrieve'), # GET

     # Chats and Nested Messages
     path('', include(router.urls)),
     path('', include(chats_router.urls)),

     # Message Actions (Doğrudan mesaj ID'si üzerinden, nested değil)
     # path('messages/<int:pk>/react/', MessageViewSet.as_view({'post': 'react'}), name='message-react'),
     # path('messages/<int:pk>/read/', MessageViewSet.as_view({'post': 'mark_as_read'}), name='message-read'),
     # Not: Nested router'daki action'lar daha standart: /api/chats/{chat_pk}/messages/{message_pk}/react/
]