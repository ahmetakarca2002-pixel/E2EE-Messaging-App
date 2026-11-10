# chat_api/serializers.py (Tamamı - Hatalar Düzeltilmiş)

from rest_framework import serializers
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password # Şifre validasyonu için
from django.core.exceptions import ValidationError as DjangoValidationError # Model validasyonu için
from django.db import models as django_models # 'models' ismi çakışmasın diye
from django.db import IntegrityError # Kullanıcı adı/email unique hatası için

# Modelleri import et
from .models import ChatRoom, Message, UserKey, UserProfile

# --- UserSerializer ---
class UserSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    _id = serializers.IntegerField(source='id', read_only=True)
    class Meta:
        model = User
        fields = ('_id', 'id', 'username', 'email', 'first_name', 'last_name', 'name')

    def get_name(self, obj):
        # İsim ve soyisim varsa birleştir, yoksa kullanıcı adını kullan
        full_name = f"{obj.first_name} {obj.last_name}".strip()
        return full_name or obj.username

# --- UserKeySerializer (JWK için) ---
class UserKeySerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    # Modeldeki JSONField'ı temsil eder, read_only yaptık.
    public_key_jwk = serializers.JSONField(read_only=True)

    class Meta:
        model = UserKey
        fields = ['id', 'user', 'public_key_jwk', 'created_at']
        read_only_fields = fields # Tüm alanlar sadece okunur


# --- RegisterSerializer ---
class RegisterSerializer(serializers.ModelSerializer):
    # write_only=True: Bu alanlar sadece kayıt sırasında alınır, yanıtta geri gönderilmez.
    # required=True: Bu alanlar zorunludur.
    # validators: Django'nun şifre kurallarını uygular.
    password = serializers.CharField(write_only=True, required=True, validators=[validate_password], style={'input_type': 'password'})
    password2 = serializers.CharField(write_only=True, required=True, label="Password confirmation", style={'input_type': 'password'})
    # required=False: Opsiyonel alanlar. allow_blank=True: Boş string kabul edilir.
    first_name = serializers.CharField(required=False, allow_blank=True, default='')
    last_name = serializers.CharField(required=False, allow_blank=True, default='')

    class Meta:
        model = User
        fields = ('username', 'password', 'password2', 'email', 'first_name', 'last_name')
        extra_kwargs = {
            'email': {'required': True, 'allow_blank': False} # E-postayı zorunlu yap
        }

    def validate(self, attrs):
        # Şifrelerin eşleşip eşleşmediğini kontrol et
        if attrs['password'] != attrs['password2']:
            # Hata mesajını password2 alanına atayalım (frontend'de göstermesi daha kolay olabilir)
            raise serializers.ValidationError({"password2": "Şifreler eşleşmiyor."})
        return attrs

    def create(self, validated_data):
        # password2 artık gerekli değil, çıkaralım
        validated_data.pop('password2', None)
        try:
            # User.objects.create_user metodu şifreyi otomatik hash'ler
            user = User.objects.create_user(
                username=validated_data['username'],
                email=validated_data['email'],
                password=validated_data['password'], # create_user hash'ler
                first_name=validated_data.get('first_name', ''),
                last_name=validated_data.get('last_name', '')
            )
            # Başarılı kayıt sonrası sinyallerle veya burada UserKey/UserProfile oluşturulabilir.
            return user
        except IntegrityError as e:
            # Veritabanı unique constraint hatası (username veya email zaten mevcut)
            errors = {}
            if 'username' in str(e).lower():
                errors['username'] = ['Bu kullanıcı adı zaten mevcut.']
            elif 'email' in str(e).lower():
                 errors['email'] = ['Bu e-posta adresi zaten mevcut.']
            else:
                 # Diğer olası IntegrityError durumları
                 errors['non_field_errors'] = ['Kayıt sırasında benzersizlik hatası oluştu.']
            raise serializers.ValidationError(errors)
        except Exception as e:
             # Diğer beklenmedik hatalar için loglama ve genel hata
             # logger importu başta yapılmalı: import logging; logger = logging.getLogger(__name__)
             # logger.exception(f"Unexpected error during user registration: {e}")
             print(f"Unexpected error during user registration: {e}") # Geçici olarak print
             raise serializers.ValidationError({'non_field_errors': ['Kayıt sırasında beklenmedik bir sunucu hatası oluştu.']})


# --- MessageSerializer ---
class MessageSerializer(serializers.ModelSerializer):
    sender = UserSerializer(read_only=True)
    user = serializers.SerializerMethodField(read_only=True)
    _id = serializers.SerializerMethodField(read_only=True)
    createdAt = serializers.DateTimeField(source='timestamp', read_only=True)
    file_url = serializers.SerializerMethodField(read_only=True)
    # `ciphertext` alanı yazma sırasında alınır (zorunlu) ve boş olamaz
    ciphertext = serializers.CharField(write_only=True, required=True, allow_blank=False)

    class Meta:
        model = Message
        fields = (
            '_id', 'id', 'chat_room', 'sender', 'ciphertext', # Sadece yazma için
            'file', 'file_url', 'file_type',
            'timestamp', 'user', 'createdAt', 'reactions'
        )
        read_only_fields = (
            'id', '_id', 'sender', 'timestamp', 'user', 'createdAt',
            'file_url', 'reactions', 'file_type'
        )
        write_only_fields = ('ciphertext',)

    # --- Serializer Metodları ---
    def get__id(self, obj):
        return obj.id

    def get_user(self, obj):
        # UserSerializer context gerektirmez, doğrudan kullanılabilir
        return UserSerializer(obj.sender).data

    def get_file_url(self, obj):
        request = self.context.get('request')
        if obj.file and hasattr(obj.file, 'url') and request:
            try:
                return request.build_absolute_uri(obj.file.url)
            except Exception as e:
                print(f"Warning: Could not build absolute URI for file {obj.file.name}: {e}")
                return obj.file.url # Fallback olarak relatif URL
        return None

    # --- Create Metodu ---
    def create(self, validated_data):
        # sender ve chat_room view tarafından otomatik eklenir (serializer.save() içinde)
        file = validated_data.get('file', None)
        # file_type'ı frontend göndermiyorsa veya doğrulamak istiyorsak burada set et
        if 'file_type' not in validated_data:
            validated_data['file_type'] = 'encrypted_file' if file else 'encrypted_text'
        elif file and not validated_data['file_type'].startswith('encrypted_'):
             # Eğer dosya varsa ve tip 'encrypted_' ile başlamıyorsa güvenlik için düzelt
             print(f"Warning: Received file with non-encrypted file_type '{validated_data['file_type']}'. Setting to 'encrypted_file'.")
             validated_data['file_type'] = 'encrypted_file'
        elif not file and validated_data['file_type'] != 'encrypted_text':
             print(f"Warning: Received no file but file_type is '{validated_data['file_type']}'. Setting to 'encrypted_text'.")
             validated_data['file_type'] = 'encrypted_text'

        message = Message.objects.create(**validated_data)
        return message


# --- ChatRoomSerializer ---
class ChatRoomSerializer(serializers.ModelSerializer):
    participants = UserSerializer(many=True, read_only=True)
    participant_emails = serializers.ListField(
        child=serializers.EmailField(), write_only=True, required=False,
        help_text="Sohbete eklenecek diğer kullanıcıların e-posta adresleri."
    )
    last_message = serializers.SerializerMethodField()

    class Meta:
        model = ChatRoom
        fields = ('id', 'name', 'participants', 'participant_emails', 'created_at', 'last_message')
        read_only_fields = ('id', 'created_at', 'participants', 'last_message')

    def get_last_message(self, obj):
        last_msg = obj.messages.order_by('-timestamp').first()
        if last_msg:
            return {
                'text': f"[{last_msg.get_file_type_display() or 'Şifreli Mesaj'}]",
                'timestamp': last_msg.timestamp,
                'sender': last_msg.sender.username
            }
        return None

    # --- Create Metodu (Hata düzeltildi) ---
    def create(self, validated_data):
        participant_emails = validated_data.pop('participant_emails', [])
        current_user = self.context['request'].user
        participants_to_add = {current_user}

        if participant_emails:
            # E-postaları temizle, küçük harfe çevir ve isteği yapanı hariç tut
            requested_other_emails = set(
                email.lower().strip()
                for email in participant_emails
                if email and email.lower().strip() != current_user.email.lower().strip()
            )
            if not requested_other_emails:
                 # Geçerli başka e-posta yoksa hata ver
                 raise serializers.ValidationError({"participant_emails": ["Kendiniz dışında en az bir geçerli katılımcı e-postası girmelisiniz."]})

            # Veritabanında aktif kullanıcıları bul
            found_users = User.objects.filter(
                email__in=requested_other_emails, is_active=True
            )
            found_emails = {u.email.lower() for u in found_users}
            missing_emails = requested_other_emails - found_emails
            if missing_emails:
                 # --- DÜZELTME: 'serializers.ValidationError' kullanıldı ---
                 raise serializers.ValidationError({"participant_emails": [f"Şu e-posta adresleri bulunamadı veya geçersiz: {', '.join(missing_emails)}"]})
                 # --- ----------------------------------------------- ---
            participants_to_add.update(found_users)

        if len(participants_to_add) < 2:
             # --- DÜZELTME: 'serializers.ValidationError' kullanıldı ---
             raise serializers.ValidationError({"participant_emails": ["Sohbet için kendiniz dışında en az bir katılımcı daha olmalıdır."]})
             # --- ----------------------------------------------- ---

        # Aynı katılımcılarla var olan odayı bulma (Optimize edilmiş)
        participant_ids = {p.id for p in participants_to_add}
        participant_count = len(participant_ids)

        potential_rooms = ChatRoom.objects.annotate(
            p_count=django_models.Count('participants')
        ).filter(
            p_count=participant_count
        ).annotate(
            matching_participants=django_models.Count(
                'participants',
                filter=django_models.Q(participants__id__in=participant_ids)
            )
        ).filter(
            matching_participants=participant_count
        )

        existing_room = potential_rooms.first()

        if existing_room:
            print(f"Existing chat room found: {existing_room.id}")
            setattr(existing_room, '_is_existing', True)
            return existing_room

        # Yeni oda oluştur
        print("Creating new chat room...")
        chat_room = ChatRoom.objects.create(**validated_data)
        chat_room.participants.set(list(participants_to_add))
        setattr(chat_room, '_is_existing', False)
        return chat_room


# --- UserProfileSerializer ---
class UserProfileSerializer(serializers.ModelSerializer):
     class Meta:
         model = UserProfile
         # Profilde gösterilecek alanlar (Örnek)
         fields = ['id', 'user'] # 'avatar' gibi alanlar eklenebilir
         read_only_fields = ['id', 'user']