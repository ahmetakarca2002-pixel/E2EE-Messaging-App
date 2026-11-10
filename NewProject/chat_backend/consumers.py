# consumers.py (proje kök dizininde)

import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.conf import settings
from django.contrib.auth import get_user_model
from asgiref.sync import sync_to_async

User = get_user_model()

try:
    from chat_api.models import Message, ChatRoom
    from chat_api.serializers import MessageSerializer # UserSerializer'a gerek yok burada
except ImportError as e:
     logging.error(f"Consumer model/serializer import hatası: {e}. Proje yapısını kontrol edin.")
     raise

logger = logging.getLogger(__name__)

# --- Sync Helper for Serialization (View'dan da kullanmak için) ---
# Bu fonksiyon async context dışında da çalışır
def serialize_message_sync(message, request=None):
    """Mesajı sync context'te serialize eder."""
    context = {}
    if request:
         # Serializer'ın build_absolute_uri için request'e ihtiyacı var
         context['request'] = request
    try:
        # Mesajı ve ilişkili göndericiyi önceden çekmek verimli olabilir
        # Ancak burada message objesi zaten geldiği için gerek yok gibi.
        # message = Message.objects.select_related('sender__profile').get(pk=message.pk) # Gerekirse
        serializer = MessageSerializer(message, context=context)
        return serializer.data
    except Exception as e:
         logger.error(f"serialize_message_sync error for msg {message.id}: {e}")
         # Hata durumunda minimal veri döndür
         return {'id': message.id, '_id': message.id, 'error': 'Serialization in helper failed'}

# -------------------------------------------------------------------


class ChatConsumer(AsyncWebsocketConsumer):
    """Handles WebSocket connections for chat rooms."""

    async def connect(self):
        """Handles new WebSocket connection."""
        try:
            self.chat_id = self.scope['url_route']['kwargs']['chat_id']
            self.room_group_name = f"chat_{self.chat_id}"
            self.user = self.scope.get('user')

            # Authentication check
            if not self.user or not self.user.is_authenticated:
                logger.warning(f"WS Connect REJECTED: Unauthenticated user. Chat ID: {self.chat_id}")
                await self.close()
                return

            # Participation check
            is_participant = await self.check_user_participation(self.user, self.chat_id)
            if not is_participant:
                logger.warning(f"WS Connect REJECTED: User ({self.user.username}) not participant of room ({self.chat_id}).")
                await self.close()
                return

            # Join room group
            await self.channel_layer.group_add(
                self.room_group_name,
                self.channel_name
            )

            await self.accept()
            logger.info(f"WS Connected: User {self.user.username} to chat {self.chat_id}. Channel: {self.channel_name}")

        except KeyError:
            logger.error("WS Connect ERROR: 'chat_id' not found in URL route.")
            await self.close()
        except Exception as e:
            chat_id_info = getattr(self, 'chat_id', 'N/A')
            user_info = getattr(self.user, 'username', 'N/A') if hasattr(self, 'user') else 'N/A'
            logger.exception(f"WS Connect UNEXPECTED ERROR: Chat: {chat_id_info}, User: {user_info}. Error: {e}")
            await self.close()

    async def disconnect(self, close_code):
        """Handles WebSocket disconnection."""
        user_info = getattr(self.user, 'username', 'N/A') if hasattr(self, 'user') else 'N/A'
        chat_id_info = getattr(self, 'chat_id', 'N/A')
        channel_name_info = getattr(self, 'channel_name', 'N/A')
        logger.info(f"WS Disconnected: User {user_info} from chat {chat_id_info}. Code: {close_code}. Channel: {channel_name_info}")

        # Leave room group
        if hasattr(self, 'room_group_name') and hasattr(self, 'channel_name'):
             try:
                 await self.channel_layer.group_discard(
                     self.room_group_name,
                     self.channel_name
                 )
             except Exception as e:
                  logger.error(f"WS Disconnect ERROR: Group discard failed. Group: {self.room_group_name}, Channel: {self.channel_name}. Error: {e}")

    async def receive(self, text_data):
        """Handles receiving message from WebSocket."""
        if not self.user or not self.user.is_authenticated:
             logger.warning(f"WS Receive: Unauthenticated message received (should have disconnected).")
             return # Veya self.close() çağır

        logger.debug(f"WS Receive <<< User:{self.user.username}, Chat:{self.chat_id}, Data:'{text_data[:100]}...'")

        try:
            text_data_json = json.loads(text_data)
            message_type = text_data_json.get('type', 'chat_message') # Default to chat message

            # --- Handle incoming message based on type ---
            if message_type == 'chat_message':
                # Expecting encrypted text in 'text' field and 'encrypted_text' in 'file_type'
                ciphertext = text_data_json.get('text')
                file_type = text_data_json.get('file_type') # Should be 'encrypted_text'

                # Validate content
                if not ciphertext or not isinstance(ciphertext, str):
                    logger.warning(f"WS Receive: Invalid or empty 'text' (ciphertext) received. User: {self.user.username}, Chat: {self.chat_id}")
                    return
                if file_type != 'encrypted_text':
                     logger.warning(f"WS Receive: Received 'chat_message' but file_type is '{file_type}' instead of 'encrypted_text'. User: {self.user.username}, Chat: {self.chat_id}")
                     # Yine de kaydetmeyi deneyebiliriz veya reddedebiliriz. Şimdilik kaydedelim.
                     # file_type = 'encrypted_text' # Zorlayabiliriz

                # Save encrypted message to DB
                new_message = await self.save_message(self.user, self.chat_id, ciphertext, 'encrypted_text')

                if new_message:
                    # Serialize the message (includes encrypted text)
                    # Note: No request object here, so file_url might be relative
                    serialized_message = await self.serialize_message(new_message)

                    # Broadcast message to room group
                    await self.channel_layer.group_send(
                        self.room_group_name,
                        {
                            'type': 'chat_message_broadcast', # Calls chat_message_broadcast handler
                            'message': serialized_message # Contains ciphertext
                        }
                    )
                    logger.info(f"WS Message Saved & Broadcast: User:{self.user.username}, Chat:{self.chat_id}, MsgID:{new_message.id}")
                else:
                    logger.error(f"WS Receive: Failed to save message. User: {self.user.username}, Chat: {self.chat_id}")

            # --- Handle other message types (e.g., typing indicators) ---
            # elif message_type == 'typing':
            #     await self.channel_layer.group_send(
            #         self.room_group_name,
            #         {
            #             'type': 'typing_indicator',
            #             'user_id': self.user.id,
            #             'username': self.user.username,
            #             'is_typing': text_data_json.get('is_typing', False)
            #         }
            #     )
            #     logger.debug(f"WS Typing indicator sent: User:{self.user.username}, Typing:{text_data_json.get('is_typing')}")

            else:
                 logger.warning(f"WS Receive: Unknown message type '{message_type}'. User: {self.user.username}, Chat: {self.chat_id}")

        except json.JSONDecodeError:
             logger.error(f"WS Receive ERROR: Invalid JSON. User: {self.user.username}, Chat: {self.chat_id}, Data: {text_data[:100]}")
             # Optional: Send error back to client
             # await self.send(text_data=json.dumps({'error': 'Invalid JSON format.'}))
        except Exception as e:
             logger.exception(f"WS Receive UNEXPECTED ERROR: Processing message failed. User: {self.user.username}, Chat: {self.chat_id}. Error: {e}")
             # Optional: Send error back to client
             # await self.send(text_data=json.dumps({'error': 'Failed to process message.'}))


    # === WebSocket Event Handlers (Called by group_send) ===

    async def chat_message_broadcast(self, event):
        """Sends message (with ciphertext) from group to WebSocket client."""
        message_data = event['message']
        logger.debug(f"WS Broadcast >>> Chat:{self.chat_id}, MsgID:{message_data.get('id')}, ToChannel:{self.channel_name}")
        # Send message data (including encrypted text) to the client
        await self.send(text_data=json.dumps({
            'type': 'new_message', # Client listens for this type
            'message': message_data
        }))

    async def reaction_update(self, event):
        """Sends reaction update from group to WebSocket client."""
        message_id = event['message_id']
        reactions = event['reactions']
        logger.debug(f"WS Reaction Update >>> Chat:{self.chat_id}, MsgID:{message_id}, ToChannel:{self.channel_name}")
        await self.send(text_data=json.dumps({
            'type': 'reaction_update', # Client listens for this
            'message_id': message_id,
            'reactions': reactions
        }))

    # Example typing indicator handler
    # async def typing_indicator(self, event):
    #      # Don't send typing indicator back to the user who is typing
    #      if str(event['user_id']) != str(self.user.id):
    #          logger.debug(f"WS Typing Indicator >>> Chat:{self.chat_id}, User:{event['username']}, Typing:{event['is_typing']}")
    #          await self.send(text_data=json.dumps({
    #              'type': 'typing',
    #              'user_id': event['user_id'],
    #              'username': event['username'],
    #              'is_typing': event['is_typing']
    #          }))

    # === Database Helper Functions ===

    @database_sync_to_async
    def check_user_participation(self, user, chat_id):
        """Checks if the user is a participant of the chat room."""
        try:
            # exists() is more efficient than fetching the object
            return ChatRoom.objects.filter(id=chat_id, participants=user).exists()
        except Exception as e:
            logger.exception(f"DB check_user_participation error: User:{user.id}, Chat:{chat_id}. Error: {e}")
            return False

    @database_sync_to_async
    def save_message(self, user, chat_id, text_ciphertext, file_type):
        """Saves a new message (with ciphertext) to the database."""
        try:
            # Get the chat room instance
            chat_room = ChatRoom.objects.get(id=chat_id) # Assuming connect already verified existence
            message = Message.objects.create(
                chat_room=chat_room,
                sender=user,
                text=text_ciphertext, # Store the ciphertext
                file_type=file_type   # Store 'encrypted_text'
                # Note: File uploads are handled via HTTP POST in views.py, not here.
            )
            return message
        except ChatRoom.DoesNotExist:
            logger.error(f"DB save_message error: ChatRoom {chat_id} not found (should not happen here).")
            return None
        except Exception as e:
            logger.exception(f"DB save_message error: User:{user.id}, Chat:{chat_id}. Error: {e}")
            return None

    # Uses the sync helper defined at the top
    @sync_to_async
    def serialize_message(self, message):
        """Serializes the message using the sync helper (no request context)."""
        try:
             return serialize_message_sync(message, request=None)
        except Exception as e:
             logger.exception(f"WS serialize_message error: Msg ID: {message.id}. Hata: {e}")
             return {'id': message.id, '_id': message.id, 'error': 'Serialization failed in consumer'}