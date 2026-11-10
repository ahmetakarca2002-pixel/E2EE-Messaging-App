# chat_api/views.py

import os
import speech_recognition as sr
from pydub import AudioSegment
from django.conf import settings
from django.contrib.auth.models import User
from django.db.models import Count # Count'ı import etmeyi unutmuş olabiliriz

from rest_framework import generics, viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated # Explicit import

from .models import ChatRoom, Message
from .serializers import (
    RegisterSerializer, UserSerializer, ChatRoomSerializer, MessageSerializer
)

# --- Logging Ekleyelim ---
import logging
logger = logging.getLogger(__name__)
# -------------------------

# --- Geçici Ses Dosyaları İçin Ayar ---
TEMP_DIR = os.path.join(settings.MEDIA_ROOT, 'temp_audio')
os.makedirs(TEMP_DIR, exist_ok=True)
# ------------------------------------

# --- Mevcut View'larınız ---

import logging
logger = logging.getLogger(__name__)
from .models import ChatRoom, Message, Profile, User # Profile ve User import edildi
from .serializers import (
    RegisterSerializer, UserSerializer, ChatRoomSerializer, MessageSerializer, ProfileSerializer # ProfileSerializer eklendi
)
from rest_framework import generics, viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
# ... (diğer importlar) ...

# ... (RegisterView, CurrentUserView aynı kalabilir) ...
class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    permission_classes = (permissions.AllowAny,)
    serializer_class = RegisterSerializer

class CurrentUserView(generics.RetrieveAPIView):
    serializer_class = UserSerializer # Artık public_key içerecek
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        # Profile nesnesini de çekmek için select_related kullanılabilir
        return User.objects.select_related('profile').get(pk=self.request.user.pk)


class ChatRoomViewSet(viewsets.ModelViewSet):
    serializer_class = ChatRoomSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Katılımcıların profillerini de çekelim (public_key için)
        return self.request.user.chat_rooms.all().prefetch_related(
            'participants__profile', 'messages__sender__profile' # profile eklendi
        ).annotate(
            # last_message_time=Max('messages__timestamp') # Max importu gerekli
        ).order_by('-created_at') # Veya last_message'a göre sıralama

    # ... (create metodu büyük ölçüde aynı kalabilir, serializer hallediyor) ...
    def create(self, request, *args, **kwargs):
        # Mevcut create kodunuz büyük ihtimalle çalışır.
        # Serializer içinde katılımcı bulma ve mevcut oda kontrolü yapılıyor.
        # Hata mesajlarını iyileştirmek isterseniz burayı güncelleyebilirsiniz.
        serializer = self.get_serializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
            instance = serializer.save() # Serializer.create çağrılır
            # Belki farklı status kodları döndürmek isterseniz (yeni/mevcut)
            headers = self.get_success_headers(serializer.data)
            # Eğer instance yeni oluşturulduysa 201, mevcutsa 200 dönebiliriz
            # Şimdilik hep 201 varsayalım veya serializer'dan bir bilgi alalım
            return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

        except serializers.ValidationError as e:
             logger.warning(f"Oda oluşturma hatası: {e.detail}")
             return Response(e.detail, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
             logger.exception(f"Oda oluşturma sırasında beklenmedik hata: {e}")
             return Response({"detail": "Sohbet odası oluşturulurken bir sunucu hatası oluştu."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


    @action(detail=True, methods=['get', 'post'], serializer_class=MessageSerializer, parser_classes=[MultiPartParser, FormParser, JSONParser])
    def messages(self, request, pk=None):
        try:
            chat_room = self.get_object()
        except Exception as e:
             logger.warning(f"Mesaj listeleme/oluşturma: Oda erişim hatası (ID: {pk}). Hata: {e}")
             return Response({"detail": "Sohbet odası bulunamadı veya erişim izniniz yok."}, status=status.HTTP_404_NOT_FOUND)

        if request.method == 'GET':
            # Mesajları çekerken gönderenlerin profillerini de çekelim
            messages = chat_room.messages.order_by('-timestamp').select_related('sender__profile') # profile eklendi
            # Sayfalama eklemek iyi olabilir (pagination)
            serializer = self.get_serializer(messages, many=True, context={'request': request})
            return Response(serializer.data)

        elif request.method == 'POST':
            # --- DEĞİŞİKLİK: Gelen 'text' alanı artık şifreli ---
            serializer = self.get_serializer(data=request.data, context={'request': request})
            if serializer.is_valid():
                text_content = serializer.validated_data.get('text') # Bu şifreli metin
                file_content = serializer.validated_data.get('file')
                # Frontend 'file_type' olarak 'encrypted_text' gönderebilir
                client_file_type = serializer.validated_data.get('file_type')

                # İçerik kontrolü (en az biri olmalı)
                if not text_content and not file_content:
                    return Response({'detail': 'Metin (şifreli) veya dosya içeriği gerekli.'}, status=status.HTTP_400_BAD_REQUEST)

                # File type belirleme (dosya varsa öncelikli)
                determined_file_type = 'text' # Varsayılan (şifreli metin için)
                if file_content:
                    # Dosya tipini belirleme logic'i (mevcut kodunuzdaki gibi)
                     content_type = getattr(file_content, 'content_type', None)
                     if content_type:
                         if content_type.startswith('audio/'): determined_file_type = 'audio'
                         elif content_type.startswith('image/'): determined_file_type = 'image'
                         elif content_type.startswith('video/'): determined_file_type = 'video'
                         else: determined_file_type = 'file'
                     else: # Fallback
                         try:
                             ext = os.path.splitext(file_content.name)[1].lower()
                             if ext in ['.mp3', '.wav', '.m4a', '.ogg', '.aac', '.opus']: determined_file_type = 'audio'
                             elif ext in ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp']: determined_file_type = 'image'
                             elif ext in ['.mp4', '.mov', '.avi', '.mkv']: determined_file_type = 'video'
                             else: determined_file_type = 'file'
                         except Exception: determined_file_type = 'file'
                elif text_content:
                     # Eğer sadece şifreli metin varsa ve client özel tip gönderdiyse onu kullan
                     determined_file_type = client_file_type if client_file_type == 'encrypted_text' else 'text'
                     # Veya her zaman 'encrypted_text' olarak kaydedebilirsiniz:
                     # determined_file_type = 'encrypted_text'


                try:
                    # Mesajı kaydet (text alanı şifreli olarak kaydedilecek)
                    instance = serializer.save(
                        sender=request.user,
                        chat_room=chat_room,
                        file_type=determined_file_type # Belirlenen veya istemciden gelen tip
                    )
                    logger.info(f"Mesaj oluşturma: Yeni mesaj kaydedildi (ID: {instance.id}, Chat {pk}, Type: {determined_file_type}).")

                    # --- WebSocket Bildirimi ---
                    # Bildirimde gidecek mesaj verisi de artık şifreli 'text' içerecek
                    # consumers.py'daki serialize_message şifreli text'i gönderecek
                    try:
                        from channels.layers import get_channel_layer
                        from asgiref.sync import async_to_sync
                        import json
                        from consumers import serialize_message_sync # Helper import

                        channel_layer = get_channel_layer()
                        room_group_name = f"chat_{chat_room.id}"

                        # Mesajı WebSocket için serialize et (sync helper ile)
                        # Bu serializer context'e request eklemeli (file_url için)
                        serialized_data = serialize_message_sync(instance, request=request)


                        async_to_sync(channel_layer.group_send)(
                            room_group_name,
                            {
                                'type': 'chat_message_broadcast',
                                'message': serialized_data
                            }
                        )
                        logger.info(f"Mesaj {instance.id} WebSocket üzerinden yayınlandı (Chat {pk}).")
                    except Exception as ws_err:
                        logger.error(f"Mesaj {instance.id} için WebSocket yayını hatası: {ws_err}")
                    # ---------------------------

                    # Dönen yanıt da şifreli text içerecek
                    return Response(serializer.data, status=status.HTTP_201_CREATED)
                except Exception as e:
                    logger.exception(f"Mesaj oluşturma: Mesaj kaydedilirken hata oluştu (Chat {pk}): {e}")
                    return Response({'detail': 'Mesaj kaydedilirken bir sunucu hatası oluştu.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            else:
                logger.warning(f"Mesaj oluşturma: Serializer hataları (Chat {pk}): {serializer.errors}")
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

# ... (TranscribeAudioView, ReactToMessageView, fetch_and_download_song aynı kalabilir) ...
# Not: TranscribeAudioView ses dosyası üzerinde çalışır, text ile işi yok.
# ReactToMessageView tepkiler üzerinde çalışır, text ile işi yok.
# fetch_and_download_song ayrı bir özellik.
# Bunlar şimdilik E2EE'den etkilenmez.

# Sohbet Odası ViewSet'i
class ChatRoomViewSet(viewsets.ModelViewSet):
    serializer_class = ChatRoomSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return self.request.user.chat_rooms.all().prefetch_related(
            'participants', 'messages__sender'
        ).annotate(
             # last_message_time=Max('messages__timestamp') # Gerekirse Max importu yapılmalı
         ).order_by('-created_at')

    def create(self, request, *args, **kwargs):
        current_user = request.user
        participant_emails = request.data.get('participant_emails', [])

        if not participant_emails or not isinstance(participant_emails, list):
            return Response({'detail': 'Katılımcı e-posta listesi (participant_emails) gerekli.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            other_participants = User.objects.filter(email__in=participant_emails).exclude(pk=current_user.pk).distinct()
            found_emails = {user.email for user in other_participants}
            missing_emails = set(participant_emails) - found_emails
            if current_user.email in missing_emails:
                 missing_emails.remove(current_user.email)

            if missing_emails:
                 logger.warning(f"Oda oluşturma: Bulunamayan e-postalar: {missing_emails}")
                 return Response({'participant_emails': f"Şu e-posta adresleri bulunamadı: {', '.join(missing_emails)}"}, status=status.HTTP_400_BAD_REQUEST)
            if not other_participants.exists():
                 logger.warning(f"Oda oluşturma: Geçerli katılımcı eklenmedi (sadece {current_user.email}).")
                 return Response({'participant_emails': 'Kendiniz dışında en az bir geçerli katılımcı eklemelisiniz.'}, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            logger.exception(f"Oda oluşturma: Katılımcı bulma hatası: {e}")
            return Response({'detail': "Katılımcılar işlenirken bir hata oluştu."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        all_participants_set = set(list(other_participants) + [current_user])
        participant_ids = {user.id for user in all_participants_set}
        participant_count = len(all_participants_set)

        existing_rooms = ChatRoom.objects.annotate(
            num_participants=Count('participants')
        ).filter(
            num_participants=participant_count
        )
        for room in existing_rooms:
             room_participant_ids = set(room.participants.values_list('id', flat=True))
             if room_participant_ids == participant_ids:
                 logger.info(f"Oda oluşturma: Mevcut oda bulundu ({room.id}) katılımcılar: {participant_ids}")
                 serializer = self.get_serializer(room, context={'request': request})
                 return Response(serializer.data, status=status.HTTP_200_OK)

        try:
            new_room = ChatRoom.objects.create()
            new_room.participants.set(list(all_participants_set))
            logger.info(f"Oda oluşturma: Yeni oda oluşturuldu ({new_room.id}) katılımcılar: {participant_ids}")
            serializer = self.get_serializer(new_room, context={'request': request})
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except Exception as e:
             logger.exception(f"Oda oluşturma: Yeni oda kaydedilirken hata: {e}")
             return Response({'detail': "Sohbet odası oluşturulurken bir hata oluştu."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['get', 'post'], serializer_class=MessageSerializer, parser_classes=[MultiPartParser, FormParser, JSONParser])
    def messages(self, request, pk=None):
        try:
            chat_room = self.get_object()
        except Exception as e:
             logger.warning(f"Mesaj listeleme/oluşturma: Oda erişim hatası (ID: {pk}). Hata: {e}")
             return Response({"detail": "Sohbet odası bulunamadı veya erişim izniniz yok."}, status=status.HTTP_404_NOT_FOUND)

        if request.method == 'GET':
            messages = chat_room.messages.order_by('-timestamp').select_related('sender')
            serializer = self.get_serializer(messages, many=True, context={'request': request})
            return Response(serializer.data)

        elif request.method == 'POST':
            serializer = self.get_serializer(data=request.data, context={'request': request})
            # logger.debug(f"Gelen Mesaj Verisi (Chat {pk}): {request.data}") # Detaylı log

            if serializer.is_valid():
                text_content = serializer.validated_data.get('text')
                file_content = serializer.validated_data.get('file')

                if not text_content and not file_content:
                    logger.warning(f"Mesaj oluşturma: Metin veya dosya içeriği yok (Chat {pk}).")
                    return Response({'detail': 'Metin veya dosya içeriği gerekli.'}, status=status.HTTP_400_BAD_REQUEST)

                determined_file_type = None
                if file_content:
                    content_type = getattr(file_content, 'content_type', None)
                    if content_type:
                        if content_type.startswith('audio/'): determined_file_type = 'audio'
                        elif content_type.startswith('image/'): determined_file_type = 'image'
                        elif content_type.startswith('video/'): determined_file_type = 'video'
                        else: determined_file_type = 'file'
                    else:
                        try:
                            ext = os.path.splitext(file_content.name)[1].lower()
                            if ext in ['.mp3', '.wav', '.m4a', '.ogg', '.aac', '.opus']: determined_file_type = 'audio'
                            elif ext in ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp']: determined_file_type = 'image'
                            else: determined_file_type = 'file'
                        except Exception: determined_file_type = 'file'
                elif text_content:
                    determined_file_type = 'text'

                # logger.debug(f"Belirlenen file_type (Chat {pk}): {determined_file_type}")

                try:
                    instance = serializer.save(
                        sender=request.user,
                        chat_room=chat_room,
                        file_type=determined_file_type
                    )
                    logger.info(f"Mesaj oluşturma: Yeni mesaj kaydedildi (ID: {instance.id}, Chat {pk}).")
                    # --- WebSocket Bildirimi (Eğer kullanılıyorsa) ---
                    # try:
                    #     from channels.layers import get_channel_layer
                    #     from asgiref.sync import async_to_sync
                    #     import json
                    #     channel_layer = get_channel_layer()
                    #     room_group_name = f"chat_{chat_room.id}"
                    #     # Serializer'dan alınan veriyi gönder
                    #     async_to_sync(channel_layer.group_send)(
                    #         room_group_name,
                    #         {
                    #             'type': 'chat_message_broadcast', # consumers.py'deki handler adı
                    #             'message': serializer.data # Serializer'ın çıktısını kullan
                    #         }
                    #     )
                    #     logger.info(f"Mesaj {instance.id} WebSocket üzerinden yayınlandı (Chat {pk}).")
                    # except Exception as ws_err:
                    #     logger.error(f"Mesaj {instance.id} için WebSocket yayını hatası: {ws_err}")
                    # -------------------------------------------------

                    return Response(serializer.data, status=status.HTTP_201_CREATED)
                except Exception as e:
                    logger.exception(f"Mesaj oluşturma: Mesaj kaydedilirken hata oluştu (Chat {pk}): {e}")
                    return Response({'detail': 'Mesaj kaydedilirken bir sunucu hatası oluştu.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            else:
                logger.warning(f"Mesaj oluşturma: Serializer hataları (Chat {pk}): {serializer.errors}")
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# --- Metne Çevirme View'ı ---
class TranscribeAudioView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, message_id, format=None):
        try:
            message = Message.objects.get(pk=message_id)
            if request.user not in message.chat_room.participants.all():
                 logger.warning(f"Transcribe: Kullanıcı ({request.user.id}) mesaj ({message_id}) odasına ait değil.")
                 return Response({"detail": "Bu mesaja erişim izniniz yok."}, status=status.HTTP_403_FORBIDDEN)
        except Message.DoesNotExist:
            logger.warning(f"Transcribe: Mesaj bulunamadı (ID: {message_id}).")
            return Response({"detail": "Mesaj bulunamadı."}, status=status.HTTP_404_NOT_FOUND)

        if message.file_type != 'audio':
            logger.warning(f"Transcribe: Mesaj ({message_id}) ses dosyası değil (Tip: {message.file_type}).")
            return Response({"detail": "Bu mesaj bir ses dosyası değil."}, status=status.HTTP_400_BAD_REQUEST)
        if not message.file:
            logger.warning(f"Transcribe: Mesajla ({message_id}) ilişkilendirilmiş dosya yok.")
            return Response({"detail": "Mesajla ilişkilendirilmiş bir ses dosyası yok."}, status=status.HTTP_400_BAD_REQUEST)

        original_audio_path = message.file.path
        if not os.path.exists(original_audio_path):
            logger.error(f"Transcribe: Ses dosyası '{original_audio_path}' sunucuda bulunamadı (Mesaj ID: {message_id}).")
            return Response({"detail": "Ses dosyası sunucuda bulunamadı."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        recognizer = sr.Recognizer()
        converted_wav_path = None

        try:
            file_name, file_extension = os.path.splitext(original_audio_path)
            original_format = file_extension.lower().replace('.', '')
            if not original_format:
                original_format = 'm4a' # Varsayılan format
                logger.warning(f"Transcribe: Dosya formatı belirlenemedi ({original_audio_path}), '{original_format}' varsayıldı.")

            logger.info(f"Transcribe: '{original_audio_path}' ({original_format}) yükleniyor (Mesaj ID: {message_id})...")
            try:
                audio = AudioSegment.from_file(original_audio_path, format=original_format)
            except Exception as load_err:
                 logger.error(f"Transcribe: Pydub ses dosyasını yükleyemedi ({original_format}, Path: {original_audio_path}): {load_err}", exc_info=True)
                 if "ffmpeg" in str(load_err).lower() or "libav" in str(load_err).lower():
                      return Response({"detail": "Ses dosyası yüklenemedi. Sunucu yapılandırmasını (ffmpeg/libav) kontrol edin."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                 else:
                      return Response({"detail": f"Ses dosyası formatı ('{original_format}') desteklenmiyor veya dosya bozuk."}, status=status.HTTP_400_BAD_REQUEST)

            converted_wav_path = os.path.join(TEMP_DIR, f"temp_{message_id}_{request.user.id}.wav")
            logger.info(f"Transcribe: '{converted_wav_path}' olarak WAV formatına dönüştürülüyor...")
            audio.export(converted_wav_path, format="wav")

            logger.info(f"Transcribe: '{converted_wav_path}' dosyası speech_recognition ile işleniyor...")
            with sr.AudioFile(converted_wav_path) as source:
                audio_data = recognizer.record(source)

            logger.info("Transcribe: Ses verisi Google API'ye gönderiliyor (dil: tr-TR)...")
            text = recognizer.recognize_google(audio_data, language='tr-TR')
            logger.info(f"Transcribe: Başarılı! Tanınan Metin (Mesaj ID: {message_id}): {text}")

            return Response({"transcription": text}, status=status.HTTP_200_OK)

        except sr.UnknownValueError:
            logger.warning(f"Transcribe: Ses tanınamadı (Mesaj ID: {message_id}).")
            return Response({"detail": "Ses tanınamadı. İçerik anlaşılamadı veya ses dosyası boş."}, status=status.HTTP_400_BAD_REQUEST)
        except sr.RequestError as e:
            logger.error(f"Transcribe: Google API hatası (Mesaj ID: {message_id}): {e}")
            return Response({"detail": f"Google API'den sonuç alınamadı: {e}"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except Exception as e:
            logger.exception(f"Transcribe: Metne çevirme sırasında genel hata (Mesaj ID: {message_id}): {e}")
            if "ffmpeg" in str(e).lower() or "libav" in str(e).lower():
                error_detail = "Ses dosyası işlenirken hata oluştu. Sunucu yapılandırmasını (ffmpeg/libav) kontrol edin."
            else:
                error_detail = f"Metne çevirme sırasında beklenmedik bir sunucu hatası oluştu: {type(e).__name__}"
            return Response({"detail": error_detail}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        finally:
            if converted_wav_path and os.path.exists(converted_wav_path):
                try:
                    logger.info(f"Transcribe: Geçici dosya '{converted_wav_path}' siliniyor...")
                    os.remove(converted_wav_path)
                except OSError as e:
                    logger.warning(f"Transcribe: Geçici dosya '{converted_wav_path}' silinemedi: {e}")

# --- Tepki Ekleme/Kaldırma View'ı ---
class ReactToMessageView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, message_id, format=None):
        try:
            message = Message.objects.select_related('chat_room__participants').get(pk=message_id) # Participants'ı önceden çek
        except Message.DoesNotExist:
            logger.warning(f"React: Mesaj bulunamadı (ID: {message_id}).")
            return Response({"detail": "Mesaj bulunamadı."}, status=status.HTTP_404_NOT_FOUND)

        # Katılımcı kontrolü (prefetch ile daha verimli olabilir)
        # Note: `message.chat_room.participants.all()` yerine `message.chat_room.participants.filter(pk=request.user.pk).exists()` daha verimli
        is_participant = message.chat_room.participants.filter(pk=request.user.pk).exists()
        if not is_participant:
             logger.warning(f"React: Kullanıcı ({request.user.id}) mesaj ({message_id}) odasına ait değil.")
             return Response({"detail": "Bu mesaja tepki verme izniniz yok."}, status=status.HTTP_403_FORBIDDEN)

        reaction_emoji = request.data.get('reaction')
        if not reaction_emoji or not isinstance(reaction_emoji, str) or len(reaction_emoji) > 2: # Basit emoji kontrolü
            logger.warning(f"React: Geçersiz tepki isteği (Mesaj ID: {message_id}, Kullanıcı: {request.user.id}, Tepki: {reaction_emoji}).")
            return Response({"detail": "Geçerli bir tepki (reaction) alanı gerekli."}, status=status.HTTP_400_BAD_REQUEST)

        user_id = request.user.id
        reactions = message.reactions or {} # JSONField için None yerine {} kullanmak daha güvenli

        user_list_for_emoji = reactions.get(reaction_emoji, [])
        action_taken = ''

        if user_id in user_list_for_emoji:
            user_list_for_emoji.remove(user_id)
            if not user_list_for_emoji: del reactions[reaction_emoji]
            else: reactions[reaction_emoji] = user_list_for_emoji
            action_taken = 'removed'
            logger.info(f"React: Kullanıcı {user_id}, mesaj {message_id} için '{reaction_emoji}' tepkisini kaldırdı.")
        else:
            user_list_for_emoji.append(user_id)
            reactions[reaction_emoji] = user_list_for_emoji
            action_taken = 'added'
            logger.info(f"React: Kullanıcı {user_id}, mesaj {message_id} için '{reaction_emoji}' tepkisini ekledi.")

        message.reactions = reactions
        message.save(update_fields=['reactions'])

        # ----- WebSocket Güncellemesi (Eğer kullanılıyorsa) -----
        # try:
        #     from channels.layers import get_channel_layer
        #     from asgiref.sync import async_to_sync
        #     import json
        #     channel_layer = get_channel_layer()
        #     room_group_name = f"chat_{message.chat_room.id}"
        #     async_to_sync(channel_layer.group_send)(
        #         room_group_name,
        #         {
        #             'type': 'reaction_update', # consumers.py'deki handler
        #             'message_id': message.id,
        #             'reactions': message.reactions,
        #             'user_id': user_id,
        #             'action': action_taken,
        #             'reaction': reaction_emoji,
        #         }
        #     )
        #     logger.info(f"React: Tepki güncellemesi WebSocket üzerinden yayınlandı (Mesaj {message_id}).")
        # except Exception as e:
        #     logger.error(f"React: WebSocket reaction update hatası (Mesaj {message_id}): {e}")
        # ----- -------------------------------- -----

        serializer = MessageSerializer(message, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

# --- Şarkı İndirme View (Geliştirilmiş Loglama ve Hata Yönetimi ile) ---

import time
import yt_dlp
import re
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

# Selenium importları
from selenium import webdriver
from selenium.common.exceptions import NoSuchElementException, TimeoutException, WebDriverException
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.service import Service as ChromeService
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

@csrf_exempt
@require_POST
def fetch_and_download_song(request):
    search_lyrics = request.POST.get('lyrics', '').strip()
    if not search_lyrics:
        logger.warning("Download Song: İstekte 'lyrics' parametresi eksik veya boş.")
        return JsonResponse({"error": "Şarkı sözü ('lyrics') parametresi gerekli."}, status=400)

    logger.info(f"Download Song: İstek alındı. Şarkı sözü: '{search_lyrics}'")

    genius_driver = None
    yt_driver = None
    song_title = None
    youtube_url = None

    # === 1. Genius'ta şarkı adını bul ===
    try:
        logger.info("Download Song: Genius araması için WebDriver başlatılıyor...")
        options = webdriver.ChromeOptions()
        options.add_argument('--headless')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--disable-gpu') # Bazen headless modda yardımcı olabilir
        # Kullanıcı Aracısı (User-Agent) eklemek engellemeyi zorlaştırabilir
        options.add_argument('user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36')

        genius_driver = webdriver.Chrome(service=ChromeService(ChromeDriverManager().install()), options=options)
        wait = WebDriverWait(genius_driver, 20) # Bekleme süresini biraz artırabiliriz
        logger.info("Download Song: WebDriver başlatıldı. Genius.com'a gidiliyor...")

        genius_driver.get("https://genius.com/")
        logger.info("Download Song: Genius.com yüklendi. Arama kutusu bekleniyor...")
        search_box = wait.until(EC.visibility_of_element_located((By.NAME, "q")))

        logger.info("Download Song: Arama kutusu bulundu. Sözler gönderiliyor...")
        search_box.clear()
        search_box.send_keys(search_lyrics)
        search_box.send_keys(Keys.RETURN)

        result_selector = "mini-song-card a" # Bu seçici değişmiş olabilir!
        logger.info(f"Download Song: Arama sonuçları bekleniyor (Seçici: '{result_selector}')...")
        # İlk tıklanabilir sonucu bekle
        result_element = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, result_selector)))
        song_title = result_element.text.strip()
        logger.info(f"Download Song: Genius'tan şarkı adı bulundu: '{song_title}'")

    except TimeoutException:
        logger.error(f"Download Song: Genius arama zaman aşımına uğradı. Eleman bulunamadı (Seçici: '{result_selector}'). Genius.com yapısı değişmiş olabilir.", exc_info=True)
        return JsonResponse({"error": "Genius arama zaman aşımına uğradı. Şarkı adı bulunamadı. Web sitesi yapısı değişmiş olabilir."}, status=500)
    except NoSuchElementException:
         logger.error(f"Download Song: Genius arama elemanı bulunamadı (Seçici: '{result_selector}'). Genius.com yapısı değişmiş.", exc_info=True)
         return JsonResponse({"error": "Genius arama sonucu elemanı bulunamadı. Web sitesi yapısı değişmiş olabilir."}, status=500)
    except WebDriverException as e:
        logger.error(f"Download Song: Genius araması sırasında WebDriver hatası: {e}", exc_info=True)
        # Daha spesifik hata mesajı vermek mümkünse (örn: tarayıcı çöktü)
        return JsonResponse({"error": f"Genius araması sırasında tarayıcı/WebDriver hatası: {e}"}, status=500)
    except Exception as e:
        logger.exception(f"Download Song: Genius araması sırasında beklenmedik genel hata: {e}")
        return JsonResponse({"error": f"Genius araması sırasında beklenmedik bir hata oluştu: {type(e).__name__}"}, status=500)
    finally:
        if genius_driver:
            logger.info("Download Song: Genius WebDriver kapatılıyor...")
            genius_driver.quit()

    # Şarkı adı bulunamadıysa devam etme
    if not song_title:
         logger.error("Download Song: Genius'tan şarkı adı alınamadığı için işlem durduruldu.")
         # Yukarıdaki except blokları zaten response döndürmeli ama garanti olsun.
         return JsonResponse({"error": "Önceki adımda Genius'tan şarkı adı alınamadı."}, status=500)

    # === 2. YouTube'da ilk video linkini al ===
    try:
        logger.info(f"Download Song: YouTube araması için WebDriver başlatılıyor (Şarkı: '{song_title}')...")
        yt_options = webdriver.ChromeOptions()
        yt_options.add_argument('--headless')
        yt_options.add_argument('--no-sandbox')
        yt_options.add_argument('--disable-dev-shm-usage')
        yt_options.add_argument('--disable-gpu')
        yt_options.add_argument('user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36')


        yt_driver = webdriver.Chrome(service=ChromeService(ChromeDriverManager().install()), options=yt_options)
        yt_wait = WebDriverWait(yt_driver, 20)
        logger.info("Download Song: WebDriver başlatıldı. YouTube'a gidiliyor...")

        # YouTube arama URL'sini oluştur (Google üzerinden gitmek yerine doğrudan YouTube araması daha iyi olabilir)
        # search_query = f"{song_title} lyrics".replace(' ', '+') # Daha iyi sonuçlar için 'lyrics' ekleyebiliriz
        search_query = song_title.replace(' ', '+')
        youtube_search_url = f"https://www.youtube.com/results?search_query={search_query}"
        logger.info(f"Download Song: YouTube arama URL'sine gidiliyor: {youtube_search_url}")
        yt_driver.get(youtube_search_url)

        # YouTube'un yapısı sıkça değişir, bu seçici güncel olmayabilir!
        video_selector = "ytd-video-renderer a#video-title"
        logger.info(f"Download Song: YouTube video linki bekleniyor (Seçici: '{video_selector}')...")
        # İlk video sonucunun görünür ve href özelliğine sahip olmasını bekle
        video_element = yt_wait.until(
            EC.presence_of_element_located((By.CSS_SELECTOR, video_selector))
        )
        # Href'in boş olmadığını da kontrol etmek iyi olabilir
        youtube_url = video_element.get_attribute("href")
        if not youtube_url:
             # Bazen element bulunur ama href geç yüklenir, kısa bir bekleme daha denenebilir
             time.sleep(1)
             youtube_url = video_element.get_attribute("href")
             if not youtube_url:
                  raise ValueError("YouTube video elementi bulundu ancak 'href' özelliği boş veya alınamadı.")

        logger.info(f"Download Song: YouTube video linki bulundu: {youtube_url}")

    except TimeoutException:
        logger.error(f"Download Song: YouTube arama zaman aşımına uğradı. Video linki bulunamadı (Seçici: '{video_selector}'). YouTube yapısı değişmiş olabilir.", exc_info=True)
        return JsonResponse({"error": "YouTube arama zaman aşımına uğradı. Video linki bulunamadı. Web sitesi yapısı değişmiş olabilir."}, status=500)
    except NoSuchElementException:
         logger.error(f"Download Song: YouTube video elemanı bulunamadı (Seçici: '{video_selector}'). YouTube yapısı değişmiş.", exc_info=True)
         return JsonResponse({"error": "YouTube video sonucu elemanı bulunamadı. Web sitesi yapısı değişmiş olabilir."}, status=500)
    except WebDriverException as e:
        logger.error(f"Download Song: YouTube araması sırasında WebDriver hatası: {e}", exc_info=True)
        return JsonResponse({"error": f"YouTube araması sırasında tarayıcı/WebDriver hatası: {e}"}, status=500)
    except Exception as e:
        logger.exception(f"Download Song: YouTube araması sırasında beklenmedik genel hata: {e}")
        return JsonResponse({"error": f"YouTube araması sırasında beklenmedik bir hata oluştu: {type(e).__name__}"}, status=500)
    finally:
        if yt_driver:
            logger.info("Download Song: YouTube WebDriver kapatılıyor...")
            yt_driver.quit()

    # YouTube URL'si bulunamadıysa devam etme
    if not youtube_url:
         logger.error("Download Song: YouTube'dan video URL'si alınamadığı için işlem durduruldu.")
         return JsonResponse({"error": "Önceki adımda YouTube'dan video URL'si alınamadı."}, status=500)

    # === 3. MP3 olarak indir ===
    try:
        logger.info(f"Download Song: '{youtube_url}' adresinden ses indirme işlemi başlatılıyor...")
        download_folder = os.path.join(settings.MEDIA_ROOT, "indirilen_sarkilar")
        if not os.path.exists(download_folder):
            logger.info(f"Download Song: İndirme klasörü oluşturuluyor: '{download_folder}'")
            os.makedirs(download_folder)

        # Yeni satırları boşlukla değiştir, sonra geçersiz karakterleri temizle ve boşlukları _ yap
        safe_filename = re.sub(r'[^\w\s-]', '', song_title.replace('\n', ' ')).strip().replace(' ', '_')
        # VEYA Yeni satırları tamamen silmek isterseniz:
        # safe_filename = re.sub(r'[^\w\s-]', '', song_title.replace('\n', '')).strip().replace(' ', '_')
        # Çok uzunsa kısaltabiliriz
        safe_filename = safe_filename[:100] if len(safe_filename) > 100 else safe_filename
        # Eğer boş kalırsa varsayılan bir ad ver
        if not safe_filename: safe_filename = "indirilen_sarki"

        # Çıktı şablonunu tam yol olarak belirt
        output_template = os.path.join(download_folder, f'{safe_filename}.%(ext)s')
        final_mp3_path_no_ext = os.path.join(download_folder, safe_filename)

        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': output_template,
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                # 'preferredquality': '192', # İsteğe bağlı kalite ayarı
            }],
            'noplaylist': True, # Eğer link playlist ise sadece videoyu indir
            'quiet': False, # Logları görmek için False yapabiliriz, ama çok fazla olabilir
            'no_warnings': False, # Uyarıları görelim
            'verbose': True, # Daha fazla log için
            # 'ffmpeg_location': '/path/to/ffmpeg' # Eğer PATH'de değilse ffmpeg yolu
        }

        logger.info(f"Download Song: yt-dlp seçenekleri: {ydl_opts}")
        logger.info(f"Download Song: yt-dlp ile indirme başlatılıyor. Hedef: '{output_template}'")

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([youtube_url])

        # İndirilen dosyanın adını kontrol et (yt-dlp bazen uzantıyı ekler)
        final_mp3_path = f"{final_mp3_path_no_ext}.mp3"
        if not os.path.exists(final_mp3_path):
             # Belki başka bir uzantıyla indi? Veya isim değişti?
             # Bu durumu daha robust handle etmek gerekebilir, şimdilik hata verelim.
             logger.error(f"Download Song: İndirme sonrası beklenen MP3 dosyası bulunamadı: '{final_mp3_path}'")
             # İndirme klasöründeki olası dosyaları loglayabiliriz
             try:
                 files_in_dir = os.listdir(download_folder)
                 logger.info(f"Download Song: İndirme klasöründeki dosyalar ({download_folder}): {files_in_dir}")
             except Exception as list_err:
                 logger.error(f"Download Song: İndirme klasörü listelenemedi: {list_err}")

             return JsonResponse({"error": "Ses dosyası indirildi ancak sunucuda bulunamadı veya beklenmedik bir adla kaydedildi."}, status=500)

        # Dosya URL'sini oluştur (MEDIA_URL'ye göre)
        # settings.MEDIA_URL 'media/' ise:
        relative_file_path = os.path.join("indirilen_sarkilar", f"{safe_filename}.mp3")
        # Django'nun /media/ önekini handle edeceğini varsayıyoruz. URL düzgün oluşturulmalı.
        # Eğer başta / yoksa ekle:
        media_url_prefix = settings.MEDIA_URL if settings.MEDIA_URL.endswith('/') else f"{settings.MEDIA_URL}/"
        final_file_url = f"{media_url_prefix}{relative_file_path.replace(os.sep, '/')}" # Windows uyumluluğu için

        logger.info(f"Download Song: İndirme başarılı! Dosya yolu: '{final_mp3_path}', URL: '{final_file_url}'")

        return JsonResponse({
            "song": song_title,
            "youtube_url": youtube_url,
            "file": final_file_url # Frontend'in kullanacağı URL
        })

    except yt_dlp.utils.DownloadError as e:
        logger.error(f"Download Song: yt-dlp indirme hatası: {e}", exc_info=True)
        # Hata mesajını kullanıcıya daha anlaşılır göstermeye çalışalım
        if "Unsupported URL" in str(e):
            error_msg = "Sağlanan YouTube URL'si desteklenmiyor veya geçersiz."
        elif "Video unavailable" in str(e):
            error_msg = "YouTube videosu kullanılamıyor (gizli, silinmiş vb.)."
        else:
            error_msg = f"YouTube'dan ses indirilirken hata oluştu: {e}"
        return JsonResponse({"error": error_msg}, status=500)
    except Exception as e:
        logger.exception(f"Download Song: Ses indirme/işleme sırasında beklenmedik genel hata: {e}")
        # FFmpeg hatası olup olmadığını kontrol et
        if "ffmpeg" in str(e).lower() or "ffprobe" in str(e).lower():
             return JsonResponse({"error": "Ses dosyası indirildi ancak MP3'e dönüştürülürken hata oluştu. Sunucuda FFmpeg kurulu ve PATH içinde olduğundan emin olun."}, status=500)
        else:
             return JsonResponse({"error": f"Ses indirme sırasında beklenmedik bir hata oluştu: {type(e).__name__}"}, status=500)
from django.shortcuts import get_object_or_404 # get_object_or_404 eklendi
from .serializers import ProfilePublicKeySerializer # Yeni serializer import edildi
# --- YENİ: Mevcut Kullanıcının Genel Anahtarını Güncelleme View'ı ---
class CurrentUserPublicKeyUpdateView(generics.UpdateAPIView):
    """
    Allows the currently authenticated user to set or update their public key.
    Accepts PUT or PATCH with {'public_key': '...'}.
    """
    serializer_class = ProfilePublicKeySerializer
    permission_classes = [permissions.IsAuthenticated]
    queryset = Profile.objects.all() # Gerekli ama get_object override edilecek

    def get_object(self):
        # Kullanıcının profilini getir veya 404 döndür
        # Profile nesnesinin her zaman var olduğunu varsayıyoruz (Register'da oluşturuldu)
        profile, created = Profile.objects.get_or_create(user=self.request.user)
        if created:
             logger.info(f"Profile created for user {self.request.user.username} during public key update.")
        return profile

    def perform_update(self, serializer):
        instance = serializer.save()
        logger.info(f"Public key updated for user {self.request.user.username}")

# ---------------------------------------------------------------

# --- YENİ: Başka Bir Kullanıcının Genel Anahtarını Alma View'ı ---
class UserPublicKeyView(generics.RetrieveAPIView):
    """
    Retrieves the public key of a specific user by their ID.
    Returns {'user_id': id, 'public_key': '...'}.
    """
    permission_classes = [permissions.IsAuthenticated]
    # Sadece public_key döndüreceğimiz için serializer'a gerek yok (veya basit bir tane)
    # serializer_class = ProfilePublicKeySerializer # Kullanılabilir ama sadece okuma için
    queryset = Profile.objects.select_related('user').all()
    lookup_field = 'user_id' # URL'den user_id alınacak

    def retrieve(self, request, *args, **kwargs):
        user_id = self.kwargs.get('user_id')
        if not user_id:
             return Response({"detail": "User ID not provided in URL."}, status=status.HTTP_400_BAD_REQUEST)

        # İstek yapan kullanıcı kendi anahtarını istiyorsa CurrentUserView'a yönlendirebiliriz
        # veya direkt buradan verebiliriz.
        # if str(request.user.id) == str(user_id):
        #     # Kendi profili için
        #     profile = get_object_or_404(Profile, user=request.user)
        # else:
        #     # Başka bir kullanıcı için
        profile = get_object_or_404(Profile.objects.select_related('user'), user_id=user_id)


        # Kullanıcının bu anahtarı görmeye izni var mı?
        # Şimdilik basit tutalım: Giriş yapmış herkes diğerlerinin public key'ini görebilir.
        # Daha sonra sohbet odası katılımcısı kontrolü eklenebilir.

        public_key = profile.public_key
        username = profile.user.username # İsteğe bağlı: Kullanıcı adını da döndürebiliriz

        if not public_key:
             logger.warning(f"User {username} (ID: {user_id}) public key requested by {request.user.username}, but no key found.")
             # Anahtar yoksa 404 döndürmek daha mantıklı olabilir
             return Response({"detail": "Public key not found for this user."}, status=status.HTTP_404_NOT_FOUND)

        logger.info(f"User {username} (ID: {user_id}) public key retrieved by {request.user.username}.")
        return Response({
            "user_id": user_id,
            "username": username, # Eklendi
            "public_key": public_key
        }, status=status.HTTP_200_OK)
