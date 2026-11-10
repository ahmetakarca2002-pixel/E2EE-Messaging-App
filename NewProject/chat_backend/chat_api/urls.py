# chat_api/urls.py

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .views import (
    RegisterView,
    CurrentUserView,
    ChatRoomViewSet,
    TranscribeAudioView,
    ReactToMessageView,
    fetch_and_download_song,
    CurrentUserPublicKeyUpdateView,
    UserPublicKeyView,
)

router = DefaultRouter()
router.register(r'chats', ChatRoomViewSet, basename='chatroom')

urlpatterns = [
    # Authentication
    path('register/', RegisterView.as_view(), name='register'),
    path('login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('login/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # Current user
    path('users/me/', CurrentUserView.as_view(), name='current_user'),

    # Chat rooms and messages
    path('', include(router.urls)),  # /api/chats/ ve /api/chats/<pk>/messages/ (@action)

    # Message-related actions
    path(
        'messages/<int:message_id>/transcribe/',
        TranscribeAudioView.as_view(),
        name='transcribe-message'
    ),
    path(
        'messages/<int:message_id>/react/',
        ReactToMessageView.as_view(),
        name='react-to-message'
    ),

    # Music lookup & download
    path(
        'download-song/',
        fetch_and_download_song,
        name='download-song'
    ),
    # --- YENİ: Mevcut kullanıcının genel anahtarını güncelleme ---
    path('users/me/public_key/', CurrentUserPublicKeyUpdateView.as_view(), name='current_user_public_key_update'),
    # ----------------------------------------------------------

    # --- YENİ: Başka bir kullanıcının genel anahtarını alma ---
    # Dikkat: user_id integer olmalı
    path('users/<int:user_id>/public_key/', UserPublicKeyView.as_view(), name='user_public_key'),
    # ------------------------------------------------------

]
