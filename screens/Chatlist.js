import React, { useState, useEffect, useContext, useCallback } from "react";
import { View, FlatList, RefreshControl, ActivityIndicator, StyleSheet } from "react-native";
import {
    List,
    Avatar,
    Divider,
    FAB,
    Portal,
    Dialog,
    Button,
    TextInput,
    Subheading,
    Appbar, // Eklendi
    useTheme, // Eklendi
    Text, // react-native yerine react-native-paper'dan Text kullanmak daha tutarlı olabilir
    Caption // Daha küçük metinler için
} from "react-native-paper";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

// --- Stil Tanımlamaları ---
const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    contentContainer: {
        flexGrow: 1, // İçeriğin tüm alanı kaplamasını sağlar (özellikle boş liste durumu için)
        paddingBottom: 80, // FAB'ın üzerine gelmemesi için altta boşluk
    },
    fab: {
        position: 'absolute',
        margin: 16,
        right: 0,
        bottom: 0,
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    emptyListText: {
        marginTop: 10,
        textAlign: 'center',
    },
    dialogTextInput: {
        marginBottom: 10, // Input altında boşluk
    },
    dialogErrorText: {
        marginBottom: 10,
        textAlign: 'center',
    },
    listItemContainer: {
        // Gerekirse her bir öğe için ekstra stil
        // backgroundColor: 'white', // Opsiyonel: Arka planı farklılaştırmak için
    },
    listItemContent: {
       marginLeft: 8, // Avatar ile metin arasına biraz boşluk
    },
     listItemRightContainer: {
        justifyContent: 'center', // Zamanı dikeyde ortala
        alignItems: 'flex-end', // Sağa yasla
        marginRight: 5, // Kenardan boşluk
        marginLeft: 10, // Açıklamadan boşluk
    },
    listItemTimestamp: {
        fontSize: 12,
    },
    // --- Okunmamış mesajlar için stil (backend desteği gerektirir) ---
    // unreadIndicator: {
    //     width: 10,
    //     height: 10,
    //     borderRadius: 5,
    //     marginTop: 5,
    // },
    // descriptionUnread: {
    //     fontWeight: 'bold',
    // }
});

const ChatList = () => {
    const navigation = useNavigation();
    const { user, isLoading: authLoading } = useAuth();
    const theme = useTheme(); // Temayı al

    // State'ler aynı kalıyor
    const [chats, setChats] = useState([]);
    const [chatLoading, setChatLoading] = useState(true); // Başlangıçta true
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [isDialogVisible, setIsDialogVisible] = useState(false);
    const [userEmail, setUserEmail] = useState("");
    const [createChatLoading, setCreateChatLoading] = useState(false);
    const [createChatError, setCreateChatError] = useState('');

    // Fonksiyonlar (fetchChats, onRefresh, createChat) aynı kalıyor...
     const fetchChats = useCallback(async () => {
        if (!user) return;
        console.log('Fetching chats...');
         // Yenileme değilse ve ilk yükleme ise loading göster
        if (!refreshing) {
            setChatLoading(true);
        }
        setError('');
        try {
            const response = await api.get('/chats/');
            // Son mesaja göre sıralama (isteğe bağlı, backend yapmıyorsa)
            const sortedChats = (response.data || []).sort((a, b) => {
                const timeA = a.last_message?.timestamp ? new Date(a.last_message.timestamp) : new Date(0);
                const timeB = b.last_message?.timestamp ? new Date(b.last_message.timestamp) : new Date(0);
                return timeB - timeA; // En yeni en üste
            });
            setChats(sortedChats);
            console.log('Chats fetched:', sortedChats.length);
        } catch (e) {
            console.error('Failed to fetch chats:', e.response?.data || e.message);
            setError("Sohbetler yüklenirken bir hata oluştu.");
            setChats([]);
        } finally {
            setChatLoading(false);
            if (refreshing) {
                 setRefreshing(false); // Yenileme durumunu kapat
            }
        }
    }, [user, refreshing]); // refreshing bağımlılıklara eklendi

     useFocusEffect(
        useCallback(() => {
            fetchChats();
            // Ekrandan çıkıldığında bir temizlik fonksiyonu gerekirse buraya eklenebilir
            // return () => console.log('ChatList unfocused');
        }, [fetchChats])
    );

    const onRefresh = useCallback(async () => {
        setRefreshing(true); // Yenileme başladığında state'i set et
        // fetchChats zaten refreshing state'ini kontrol ediyor
        await fetchChats();
        // fetchChats içindeki finally bloğu refreshing'i false yapacak
    }, [fetchChats]);


    const createChat = async () => {
        if (!userEmail || !user) return;
        setCreateChatLoading(true);
        setCreateChatError('');
        try {
            console.log(`Creating chat with email: ${userEmail}`);
            const response = await api.post('/chats/', {
                participant_emails: [userEmail],
            });
            console.log('Chat created/found:', response.data);
            setIsDialogVisible(false);
            setUserEmail("");
            setCreateChatLoading(false);
            navigation.navigate("Chat", { chatId: response.data.id });
            // Başarı sonrası listeyi hemen güncellemek için:
            fetchChats(); // Ya da yeni sohbeti mevcut listeye ekle: setChats(prev => [response.data, ...prev])

        } catch (e) {
            setCreateChatLoading(false);
            console.error('Failed to create chat:', e.response?.data || e.message);
             if (e.response && e.response.status === 400 && e.response.data) {
                const errorData = e.response.data;
                 let errorMessage = "Sohbet oluşturulamadı.";
                 if (errorData.participant_emails && Array.isArray(errorData.participant_emails)) {
                    // Birden fazla hata mesajı olabilir, ilkini alalım
                    errorMessage = errorData.participant_emails[0] || `Kullanıcı bulunamadı veya geçersiz: ${userEmail}`;
                } else if (errorData.detail) {
                    errorMessage = errorData.detail;
                } else if (typeof errorData === 'string') { // Bazen sadece string dönebilir
                     errorMessage = errorData;
                 }
                setCreateChatError(errorMessage);
            } else if (e.response && e.response.status === 404) { // Belki kullanıcı bulunamadı hatası 404 döner
                 setCreateChatError(`Kullanıcı bulunamadı: ${userEmail}`);
            } else {
                 setCreateChatError("Sohbet oluşturulurken bir hata oluştu.");
            }
        }
    };

    const getInitials = (name) => {
        if (!name) return "?";
        return name.split(' ').reduce((prev, current) => prev + (current[0] || ''), "").substring(0, 2).toUpperCase();
    };

    // Zaman formatlama fonksiyonu (örnek)
    const formatTimestamp = (timestamp) => {
        if (!timestamp) return null;
        const messageDate = new Date(timestamp);
        const now = new Date();
        const diffTime = Math.abs(now - messageDate);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            // Bugün: Saati göster HH:MM formatında
            return messageDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        } else if (diffDays === 1) {
            // Dün
            return "Dün";
        } else {
            // Daha eski: Tarihi göster DD/MM/YYYY formatında
            return messageDate.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        }
    };

    const renderItem = ({ item: chat }) => {
        const otherParticipant = chat.participants?.find(p => p.id !== user?.id);
        const participantName = otherParticipant?.name || otherParticipant?.username || "Bilinmeyen Kullanıcı";
        const lastMessage = chat.last_message;
        const lastMessageText = lastMessage?.text || (lastMessage ? `(${lastMessage.message_type || 'Mesaj'})` : "Henüz mesaj yok");
        const messageTimestamp = formatTimestamp(lastMessage?.timestamp);

        // --- Okunmamış mesaj kontrolü (backend verisi gerektirir) ---
        // const isUnread = chat.unread_count > 0; // Örneğin

        return (
            <View style={[styles.listItemContainer, { backgroundColor: theme.colors.surface }]}>
                <List.Item
                    title={participantName}
                    description={lastMessageText}
                    descriptionNumberOfLines={1}
                    titleStyle={{ fontWeight: '600', color: theme.colors.onSurface }} // Kalın ve tema rengi
                    descriptionStyle={{ color: theme.colors.onSurfaceVariant }} // Biraz daha soluk renk
                     // --- Okunmamış mesaj stilini uygula ---
                    // descriptionStyle={[
                    //     { color: theme.colors.onSurfaceVariant },
                    //     isUnread && styles.descriptionUnread,
                    //     isUnread && { color: theme.colors.primary } // Veya farklı bir renk
                    // ]}
                    style={styles.listItemContent}
                    left={() => (
                        <Avatar.Text
                            label={getInitials(participantName)}
                            size={50} // Biraz küçültüldü
                            style={{ backgroundColor: theme.colors.primaryContainer }} // Avatar arkaplanı
                            labelStyle={{ color: theme.colors.onPrimaryContainer, fontSize: 18 }} // Baş harf rengi
                        />
                    )}
                    right={() => (
                        <View style={styles.listItemRightContainer}>
                            {messageTimestamp && <Caption style={[styles.listItemTimestamp, { color: theme.colors.onSurfaceVariant }]}>{messageTimestamp}</Caption>}
                             {/* --- Okunmamış mesaj göstergesi --- */}
                             {/* {isUnread && <View style={[styles.unreadIndicator, { backgroundColor: theme.colors.primary }]} />} */}
                         </View>
                    )}
                    onPress={() => navigation.navigate('Chat', { chatId: chat.id })}
                />
                <Divider inset />
            </View>
        );
    };

    // --- Yükleme, Hata ve Boş Durumları ---
    if (authLoading) {
        return <View style={[styles.centerContainer, { backgroundColor: theme.colors.background }]}><ActivityIndicator size="large" color={theme.colors.primary} /></View>;
    }
    // Sadece ilk yükleme için tam ekran spinner gösterelim, yenileme sırasında FlatList'in kendi göstergesi yeterli
    if (chatLoading && chats.length === 0 && !refreshing) {
         return <View style={[styles.centerContainer, { backgroundColor: theme.colors.background }]}><ActivityIndicator size="large" color={theme.colors.primary} /></View>;
    }
    if (error && chats.length === 0) { // Sadece liste boşken tam ekran hata göster
        return (
            <View style={[styles.centerContainer, { backgroundColor: theme.colors.background }]}>
                 <Text style={{ color: theme.colors.error }}>{error}</Text>
                <Button onPress={fetchChats} mode="contained" style={{marginTop: 15}}>Tekrar Dene</Button>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>

            <FlatList
                data={chats}
                renderItem={renderItem}
                keyExtractor={(item) => item.id.toString()}
                contentContainerStyle={styles.contentContainer}
                ListEmptyComponent={ // Liste boşken gösterilecek bileşen
                     !chatLoading && !error ? ( // Sadece yüklenmiyorsa ve hata yoksa "boş" mesajı göster
                        <View style={styles.centerContainer}>
                             {/* İsteğe bağlı: Bir ikon veya resim eklenebilir */}
                             {/* <Avatar.Icon icon="message-outline" size={80} style={{ backgroundColor: 'transparent', marginBottom: 10 }} color={theme.colors.onSurfaceVariant} /> */}
                            <Text style={[styles.emptyListText, { color: theme.colors.onSurfaceVariant }]}>
                                Henüz aktif bir sohbetiniz yok.{"\n"}Yeni bir sohbet başlatmak için + butonuna dokunun.
                            </Text>
                         </View>
                    ) : null // Yüklenirken veya hata varken boş component gösterme
                 }
                refreshControl={ // Pull-to-refresh
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        colors={[theme.colors.primary]} // Spinner rengi
                        tintColor={theme.colors.primary} // iOS için spinner rengi
                    />
                }
                ItemSeparatorComponent={() => <View style={{height: 1, backgroundColor: theme.colors.surfaceVariant, opacity: 0.5}} />} // Divider yerine ince ayırıcı (isteğe bağlı)
                // Divider component'i zaten kullanılıyordu, ItemSeparatorComponent gereksiz olabilir. Yukarıdaki Divider'ı kaldırıp bunu kullanabilirsiniz.
            />

            {/* Yeni Sohbet Dialog */}
            <Portal>
                <Dialog visible={isDialogVisible} onDismiss={() => {setIsDialogVisible(false); setCreateChatError(''); setUserEmail('');}}>
                    <Dialog.Title style={{color: theme.colors.onSurface}}>Yeni Sohbet Başlat</Dialog.Title>
                    <Dialog.Content>
                         {!!createChatError && <Subheading style={[styles.dialogErrorText, { color: theme.colors.error }]}>{createChatError}</Subheading>}
                        <TextInput
                            label="Kullanıcı E-postası"
                            value={userEmail}
                            onChangeText={text => setUserEmail(text)}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            disabled={createChatLoading}
                            mode="outlined" // Daha belirgin input
                            style={styles.dialogTextInput}
                            theme={{ colors: { primary: theme.colors.primary } }} // Input focus rengi
                        />
                    </Dialog.Content>
                    <Dialog.Actions>
                        <Button onPress={() => {setIsDialogVisible(false); setCreateChatError(''); setUserEmail('');}} disabled={createChatLoading} textColor={theme.colors.secondary}>İptal</Button>
                        <Button onPress={createChat} loading={createChatLoading} disabled={createChatLoading || !userEmail} mode="contained">Oluştur</Button>
                    </Dialog.Actions>
                </Dialog>
            </Portal>

            {/* Yeni Sohbet FAB */}
            <FAB
                icon="plus"
                style={[styles.fab, { backgroundColor: theme.colors.primary }]} // Ana tema rengi
                color={theme.colors.onPrimary} // İkon rengi
                onPress={() => { setIsDialogVisible(true); setCreateChatError(''); }}
                visible={!isDialogVisible} // Dialog açıkken FAB'ı gizle
                // loading={chatLoading && chats.length === 0} // İsteğe bağlı: İlk yüklemede FAB'ı gizle veya loading göster
            />
        </View>
    );
};

export default ChatList;