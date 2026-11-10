from django.contrib import admin

# Register your models here.
# chat_api/admin.py
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User
from .models import ChatRoom, Message, Profile # Profile eklendi

# Profile modelini User adminine inline olarak ekleyelim
class ProfileInline(admin.StackedInline):
    model = Profile
    can_delete = False
    verbose_name_plural = 'Profile'
    fk_name = 'user'

class UserAdmin(BaseUserAdmin):
    inlines = (ProfileInline,)

# Mevcut User adminini kaldırıp yenisini kaydedelim
admin.site.unregister(User)
admin.site.register(User, UserAdmin)

@admin.register(ChatRoom)
class ChatRoomAdmin(admin.ModelAdmin):
    list_display = ('id', 'get_participant_names', 'created_at')
    filter_horizontal = ('participants',) # Katılımcıları seçmeyi kolaylaştırır

    def get_participant_names(self, obj):
        return ", ".join([p.username for p in obj.participants.all()])
    get_participant_names.short_description = 'Participants'


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ('id', 'sender', 'chat_room', 'file_type', 'timestamp', 'text_preview')
    list_filter = ('file_type', 'timestamp', 'chat_room')
    search_fields = ('text', 'sender__username') # text alanı artık şifreli

    def text_preview(self, obj):
        if obj.text:
            # Artık şifreli olduğu için sadece var/yok veya ilk birkaç karakteri gösterelim
            return f"(Encrypted - {len(obj.text)} chars)"
        return "N/A"
    text_preview.short_description = 'Text Content'

# Profile modelini ayrıca görmek için (opsiyonel)
@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'public_key_present')
    search_fields = ('user__username',)

    def public_key_present(self, obj):
        return bool(obj.public_key)
    public_key_present.boolean = True
    public_key_present.short_description = 'Has Public Key?'