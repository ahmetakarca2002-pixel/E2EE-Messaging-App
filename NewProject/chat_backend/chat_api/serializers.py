from django.db import models
from rest_framework import serializers
from django.contrib.auth.models import User
from .models import ChatRoom, Message
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import models
from rest_framework import serializers
from django.contrib.auth.models import User
from .models import ChatRoom, Message
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError

# Kullanıcı kaydı için serializer
class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True, required=True)
    first_name = serializers.CharField(required=False)  # İsim eklemek için
    last_name = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ('username', 'password', 'password2', 'email', 'first_name', 'last_name')

    def validate(self, attrs):
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({"password": "Password fields didn't match."})
        # Email unique kontrolü DRF tarafından otomatik yapılır
        return attrs

    def create(self, validated_data):
        user = User.objects.create(
            username=validated_data['username'],
            email=validated_data['email'],
            first_name=validated_data.get('first_name', ''),  # İsim varsa al
            last_name=validated_data.get('last_name', '')  # Soyisim varsa al
        )
        user.set_password(validated_data['password'])
        user.save()
        return user

# chat_api/serializers.py

from django.db import models
from rest_framework import serializers
from django.contrib.auth.models import User
from .models import ChatRoom, Message, Profile # Profile eklendi
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError

# --- YENİ: Profile Serializer ---
class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Profile
        fields = ('public_key',) # Sadece public_key alanı
        read_only_fields = ('public_key',) # Sadece okunabilir (şimdilik)
        # Yazma işlemi özel bir view ile yapılacak
# --------------------------------

# Kullanıcı bilgilerini göstermek için serializer
class UserSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    _id = serializers.IntegerField(source='id', read_only=True) # Gifted Chat uyumu için _id ekleyelim
    # --- DEĞİŞİKLİK: Profil ve public_key ekle ---
    profile = ProfileSerializer(read_only=True)
    public_key = serializers.CharField(source='profile.public_key', read_only=True, allow_null=True)
    # -------------------------------------------

    class Meta:
        model = User
        # Gifted Chat genellikle _id, name, avatar bekler. Avatar yoksa sadece _id ve name.
        # public_key frontend'in şifreleme için ihtiyaç duyacağı alan.
        fields = ('_id', 'id', 'username', 'email', 'first_name', 'last_name', 'name', 'profile', 'public_key') # 'profile' ve 'public_key' eklendi
        read_only_fields = ('profile', 'public_key')

    def get_name(self, obj):
        return f"{obj.first_name} {obj.last_name}".strip() or obj.username

# ... (RegisterSerializer aynı kalabilir) ...
class RegisterSerializer(serializers.ModelSerializer):
  password = serializers.CharField(write_only=True, required=True, validators=[validate_password])
  password2 = serializers.CharField(write_only=True, required=True)
  first_name = serializers.CharField(required=False)
  last_name = serializers.CharField(required=False, allow_blank=True)

  class Meta:
      model = User
      fields = ('username', 'password', 'password2', 'email', 'first_name', 'last_name')

  def validate(self, attrs):
      if attrs['password'] != attrs['password2']:
          raise serializers.ValidationError({"password": "Password fields didn't match."})
      return attrs

  def create(self, validated_data):
      user = User.objects.create(
          username=validated_data['username'],
          email=validated_data['email'],
          first_name=validated_data.get('first_name', ''),
          last_name=validated_data.get('last_name', '')
      )
      user.set_password(validated_data['password'])
      user.save()
      # --- YENİ: Kullanıcı oluşturulunca boş bir profil de oluştur ---
      Profile.objects.create(user=user)
      # -------------------------------------------------------------
      return user


# Mesajlar için serializer
class MessageSerializer(serializers.ModelSerializer):
    sender = UserSerializer(read_only=True) # Gönderen bilgisi artık public_key içerecek
    user = serializers.SerializerMethodField(read_only=True) # Gifted Chat uyumu için 'user' nesnesi
    _id = serializers.SerializerMethodField(read_only=True)
    createdAt = serializers.DateTimeField(source='timestamp', read_only=True)
    file_url = serializers.SerializerMethodField(read_only=True)

    # --- DEĞİŞİKLİK ---
    # `text` alanı artık şifreli metin (ciphertext) içerecek.
    # Serializer'da özel bir işlem yapmaya gerek yok, olduğu gibi alıp verecek.
    # ------------------

    class Meta:
        model = Message
        # `text` alanı frontend'e şifreli olarak gidecek.
        fields = ('_id', 'id', 'chat_room', 'sender', 'text', 'file', 'file_url', 'file_type', 'timestamp', 'user', 'createdAt', 'reactions')
        read_only_fields = ('_id', 'id', 'chat_room', 'sender', 'file_url', 'timestamp', 'user', 'createdAt')
        # `file_type` alanı view'da set edilebilir veya client gönderebilir (örn: 'encrypted_text')

    def get__id(self, obj):
        return obj.id

    def get_user(self, obj):
        # Gönderen bilgisi UserSerializer ile serialize edilecek (public_key dahil)
        serializer = UserSerializer(obj.sender, context=self.context)
        return serializer.data

    def get_file_url(self, obj):
        request = self.context.get('request')
        if obj.file and request:
            try:
                return request.build_absolute_uri(obj.file.url)
            except:
                 # Bazen request olmadan çağrılabilir (örn: WebSocket), o zaman sadece path döndür
                 if hasattr(obj.file, 'url'):
                     return obj.file.url
        return None

    def create(self, validated_data):
        # Gelen 'text' alanı artık şifreli metin olacak.
        # file_type alanı frontend tarafından 'encrypted_text' olarak gönderilebilir
        # veya burada içerik kontrolü (artık mümkün değil) yerine varsayılan olarak set edilebilir.
        # Şimdilik view tarafında halledilecek şekilde bırakalım.
        return super().create(validated_data)

# Sohbet odaları için serializer
class ChatRoomSerializer(serializers.ModelSerializer):
    participants = UserSerializer(many=True, read_only=True) # Katılımcı bilgileri public_key içerecek
    participant_ids = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False
    )
    participant_emails = serializers.ListField(
        child=serializers.EmailField(), write_only=True, required=False
    )
    last_message = serializers.SerializerMethodField()

    class Meta:
        model = ChatRoom
        fields = ('id', 'name', 'participants', 'participant_ids', 'participant_emails', 'created_at', 'last_message')
        read_only_fields = ('id', 'created_at', 'participants', 'last_message')

    def get_last_message(self, obj):
        last_msg = obj.messages.first()
        if last_msg:
            # --- DEĞİŞİKLİK: Son mesajın metni şifreli olabilir ---
            message_text = ""
            if last_msg.file_type == 'text' and last_msg.text:
                message_text = "[Encrypted Message]" # Artık içeriği gösteremeyiz
            elif last_msg.file:
                 file_type_display = last_msg.get_file_type_display() or last_msg.file_type or 'File'
                 message_text = f"[{file_type_display}]"
            elif last_msg.text: # Eski mesajlar için fallback
                 message_text = last_msg.text[:50] + ('...' if len(last_msg.text) > 50 else '')
            # ----------------------------------------------------

            sender_username = last_msg.sender.username if last_msg.sender else 'Unknown'

            return {
                'text': message_text,
                'timestamp': last_msg.timestamp,
                'sender': sender_username
            }
        return None

    def create(self, validated_data):
         # Bu kısım aynı kalabilir, katılımcıları ekler.
         # ... (mevcut create kodunuz) ...
        participant_ids = validated_data.pop('participant_ids', [])
        participant_emails = validated_data.pop('participant_emails', [])
        current_user = self.context['request'].user

        participants_to_add = set([current_user.id])
        participants_to_add.update(participant_ids)

        if participant_emails:
            found_users = User.objects.filter(email__in=participant_emails)
            if len(found_users) != len(set(participant_emails) - {current_user.email}): # Kendisi hariç kontrol
                # İsteğe bağlı: Bulunamayan e-postalar için hata
                missing_emails = set(participant_emails) - set(found_users.values_list('email', flat=True)) - {current_user.email}
                if missing_emails:
                     raise serializers.ValidationError(f"Şu kullanıcılar bulunamadı: {', '.join(missing_emails)}")
            participants_to_add.update(found_users.values_list('id', flat=True))

        # Aynı katılımcılarla oda kontrolü (geliştirilebilir)
        participants_to_add_list = list(participants_to_add)
        if len(participants_to_add_list) >= 2: # En az iki katılımcı
            existing_chat = ChatRoom.objects.annotate(
                num_participants=models.Count('participants')
            ).filter(
                num_participants=len(participants_to_add_list)
            ).filter(
                participants__id__in=participants_to_add_list
            ).annotate(
                 match_count=models.Count('participants', filter=models.Q(participants__id__in=participants_to_add_list))
             ).filter(match_count=len(participants_to_add_list)).first()

            if existing_chat:
                return existing_chat

        chat_room = ChatRoom.objects.create(**validated_data)
        chat_room.participants.set(participants_to_add_list)
        return chat_room

# Mesajlar için serializer
# serializers.py

# ... (RegisterSerializer, UserSerializer aynı kalır) ...

# Mesajlar için serializer
class MessageSerializer(serializers.ModelSerializer):
    sender = UserSerializer(read_only=True) # Sadece okuma için, ID göndermeye gerek yok
    user = serializers.SerializerMethodField(read_only=True) # Gifted Chat uyumu için 'user' nesnesi
    _id = serializers.SerializerMethodField(read_only=True)  # Gifted Chat uyumu için '_id'
    createdAt = serializers.DateTimeField(source='timestamp', read_only=True)
    file_url = serializers.SerializerMethodField(read_only=True)
    

    class Meta:
        model = Message
        # Frontend'in beklediği alanları (Gifted Chat varsayımıyla) ve Django model alanlarını içerir
        fields = ('_id', 'id', 'chat_room', 'sender', 'text', 'file', 'file_url', 'file_type', 'timestamp', 'user', 'createdAt', 'reactions')
        # View'da set edilen veya metodla oluşturulan alanlar read_only olmalı
        read_only_fields = ('_id', 'id', 'chat_room', 'sender', 'file_url', 'file_type', 'timestamp', 'user', 'createdAt')

    # --- EKSIK METODLAR ---
    def get__id(self, obj):
        """Mesajın primary key'sini döndürür."""
        return obj.id

    def get_user(self, obj):
        """
        Gönderen kullanıcı bilgisini UserSerializer kullanarak
        frontend'in beklediği formatta (örn: Gifted Chat) döndürür.
        """
        # UserSerializer'a context geçirmek önemli olabilir (request gibi)
        serializer = UserSerializer(obj.sender, context=self.context)
        return serializer.data

    def get_file_url(self, obj):
        """Varsa, mesaj dosyasının tam URL'sini döndürür."""
        request = self.context.get('request')
        if obj.file and request:
            # Dosya URL'sini oluştururken request'e ihtiyaç var
            return request.build_absolute_uri(obj.file.url)
        return None
    # ----------------------

    # Create metodu view'dan gelenleri bekleyebilir
    def create(self, validated_data):
        file = validated_data.get('file', None)
        if file:
            content_type = file.content_type  # örn: audio/mpeg
            if 'audio' in content_type:
                validated_data['file_type'] = 'audio'
            elif 'image' in content_type:
                validated_data['file_type'] = 'image'
            elif 'video' in content_type:
                validated_data['file_type'] = 'video'
            else:
                validated_data['file_type'] = 'file'  # default bir değer

        return super().create(validated_data)


# ... (ChatRoomSerializer) ...

# ... (ChatRoomSerializer aynı kalır) ...

# Sohbet odaları için serializer
class ChatRoomSerializer(serializers.ModelSerializer):
    participants = UserSerializer(many=True, read_only=True)
    # Katılımcı ID'lerini yazmak için
    participant_ids = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False
    )
    # E-posta ile katılımcı eklemek için (ChatList'teki gibi)
    participant_emails = serializers.ListField(
        child=serializers.EmailField(), write_only=True, required=False
    )
    # Son mesajı göstermek için (isteğe bağlı)
    last_message = serializers.SerializerMethodField()

    class Meta:
        model = ChatRoom
        fields = ('id', 'name', 'participants', 'participant_ids', 'participant_emails', 'created_at', 'last_message')
        read_only_fields = ('id', 'created_at', 'participants', 'last_message')

    def get_last_message(self, obj):
        last_msg = obj.messages.first()  # ordering = ['-timestamp'] olduğu için ilk mesaj en sonuncudur
        if last_msg:
            # Küçük bir özet döndür
            return {
                'text': last_msg.text[:50] if last_msg.text else f"[{last_msg.file_type.capitalize()}]",
                'timestamp': last_msg.timestamp,
                'sender': last_msg.sender.username
            }
        return None

    def create(self, validated_data):
        participant_ids = validated_data.pop('participant_ids', [])
        participant_emails = validated_data.pop('participant_emails', [])
        # Geçerli kullanıcıyı otomatik olarak katılımcı yap
        current_user = self.context['request'].user

        participants_to_add = set([current_user.id])  # Mevcut kullanıcıyı ekle
        participants_to_add.update(participant_ids)

        if participant_emails:
            # Email ile kullanıcıları bul
            found_users = User.objects.filter(email__in=participant_emails)
            if len(found_users) != len(participant_emails):
                # İsteğe bağlı: Bulunamayan e-postalar için hata döndür
                pass
            participants_to_add.update(found_users.values_list('id', flat=True))

        # Aynı katılımcılarla zaten bir oda var mı kontrol et (2 kişilik sohbetler için)
        # Bu kısım daha karmaşık senaryolar için geliştirilebilir
        if len(participants_to_add) == 2:
            existing_chat = ChatRoom.objects.annotate(
                num_participants=models.Count('participants')
            ).filter(
                num_participants=2
            ).filter(
                participants__id__in=list(participants_to_add)
            ).annotate(
                match_count=models.Count('participants', filter=models.Q(participants__id__in=list(participants_to_add)))
            ).filter(match_count=2).first()

            if existing_chat:
                return existing_chat  # Var olan sohbeti döndür

        chat_room = ChatRoom.objects.create(**validated_data)
        chat_room.participants.set(list(participants_to_add))
        return chat_room
# --- YENİ: Genel Anahtar Güncelleme Serializer ---
class ProfilePublicKeySerializer(serializers.ModelSerializer):
    public_key = serializers.CharField(required=True, allow_blank=False)

    class Meta:
        model = Profile
        fields = ('public_key',)

    def validate_public_key(self, value):
        # Burada basit bir format kontrolü yapılabilir (örn: uzunluk, base64 kontrolü)
        # Şimdilik sadece boş olmadığını kontrol ediyoruz.
        if not value:
            raise serializers.ValidationError("Public key cannot be empty.")
        # Örnek: Base64 kontrolü (daha sağlam bir kontrol gerekebilir)
        import base64
        try:
             # Eğer Base64 ise decode etmeyi dene
             base64.b64decode(value, validate=True)
        except (TypeError, base64.binascii.Error):
             # Eğer Hex ise uzunluk kontrolü (libsodium pubkey genelde 32 byte -> 64 hex char)
             if not (len(value) == 64 and all(c in '0123456789abcdefABCDEF' for c in value)):
                 raise serializers.ValidationError("Invalid public key format. Expected Base64 or Hex.")
        return value