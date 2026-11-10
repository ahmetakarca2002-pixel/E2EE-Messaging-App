# chat_api/models.py
from django.db import models
from django.contrib.auth.models import User # Django'nun User modelini kullanıyoruz
from django.db.models.signals import post_save
from django.dispatch import receiver
import json

# Kullanıcının E2EE public key'ini saklamak için User modelini genişletmek yerine
# ayrı bir profil modeli kullanmak daha temiz olabilir.
class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    # Public key'i JWK formatında saklamak iyi bir pratiktir.
    public_key_jwk = models.TextField(blank=True, null=True, help_text="User's E2EE public key in JWK format")

    def __str__(self):
        return f"{self.user.username}'s Profile"

# User oluşturulduğunda otomatik olarak UserProfile oluştur
@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        UserProfile.objects.create(user=instance)

@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    try:
        instance.profile.save()
    except UserProfile.DoesNotExist:
         # Eğer bir şekilde profil yoksa (eski kullanıcılar vb.), oluştur.
         UserProfile.objects.create(user=instance)


class Chat(models.Model):
    participants = models.ManyToManyField(User, related_name='chats')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Chat ({self.pk}) - Participants: {', '.join([p.username for p in self.participants.all()])}"

    def get_last_message(self):
         # Performansı artırmak için prefetch_related ile kullanılabilir
         return self.messages.order_by('-timestamp').first()


class Message(models.Model):
    chat = models.ForeignKey(Chat, related_name='messages', on_delete=models.CASCADE)
    sender = models.ForeignKey(User, related_name='sent_messages', on_delete=models.CASCADE)
    # Şifreli metin veya dosya türü bilgisi
    file_type = models.CharField(max_length=50, default='encrypted_text', help_text="e.g., encrypted_text, image, audio, video, encrypted_image...")
    # E2EE metin mesajları için şifreli içerik
    ciphertext = models.TextField(blank=True, null=True, help_text="Encrypted message content for E2EE text")
    # Şifresiz (veya ilerde şifreli) dosya yüklemeleri için
    file = models.FileField(upload_to='chat_files/', blank=True, null=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    # Mesaj yanıtları için
    reply_to = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL, related_name='replies')
    # Tepkileri JSON olarak saklama (basitlik için)
    # Anahtar: emoji, Değer: user_id listesi
    reactions = models.JSONField(default=dict, blank=True)
    # Okundu bilgisi (ManyToManyField daha ölçeklenebilir olabilir, ama başlangıç için JSON)
    # Anahtar: user_id, Değer: timestamp (veya True)
    read_by = models.JSONField(default=dict, blank=True) # Frontend'deki 'read_statuses' yerine basit JSON

    def __str__(self):
        return f"Message {self.pk} by {self.sender.username} in Chat {self.chat.pk}"

    # Reaksiyon ekleme/kaldırma yardımcı metodu
    def update_reaction(self, user_id, emoji):
        user_id_str = str(user_id)
        current_reactions = self.reactions.copy() if isinstance(self.reactions, dict) else {}

        if emoji not in current_reactions:
            current_reactions[emoji] = []

         # Kullanıcı zaten bu emojiyi verdiyse kaldır, vermediyse ekle
        if user_id_str in current_reactions[emoji]:
             current_reactions[emoji].remove(user_id_str)
             # Eğer emoji listesi boşaldıysa, emojiyi tamamen kaldır
             if not current_reactions[emoji]:
                 del current_reactions[emoji]
             action = "removed"
        else:
             current_reactions[emoji].append(user_id_str)
             action = "added"

        self.reactions = current_reactions
        self.save(update_fields=['reactions'])
        return action

    # Okundu bilgisi ekleme yardımcı metodu
    def mark_as_read(self, user_id):
         user_id_str = str(user_id)
         current_read_by = self.read_by.copy() if isinstance(self.read_by, dict) else {}
         if user_id_str not in current_read_by:
             current_read_by[user_id_str] = True # Veya zaman damgası: timezone.now().isoformat()
             self.read_by = current_read_by
             self.save(update_fields=['read_by'])
             return True # Okundu olarak işaretlendi
         return False # Zaten okunmuştu