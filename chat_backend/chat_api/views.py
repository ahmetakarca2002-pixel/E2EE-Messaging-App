# chat_api/views.py
from django.shortcuts import get_object_or_404
from django.contrib.auth.models import User
from django.db.models import Q, Count
from rest_framework import generics, viewsets, status, permissions
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import Chat, Message, UserProfile
from .serializers import (
    RegisterSerializer, UserSerializer, PublicKeySerializer,
    ChatListSerializer, ChatDetailSerializer, ChatCreateSerializer,
    MessageSerializer
)

# --- Authentication Views ---

class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    permission_classes = (permissions.AllowAny,) # Kayıt için izin gerekmez
    serializer_class = RegisterSerializer

# simplejwt'nin view'ını kullanıyoruz, isterseniz özelleştirebilirsiniz.
# class CustomTokenObtainPairView(TokenObtainPairView):
#     # Gerekirse token'a ekstra veri ekleyebilirsiniz
#     pass

# --- User Views ---

class UserDetailView(generics.RetrieveAPIView):
    """Mevcut giriş yapmış kullanıcı detaylarını döndürür."""
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user

class UserPublicKeyView(generics.RetrieveUpdateAPIView):
    """
    GET: Belirtilen kullanıcının public key'ini döndürür.
    PUT/PATCH: Giriş yapmış kullanıcının public key'ini günceller.
    """
    serializer_class = PublicKeySerializer
    permission_classes = [permissions.IsAuthenticated] # Anahtar görmek/güncellemek için login gerekli

    def get_object(self):
        # GET isteği için: URL'den gelen user_id'ye göre kullanıcının profilini bul
        if self.request.method == 'GET':
            user_id = self.kwargs.get('user_id')
            target_user = get_object_or_404(User, pk=user_id)
            # Kullanıcının profilini veya 404 döndür (veya boş profil döndür?)
            profile = get_object_or_404(UserProfile, user=target_user)
            # Sadece public_key_jwk döndürmek için serializer'ı burada filtreleyebiliriz
            # Veya serializer sadece bu alanı döndürecek şekilde ayarlanabilir.
            # Bu implementasyonda serializer tüm profil fields'ını döndürecek.
            # Frontend sadece public_key_jwk'yı kullanmalı.
            # NOT: PublicKeySerializer sadece yazma için tasarlandı, okuma için UserProfileSerializer daha uygun.
            # Ama frontend tek endpoint bekliyorsa, GET için manuel response oluşturabiliriz.
            # return profile
            # Manuel response:
            return profile # Serializer halleder diye umalım veya get/put ayıralım.

        # PUT/PATCH isteği için: Giriş yapmış kullanıcının profilini al
        elif self.request.method in ['PUT', 'PATCH']:
             profile, _ = UserProfile.objects.get_or_create(user=self.request.user)
             return profile

        return None # Hata durumu

    def retrieve(self, request, *args, **kwargs):
        # GET isteğinde sadece public key'i döndürmek için özelleştirme
        user_id = self.kwargs.get('user_id')
        target_user = get_object_or_404(User, pk=user_id)
        profile = get_object_or_404(UserProfile, user=target_user)
        return Response({'public_key_jwk': profile.public_key_jwk}, status=status.HTTP_200_OK)


    def update(self, request, *args, **kwargs):
        # PUT/PATCH isteğinde sadece public key'i güncelle
        # user_id URL'de olsa bile GÜNCELLEME sadece mevcut kullanıcı için yapılır.
        profile = get_object_or_404(UserProfile, user=request.user)
        serializer = self.get_serializer(data=request.data) # Partial=True PATCH için
        serializer.is_valid(raise_exception=True)
        jwk_data = serializer.validated_data['public_key_jwk']

        # Gelen JWK verisini string'e çevirerek saklayalım (veya JSONField olarak bırakalım)
        import json
        profile.public_key_jwk = json.dumps(jwk_data) if isinstance(jwk_data, dict) else jwk_data
        profile.save()

        # Güncellenmiş public key'i (veya başarı mesajını) döndür
        return Response({'public_key_jwk': profile.public_key_jwk}, status=status.HTTP_200_OK)


# --- Chat ViewSet ---

class ChatViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Kullanıcının dahil olduğu sohbetleri listele
        user = self.request.user
        return Chat.objects.filter(participants=user).prefetch_related('participants', 'messages').order_by('-messages__timestamp')
        # Son mesaja göre sıralamak için daha karmaşık anotasyon gerekebilir:
        # from django.db.models import Max, OuterRef, Subquery
        # latest_message_time = Message.objects.filter(chat=OuterRef('pk')).order_by('-timestamp')
        # return Chat.objects.filter(participants=user).annotate(
        #     last_message_ts=Subquery(latest_message_time.values('timestamp')[:1])
        # ).order_by('-last_message_ts').prefetch_related('participants')


    def get_serializer_class(self):
        if self.action == 'list':
            return ChatListSerializer
        if self.action == 'retrieve':
            return ChatDetailSerializer # Veya ChatListSerializer yeterliyse o
        if self.action == 'create':
             return ChatCreateSerializer
        return ChatDetailSerializer # Varsayılan

    def get_serializer_context(self):
        # Serializer'a request objesini gönderelim (örneğin unread_count için)
        context = super().get_serializer_context()
        context.update({"request": self.request})
        return context

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        # Validasyon sırasında var olan sohbet bulunduysa onu döndür
        if hasattr(serializer, 'instance') and serializer.instance:
             # Var olan sohbeti göstermek için Detail/List serializer kullanalım
             detail_serializer = ChatListSerializer(serializer.instance, context=self.get_serializer_context())
             return Response(detail_serializer.data, status=status.HTTP_200_OK) # Var olan sohbeti döndür (200 OK)

        # Yeni sohbet oluştur
        participants_to_add = serializer.context['participants_to_add']
        chat = Chat.objects.create()
        chat.participants.add(request.user) # Kendini ekle
        chat.participants.add(*participants_to_add) # Diğerlerini ekle
        chat.save() # Kaydet

        # Oluşturulan sohbeti göstermek için Detail/List serializer kullanalım
        detail_serializer = ChatListSerializer(chat, context=self.get_serializer_context())
        return Response(detail_serializer.data, status=status.HTTP_201_CREATED) # Yeni oluşturuldu (201 Created)

    # retrieve, update, partial_update, destroy metodları varsayılan olarak kalabilir
    # veya sadece belirli katılımcıların erişebilmesi için özelleştirilebilir.
    def check_object_permissions(self, request, obj):
         # Sadece katılımcıların sohbet detaylarını görmesine/silmesine izin ver
         super().check_object_permissions(request, obj)
         if request.user not in obj.participants.all():
             self.permission_denied(request, message='You do not have permission to access this chat.')

# --- Message ViewSet ---

# ViewSet yerine APIView kullanmak da bir seçenek, özellikle iç içe URL'ler için.
# Ama ViewSet'in standart action'ları (list, create) işimizi kolaylaştırır.
class MessageViewSet(viewsets.ModelViewSet):
    serializer_class = MessageSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # URL'den chat_id'yi al
        chat_id = self.kwargs.get('chat_pk')
        # İlgili sohbeti bul ve kullanıcının katılımcı olup olmadığını kontrol et
        chat = get_object_or_404(Chat, pk=chat_id)
        if self.request.user not in chat.participants.all():
             # Eğer kullanıcı katılımcı değilse boş queryset döndür veya hata ver
             # raise PermissionDenied("You cannot view messages for this chat.")
             return Message.objects.none()

        # Sohbetin mesajlarını zaman damgasına göre tersten sıralı getir (en yeni en üstte)
        return Message.objects.filter(chat=chat).order_by('-timestamp').select_related('sender', 'reply_to', 'reply_to__sender')

    def perform_create(self, serializer):
         # Mesajı oluştururken göndereni ve sohbeti otomatik olarak ayarla
        chat_id = self.kwargs.get('chat_pk')
        chat = get_object_or_404(Chat, pk=chat_id)
        # Kullanıcının bu sohbete mesaj gönderme izni var mı? (Katılımcı mı?)
        if self.request.user not in chat.participants.all():
            # raise PermissionDenied("You cannot send messages to this chat.") # Hata fırlatmak daha doğru
             # Veya serializer'da hata verilebilir
             return Response({"detail": "You cannot send messages to this chat."}, status=status.HTTP_403_FORBIDDEN)

        # Dosya yükleniyorsa, file_type'ı kontrol et
        file = self.request.FILES.get('file')
        file_type = serializer.validated_data.get('file_type')

        if file and not file_type:
             # Eğer dosya var ama tip belirtilmemişse, tahmin etmeye çalış (basitçe)
             # veya hata ver. Şimdilik hata verelim.
             # TODO: MIME type'dan tahmin eklenebilir.
             raise serializers.ValidationError({"file_type": "File type must be specified when uploading a file."})


        serializer.save(sender=self.request.user, chat=chat)


    # --- Tepki Ekleme/Kaldırma Action'ı ---
    @action(detail=True, methods=['post'], url_path='react')
    def react(self, request, pk=None, chat_pk=None):
        message = self.get_object() # Mesajı bul (pk=message_id)
        emoji = request.data.get('emoji')

        if not emoji:
            return Response({"detail": "Emoji is required."}, status=status.HTTP_400_BAD_REQUEST)

        # Kullanıcı bu mesaja erişebilir mi? (Sohbete dahil mi?)
        if request.user not in message.chat.participants.all():
             return Response({"detail": "You cannot react to this message."}, status=status.HTTP_403_FORBIDDEN)

        action_taken = message.update_reaction(request.user.id, emoji)

        # Güncellenmiş mesajı veya sadece başarı durumunu döndür
        serializer = self.get_serializer(message)
        return Response({
             "detail": f"Reaction {action_taken}.",
             "reactions": serializer.data.get('reactions', {}) # Sadece reaksiyonları döndür
             # "message": serializer.data # Veya tüm mesajı döndür
         }, status=status.HTTP_200_OK)


    # --- Okundu Bilgisi Action'ı ---
    @action(detail=True, methods=['post'], url_path='read')
    def mark_as_read(self, request, pk=None, chat_pk=None):
         message = self.get_object()

         # Kullanıcı bu mesaja erişebilir mi?
         if request.user not in message.chat.participants.all():
             return Response({"detail": "You cannot mark this message as read."}, status=status.HTTP_403_FORBIDDEN)

         # Kendisinin gönderdiği mesajı okundu işaretlemez (genellikle)
         # if message.sender == request.user:
         #     return Response({"detail": "Cannot mark own message as read."}, status=status.HTTP_400_BAD_REQUEST)

         marked = message.mark_as_read(request.user.id)

         if marked:
             return Response({"detail": "Message marked as read."}, status=status.HTTP_200_OK)
         else:
             # Zaten okunmuşsa 200 OK veya 304 Not Modified döndürülebilir.
             return Response({"detail": "Message was already marked as read."}, status=status.HTTP_200_OK)


    # list, retrieve, destroy metodları varsayılan olarak kalabilir
    # veya sadece gönderenin mesajı silebilmesi gibi kurallar eklenebilir.
    def check_object_permissions(self, request, obj):
         # Sadece katılımcıların mesajları görmesine izin ver
         super().check_object_permissions(request, obj)
         if request.user not in obj.chat.participants.all():
             self.permission_denied(request, message='You do not have permission to access this message.')

    # def perform_destroy(self, instance):
    #     # Sadece mesajı gönderen silebilir kuralı
    #     if self.request.user != instance.sender:
    #         raise PermissionDenied("You cannot delete this message.")
    #     instance.delete()