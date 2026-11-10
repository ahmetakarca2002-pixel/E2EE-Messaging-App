from django.apps import AppConfig
# profiles/apps.py

class ChatApiConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'chat_api'
class ProfilesConfig(AppConfig):
    name = 'profiles'

    def ready(self):
        import chat_api.signals
