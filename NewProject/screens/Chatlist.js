import React, { useState, useEffect, useContext, useCallback } from "react";
import { Text, View, FlatList, RefreshControl, ActivityIndicator } from "react-native"; // FlatList, RefreshControl, ActivityIndicator eklendi
import { List, Avatar, Divider, FAB, Portal, Dialog, Button, TextInput, Subheading } from "react-native-paper";
// --- Firebase import'u kaldırıldı ---
// import firebase from "firebase/compat/app";
import { useNavigation, useFocusEffect } from "@react-navigation/native"; // useFocusEffect eklendi

// --- Gerekli importlar ---
import api from '../utils/api'; // api.js yolunu doğrulayın
import { useAuth } from '../context/AuthContext'; // AuthContext yolunu doğrulayın

const ChatList = () => {
    const navigation = useNavigation();
    const { user, isLoading: authLoading } = useAuth(); // Mevcut kullanıcıyı ve auth yüklenme durumunu al

    const [chats, setChats] = useState([]);
    const [chatLoading, setChatLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false); // Pull-to-refresh için
    const [error, setError] = useState('');

    const [isDialogVisible, setIsDialogVisible] = useState(false);
    const [userEmail, setUserEmail] = useState(""); // Yeni sohbet için girilen email
    const [createChatLoading, setCreateChatLoading] = useState(false);
    const [createChatError, setCreateChatError] = useState('');

    // Sohbetleri API'den çeken fonksiyon
    const fetchChats = useCallback(async () => {
        if (!user) return; // Kullanıcı bilgisi henüz yoksa bekleyelim
        console.log('Fetching chats...');
        setChatLoading(true);
        setError('');
        try {
            const response = await api.get('/chats/');
            setChats(response.data || []); // Gelen veriyi state'e ata
            console.log('Chats fetched:', response.data.length);
        } catch (e) {
            console.error('Failed to fetch chats:', e.response?.data || e.message);
            setError("Sohbetler yüklenirken bir hata oluştu.");
            setChats([]); // Hata durumunda listeyi boşalt
        } finally {
            setChatLoading(false);
        }
    }, [user]); // User değiştiğinde tekrar çalışır (login/logout)

    // Ekran odakta olduğunda sohbetleri çek
    useFocusEffect(
        useCallback(() => {
            fetchChats();
        }, [fetchChats]) // fetchChats fonksiyonu değiştiğinde tekrar çalışır
    );

    // Pull-to-refresh fonksiyonu
    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchChats();
        setRefreshing(false);
    }, [fetchChats]);

    // Yeni sohbet oluşturma fonksiyonu
    const createChat = async () => {
        if (!userEmail || !user) return;
        setCreateChatLoading(true);
        setCreateChatError('');
        try {
            console.log(`Creating chat with email: ${userEmail}`);
            // --- Firebase yerine API çağrısı ---
            const response = await api.post('/chats/', {
                participant_emails: [userEmail], // Serializer bu alanı bekliyor
            });

             // Başarılı (yeni veya mevcut sohbet döndü)
             console.log('Chat created/found:', response.data);
             setIsDialogVisible(false);
             setUserEmail(""); // Input'u temizle
             setCreateChatLoading(false);
             // Yeni/mevcut sohbete yönlendir
             navigation.navigate("Chat", { chatId: response.data.id });

        } catch (e) {
            setCreateChatLoading(false);
            console.error('Failed to create chat:', e.response?.data || e.message);
             if (e.response && e.response.status === 400 && e.response.data) {
                 // Backend'den gelen spesifik validasyon hatası olabilir
                 // Örnek: E-posta bulunamadı veya format hatası
                 // Bu hataları daha detaylı işleyebilirsiniz. Şimdilik genel mesaj:
                  const errorData = e.response.data;
                  let errorMessage = "Sohbet oluşturulamadı.";
                  if (errorData.participant_emails) {
                      errorMessage = `Kullanıcı bulunamadı veya geçersiz e-posta: ${userEmail}`;
                  } else if (errorData.detail) {
                      errorMessage = errorData.detail;
                  }
                  setCreateChatError(errorMessage);
             } else {
                 setCreateChatError("Sohbet oluşturulurken bir hata oluştu.");
             }
        }
    };

    // Avatar için baş harfleri alan fonksiyon
    const getInitials = (name) => {
        if (!name) return "?";
        return name.split(' ').reduce((prev, current) => prev + (current[0] || ''), "").substring(0, 2).toUpperCase();
    };

    // Liste elemanını render eden fonksiyon (FlatList için)
    const renderItem = ({ item: chat }) => {
         // Diğer katılımcıyı bul
         const otherParticipant = chat.participants?.find(p => p.id !== user?.id);
         const participantName = otherParticipant?.name || otherParticipant?.username || "Bilinmeyen Kullanıcı";
         const lastMessageText = chat.last_message?.text || (chat.last_message ? `[${chat.last_message.sender} bir ${chat.last_message.text.includes('Audio') ? 'ses' : chat.last_message.text.includes('Image') ? 'resim' : chat.last_message.text.includes('Video') ? 'video' : 'dosya'} gönderdi]` : "Henüz mesaj yok");


        return (
             <React.Fragment key={chat.id}>
                 <List.Item
                     title={participantName}
                     description={lastMessageText}
                     descriptionNumberOfLines={1} // Açıklamanın tek satırda kalmasını sağla
                     left={() => (
                         <Avatar.Text
                             label={getInitials(participantName)}
                             size={56}
                         />
                     )}
                     onPress={() => navigation.navigate('Chat', { chatId: chat.id })}
                 />
                 <Divider inset />
             </React.Fragment>
         );
     };

     // Yükleme veya hata durumlarını ele al
     if (authLoading) {
         return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" /></View>;
     }
     if (chatLoading && !refreshing) {
          return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" /></View>;
      }
     if (error) {
          return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><Text>{error}</Text><Button onPress={fetchChats}>Tekrar Dene</Button></View>;
      }


    return (
        <View style={{ flex: 1 }}>
            <FlatList
                 data={chats}
                 renderItem={renderItem}
                 keyExtractor={(item) => item.id.toString()}
                 ListEmptyComponent={<View style={{flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 50}}><Text>Henüz sohbetiniz yok.</Text></View>} // Liste boşken gösterilecek
                 refreshControl={ // Pull-to-refresh
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
            />

            {/* Yeni Sohbet Dialog */}
            <Portal>
                <Dialog visible={isDialogVisible} onDismiss={() => setIsDialogVisible(false)}>
                    <Dialog.Title>Yeni Sohbet Başlat</Dialog.Title>
                    <Dialog.Content>
                         {!!createChatError && <Subheading style={{ color: 'red', marginBottom: 10 }}>{createChatError}</Subheading>}
                        <TextInput
                            label="Kullanıcı E-postası Girin" // Label güncellendi
                            value={userEmail}
                            onChangeText={text => setUserEmail(text)}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            disabled={createChatLoading}
                        />
                    </Dialog.Content>
                    <Dialog.Actions>
                        <Button onPress={() => setIsDialogVisible(false)} disabled={createChatLoading}>İptal</Button>
                        <Button onPress={createChat} loading={createChatLoading} disabled={createChatLoading}>Oluştur</Button>
                    </Dialog.Actions>
                </Dialog>
            </Portal>

            {/* Yeni Sohbet FAB */}
            <FAB
                icon="plus"
                style={{ position: 'absolute', bottom: 16, right: 16 }}
                onPress={() => { setIsDialogVisible(true); setCreateChatError(''); }} // Dialog açılırken hatayı temizle
            />
        </View>
    );
};

export default ChatList;