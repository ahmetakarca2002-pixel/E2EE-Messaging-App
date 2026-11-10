# consumers.py (Proje kök dizininde veya uygun yerde)

import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.conf import settings

# Modelleri ve Serializer'ları doğru yoldan import et
try:
    from chat_api.models import Message, ChatRoom, User
    # Serializerları burada kullanmak yerine manuel serialization daha yaygın olabilir
    # veya sadece UserSerializer gibi basit olanlar kullanılabilir.
    from chat_api.serializers import UserSerializer, MessageSerializer # MessageSerializer'ı broadcast için kullanabiliriz
except ImportError as e:
     logging.error(f"Consumer model/serializer import error: {e}. Check project structure.")
     raise

logger = logging.getLogger(__name__)

class ChatConsumer(AsyncWebsocketConsumer):
    """
    Sohbet odaları için WebSocket bağlantılarını yönetir.
    Şifreli mesajları alır, kaydeder ve yayınlar.
    Tepki güncellemeleri gibi olayları da işler.
    """
    async def connect(self):
        """WebSocket bağlantısı kurulduğunda çağrılır."""
        try:
            # Oda ID'sini URL'den al
            self.chat_id = self.scope['url_route']['kwargs']['chat_id']
            self.room_group_name = f"chat_{self.chat_id}"
            self.user = self.scope.get('user')

            """# 1. Kullanıcı doğrulanmış mı? (AuthMiddlewareStack varsayımıyla)
            if not self.user or not self.user.is_authenticated:
                logger.warning(f"WebSocket connect DENIED: Unauthenticated user. Chat ID: {self.chat_id}")
                await self.close()
                return

            # 2. Kullanıcı bu odanın katılımcısı mı?
            is_participant = await self.check_user_participation(self.user, self.chat_id)
            if not is_participant:
                logger.warning(f"WebSocket connect DENIED: User {self.user.username}/{self.user.id} is not a participant of chat {self.chat_id}.")
                await self.close()
                return"""

            # 3. Kanala Katıl
            await self.channel_layer.group_add(
                self.room_group_name,
                self.channel_name
            )

            # 4. Bağlantıyı Kabul Et
            await self.accept()
            logger.info(f"WebSocket CONNECTED: User {self.user.username}/{self.user.id} to chat {self.chat_id}. Channel: {self.channel_name}")

        except KeyError:
            logger.error(f"WebSocket connect FAILED: 'chat_id' not found in URL route. Scope: {self.scope.get('url_route')}")
            await self.close()
        except Exception as e:
            logger.exception(f"WebSocket connect FAILED: Unexpected error. Chat ID: {getattr(self, 'chat_id', 'N/A')}, User: {getattr(self.user, 'username', 'N/A')}. Error: {e}")
            await self.close()

    async def disconnect(self, close_code):
        """WebSocket bağlantısı kapandığında çağrılır."""
        username = getattr(self.user, 'username', 'Unknown User')
        user_id = getattr(self.user, 'id', 'N/A')
        chat_id_val = getattr(self, 'chat_id', 'N/A')
        channel_name_val = getattr(self, 'channel_name', 'N/A')
        room_group_name_val = getattr(self, 'room_group_name', 'N/A')

        logger.info(f"WebSocket DISCONNECTED: User {username}/{user_id} from chat {chat_id_val}. Code: {close_code}. Channel: {channel_name_val}")

        # Kanal grubundan ayrıl
        if hasattr(self, 'room_group_name') and hasattr(self, 'channel_name'):
             try:
                 await self.channel_layer.group_discard(
                     room_group_name_val,
                     channel_name_val
                 )
             except Exception as e:
                  logger.error(f"WebSocket disconnect: Group discard error. Group: {room_group_name_val}, Channel: {channel_name_val}. Error: {e}")
        else:
             logger.warning("WebSocket disconnect: room_group_name or channel_name missing.")


    async def receive(self, text_data):
        """İstemciden (şifreli) bir mesaj alındığında çağrılır."""
        if not self.user or not self.user.is_authenticated:
             logger.warning(f"WebSocket receive REJECTED: Unauthenticated user (should have been disconnected?). User: {self.user}, Chat: {self.chat_id}")
             return

        username = self.user.username
        user_id = self.user.id
        chat_id_val = self.chat_id

        logger.debug(f"WebSocket receive (Encrypted): User {username}/{user_id}, Chat: {chat_id_val}, Data Length: {len(text_data)}")

        try:
            data_json = json.loads(text_data)
            # Frontend'in göndereceği formatı belirleyin. Örn:
            # {'type': 'chat_message', 'ciphertext': '...', 'iv': '...'}
            # {'type': 'file_upload_chunk', 'data': '...'} (dosya için)
            message_type = data_json.get('type', 'chat_message') # Varsayılan tip

            # Sadece şifreli sohbet mesajlarını ele alalım
            if message_type == 'chat_message':
                ciphertext = data_json.get('ciphertext')
                # iv = data_json.get('iv') # Eğer IV ayrı geliyorsa

                if not ciphertext:
                    logger.warning(f"WebSocket receive: Encrypted message missing 'ciphertext'. User: {username}/{user_id}, Chat: {chat_id_val}")
                    # İstemciye hata gönderilebilir: await self.send_error("Missing ciphertext")
                    return

                # Şifreli mesajı veritabanına kaydet
                # Dosya bilgisi de geliyorsa (örn: şifrelenmiş dosya adı, tipi) onu da kaydetmeli.
                # Şimdilik sadece metin varsayalım.
                new_message = await self.save_encrypted_message(
                    self.user,
                    chat_id_val,
                    ciphertext,
                    # iv=iv,
                    file_type='encrypted_text' # Frontend'den bilgi gelmiyorsa varsayılan
                    # file=None # Eğer dosya bilgisi ayrı gelmiyorsa
                )

                if new_message:
                    # Başarılı kayıttan sonra mesajı gruba yayınla
                    # Serializer kullanarak tam mesaj bilgisini alabiliriz
                    # VEYA sadece gerekli bilgileri manuel olarak oluşturabiliriz.
                    # Serializer kullanmak context gerektirebilir, manuel daha basit olabilir.

                    # Seçenek 1: Serializer Kullanımı (Context gerekir)
                    # serialized_message_data = await self.serialize_message_with_serializer(new_message)

                    # Seçenek 2: Manuel Serialization (Daha kontrol edilebilir)
                    broadcast_data = await self.serialize_message_for_broadcast(new_message)

                    # Yayınlanacak veriyi hazırla
                    event_data = {
                        'type': 'encrypted_message_broadcast', # Handler adı
                        'message': broadcast_data
                        # ÖNEMLİ: Ciphertext'i de yayına eklemeliyiz ki diğerleri çözebilsin!
                        # 'ciphertext': ciphertext, # Gelen ciphertext'i tekrar ekle
                        # 'iv': iv # Eğer kullanılıyorsa IV'yi ekle
                    }
                    # Eğer serialize_message_for_broadcast ciphertext içermiyorsa:
                    if 'message' in event_data and 'ciphertext' not in event_data['message']:
                         event_data['message']['ciphertext'] = ciphertext # Manuel ekle
                    # if 'message' in event_data and iv and 'iv' not in event_data['message']:
                    #      event_data['message']['iv'] = iv # Manuel ekle


                    await self.channel_layer.group_send(
                        self.room_group_name,
                        event_data
                    )
                    logger.info(f"WebSocket encrypted message processed and broadcast initiated: User {username}/{user_id}, Chat: {chat_id_val}, Msg ID: {new_message.id}")
                else:
                    # save_encrypted_message zaten hata loglamış olmalı
                    logger.error(f"Failed to save encrypted message. User: {username}/{user_id}, Chat: {chat_id_val}")
                    # İstemciye hata gönderilebilir: await self.send_error("Failed to save message")

            elif message_type == 'reaction': # Örnek: Tepki de WS üzerinden geliyorsa
                 message_id = data_json.get('message_id')
                 reaction_emoji = data_json.get('reaction')
                 # Burada ReactToMessageView'daki gibi tepkiyi işleyip yayınla
                 # await self.handle_reaction(message_id, reaction_emoji)
                 pass
            else:
                 logger.warning(f"WebSocket receive: Unknown message type '{message_type}'. User: {username}/{user_id}, Chat: {chat_id_val}")

        except json.JSONDecodeError:
             logger.error(f"WebSocket receive: Invalid JSON format. User: {username}/{user_id}, Chat: {chat_id_val}, Data: {text_data[:100]}")
             await self.send_error("Invalid JSON format.")
        except Exception as e:
             logger.exception(f"WebSocket receive: Error processing message. User: {username}/{user_id}, Chat: {chat_id_val}. Error: {e}")
             await self.send_error(f"An error occurred: {type(e).__name__}")


    # === Olay İşleyiciler (Handlers) ===

    async def encrypted_message_broadcast(self, event):
        """
        Gruptan gelen şifreli mesaj olayını alır ve istemciye gönderir.
        `receive` metodundaki group_send bu metodu tetikler.
        """
        message_data = event['message'] # Serializer'dan veya manuel oluşturulan veri
        # ciphertext = event.get('ciphertext') # Eğer event'e ayrıca eklendiyse
        # iv = event.get('iv')

        # Gelen message_data içinde ciphertext olmalı (serialize_message_for_broadcast'a ekledik).
        # Eğer yoksa, logla ve gönderme veya hatayı handle et.
        if 'ciphertext' not in message_data:
             logger.error(f"encrypted_message_broadcast: Ciphertext missing in event data for chat {self.chat_id}. Event keys: {event.keys()}")
             # Ciphertext olmadan mesajın bir anlamı yok.
             return

        logger.debug(f"Broadcasting encrypted message to client. User: {self.user.username}/{self.user.id}, Chat: {self.chat_id}, Msg ID: {message_data.get('id')}")

        # Mesajı WebSocket üzerinden gönder (JSON string olarak)
        # Frontend bu 'new_encrypted_message' tipini dinleyip mesajı alacak
        # ve içindeki ciphertext'i kendi private key'i ile çözecek.
        await self.send(text_data=json.dumps({
            'type': 'new_encrypted_message',
            'message': message_data # İçinde ciphertext, sender, timestamp vb. olmalı
            # VEYA Alanları ayrı ayrı gönderebilirsiniz:
            # 'type': 'new_encrypted_message',
            # 'message_id': message_data.get('id'),
            # 'sender': message_data.get('sender'),
            # 'timestamp': message_data.get('timestamp'),
            # 'ciphertext': message_data.get('ciphertext'),
            # 'iv': message_data.get('iv'),
            # 'reactions': message_data.get('reactions'),
            # 'file_type': message_data.get('file_type'),
            # 'file_url': message_data.get('file_url')
        }))


    async def reaction_update(self, event):
        """
        View'dan (veya WS üzerinden) gelen tepki güncelleme mesajını alır
        ve WebSocket üzerinden istemciye gönderir.
        """
        message_id = event['message_id']
        reactions = event['reactions']
        # user_id = event['user_id'] # Hangi kullanıcının yaptığı bilgisi (opsiyonel)
        logger.info(f"Broadcasting reaction update to client. User: {self.user.username}/{self.user.id}, Chat: {self.chat_id}, Msg ID: {message_id}")

        await self.send(text_data=json.dumps({
            'type': 'reaction_update', # Frontend bu type'ı dinleyecek
            'message_id': message_id,
            'reactions': reactions
        }))

    # === Yardımcı Fonksiyonlar ===

    @database_sync_to_async
    def check_user_participation(self, user, chat_id):
        """Kullanıcının belirtilen sohbet odasının katılımcısı olup olmadığını kontrol eder."""
        try:
            return ChatRoom.objects.filter(id=chat_id, participants=user).exists()
        except Exception as e:
            logger.exception(f"check_user_participation: DB error. User: {user.id}, Chat: {chat_id}. Error: {e}")
            return False

    @database_sync_to_async
    def save_encrypted_message(self, user, chat_id, ciphertext, file_type='encrypted_text', iv=None, file=None):
        """Yeni şifreli mesajı veritabanına kaydeder."""
        try:
            chat_room = ChatRoom.objects.get(id=chat_id)
            message = Message.objects.create(
                chat_room=chat_room,
                sender=user,
                ciphertext=ciphertext,
                # iv=iv, # Eğer kullanılıyorsa
                file_type=file_type,
                file=file # Eğer dosya varsa
            )
            return message
        except ChatRoom.DoesNotExist:
            logger.error(f"save_encrypted_message: ChatRoom {chat_id} not found.")
            return None
        except Exception as e:
            logger.exception(f"save_encrypted_message: Error saving message. User: {user.id}, Chat: {chat_id}. Error: {e}")
            return None

    @database_sync_to_async
    def serialize_message_for_broadcast(self, message):
        """
        Yayınlanacak mesaj için gerekli meta veriyi ve ŞİFRELİ İÇERİĞİ hazırlar.
        İstemcinin mesajı çözmesi için ciphertext gereklidir.
        """
        try:
            sender_data = UserSerializer(message.sender).data

            file_url = None
            if message.file and hasattr(message.file, 'url'):
                 try:
                     # build_absolute_uri context gerektirir, burada olmayabilir. URL'i direkt alalım.
                     file_url = message.file.url
                 except Exception as url_err:
                     logger.warning(f"serialize_message_for_broadcast: Error getting file URL for Msg ID {message.id}: {url_err}")

            return {
                '_id': message.id,
                'id': message.id,
                'chat_room': message.chat_room.id,
                'timestamp': message.timestamp.isoformat(),
                'createdAt': message.timestamp.isoformat(), # Gifted Chat uyumu
                'sender': sender_data, # Gönderen bilgisi
                'user': sender_data,   # Gifted Chat uyumu
                'ciphertext': message.ciphertext, # *** ŞİFRELİ İÇERİK ***
                # 'iv': message.iv, # Eğer kullanılıyorsa
                'file': message.file.name if message.file else None,
                'file_url': file_url,
                'file_type': message.file_type,
                'reactions': message.reactions or {},
            }
        except Exception as e:
             logger.exception(f"serialize_message_for_broadcast: Error serializing message. Msg ID: {message.id}. Error: {e}")
             return {'_id': message.id, 'id': message.id, 'error': 'Serialization failed'}


    async def send_error(self, error_message, close_connection=False):
        """İstemciye hata mesajı gönderir."""
        logger.warning(f"Sending error to client: {error_message}. User: {getattr(self.user, 'username', 'N/A')}, Chat: {getattr(self, 'chat_id', 'N/A')}")
        await self.send(text_data=json.dumps({
            'type': 'error',
            'detail': error_message
        }))
        if close_connection:
            await self.close()