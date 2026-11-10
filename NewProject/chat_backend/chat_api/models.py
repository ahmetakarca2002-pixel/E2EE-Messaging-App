# chat_api/models.py

from django.db import models
from django.contrib.auth.models import User # Django'nun hazır kullanıcı modeli

class ChatRoom(models.Model):
    name = models.CharField(max_length=255, blank=True, null=True) # İsteğe bağlı oda adı
    participants = models.ManyToManyField(User, related_name='chat_rooms')
    created_at = models.DateTimeField(auto_now_add=True)

    # ... (varsa diğer alanlar: current_song vs.) ...

    def __str__(self):
        # Oda adını veya katılımcıları gösterelim
        participant_names = ', '.join(p.username for p in self.participants.all()[:2]) # İlk 2 katılımcıyı göster
        display_name = self.name if self.name else f"Chat with {participant_names}"
        if self.participants.count() > 2:
            display_name += f" and {self.participants.count() - 2} others"
        return f"ChatRoom {self.id}: {display_name}"


class Message(models.Model):
    # Dosya türleri için seçenekler
    FILE_TYPES = (
        ('text', 'Text'),   # Şifrelenmiş metin veya şifrelenmemiş sistem mesajları
        ('audio', 'Audio'), # Dosyalar şifrelenmeyecek (bu örnekte)
        ('image', 'Image'), # Dosyalar şifrelenmeyecek (bu örnekte)
        ('video', 'Video'), # Dosyalar şifrelenmeyecek (bu örnekte)
        ('file', 'Other File'), # Dosyalar şifrelenmeyecek (bu örnekte)
        # E2EE için özel tipler eklenebilir, örn: 'encrypted_text'
    )

    chat_room = models.ForeignKey(ChatRoom, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sent_messages')

    # --- DEĞİŞİKLİK ---
    # Bu alan artık Base64 kodlanmış şifreli metni (ciphertext) saklayacak.
    # Düz metin mesajları bu alanda saklanmayacak (E2EE uygulandığında).
    text = models.TextField(blank=True, null=True)
    # ------------------

    file = models.FileField(upload_to='chat_files/', blank=True, null=True) # Dosya olmayabilir (metin varsa)
    reactions = models.JSONField(default=dict, blank=True)
    file_type = models.CharField(
        max_length=20, # 'encrypted_text' gibi daha uzun tipler için
        choices=FILE_TYPES,
        null=True,
        blank=True
    )
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-timestamp'] # Mesajları en yeniden eskiye sırala

    def __str__(self):
        # Mesaj içeriğine göre daha açıklayıcı bir temsil
        content_desc = ""
        if self.file_type == 'text' or self.text: # Artık şifreli olsa da varlığını kontrol edebiliriz
             content_desc += f"Text: (Encrypted)" # Şifreli olduğunu belirt
        if self.file:
            if content_desc: content_desc += " | "
            content_desc += f"File Type: {self.get_file_type_display() or 'Unknown'}"

        if not content_desc:
             content_desc = "[Empty Message]"

        return f"Msg ({self.id}) from {self.sender.username} in Room {self.chat_room.id} ({content_desc})"

# --- YENİ: Profil Modeli (Adım 2 için hazırlık) ---
class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    # Genel anahtarı Base64 veya Hex formatında saklamak için TextField
    public_key = models.TextField(blank=True, null=True, help_text="Base64 encoded public encryption key")

    def __str__(self):
        return f"{self.user.username}'s Profile"
# ---------------------------------------------------