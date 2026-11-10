// Chat.js (E2EE Entegrasyonu ile Tamamlanmış Hali)

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Button, // Button importu kalmış, kullanılmıyorsa kaldırılabilir
  Modal,
  Pressable,
  Clipboard,
  Animated,
  Dimensions
} from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';

// --- Context, API ve Crypto Importları ---
import { useAuth } from '../context/AuthContext'; // AuthContext dosya yolunuzu kontrol edin
import api from '../utils/api'; // api dosya yolunuzu kontrol edin
import {
    encryptMessage,
    decryptMessage,
    getPrivateKeyFromStore,
    // getPublicKeyFromStore, // Kendi public key'imizi store'dan okumaya gerek kalmadı (user objesinde var)
    initializeSodium,
} from '../utils/crypto'; // crypto.js yolunu kontrol edin
// ------------------------------------

// API ve Medya URL'leri (Kendi URL'lerinizle değiştirin)
const API_BASE_URL = 'https://9a1b-78-182-149-120.ngrok-free.app/api';
const MEDIA_BASE_URL = 'https://9a1b-78-182-149-120.ngrok-free.app';
const AVAILABLE_REACTIONS = ['🎶', '👍', '❤️', '😂', '😢', '🙏'];
const { width: screenWidth } = Dimensions.get('window');

const Chat = () => {
  const route = useRoute();
  const { user, keysReady, isLoading: authLoading } = useAuth(); // keysReady durumunu al
  const { chatId } = route.params;
  const navigation = useNavigation();

  // --- State Değişkenleri ---
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [chatRoomInfo, setChatRoomInfo] = useState(null); // Sohbet odası bilgilerini tutmak için

  // Modal, Recording, Audio state'leri
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioPermissionStatus, setAudioPermissionStatus] = useState(null);
  const [currentSound, setCurrentSound] = useState(null);
  const [currentlyPlayingUri, setCurrentlyPlayingUri] = useState(null);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribedText, setTranscribedText] = useState('');
  const [transcriptionError, setTranscriptionError] = useState('');

  // Music Panel state'leri
  const [isMusicPanelOpen, setIsMusicPanelOpen] = useState(false);
  const [musicPanelState, setMusicPanelState] = useState('search');
  const [musicSearchQuery, setMusicSearchQuery] = useState('');
  const [currentPlayingSong, setCurrentPlayingSong] = useState(null);
  const [isMusicSearchLoading, setIsMusicSearchLoading] = useState(false);
  const animatedWidth = useRef(new Animated.Value(50)).current;

  // --- E2EE için State'ler ---
  const [recipientKeys, setRecipientKeys] = useState({}); // userId: publicKeyBase64
  const [decryptedMessages, setDecryptedMessages] = useState({}); // messageId: decryptedText
  const [decryptionErrors, setDecryptionErrors] = useState({}); // messageId: error string
  const [decryptingMessages, setDecryptingMessages] = useState({}); // messageId: true/false
  const [myPrivateKey, setMyPrivateKey] = useState(null); // Kendi private key'imiz (Base64)
  // ---------------------------------

  const flatListRef = useRef(null);

  // --- Sodium Başlatma ---
  useEffect(() => {
    initializeSodium();
  }, []);

  // --- Kendi Private Key'imizi Yükle ---
  useEffect(() => {
    const loadMyKey = async () => {
      if (keysReady) {
        const key = await getPrivateKeyFromStore();
        if (key) {
             setMyPrivateKey(key);
             console.log('[Chat] My private key loaded.');
        } else {
             console.error("[Chat] Keys are marked as ready, but private key couldn't be retrieved from store!");
             setError("Kriptografik anahtarınız yüklenemedi. Mesajlar şifrelenemez/çözülemez.");
             setMyPrivateKey(null);
        }
      } else {
        console.log("[Chat] E2EE keys are not ready yet.");
        setMyPrivateKey(null);
      }
    };
    loadMyKey();
  }, [keysReady]);


  // --- Alıcıların Public Key'lerini Çekme ---
  const fetchRecipientKeys = useCallback(async (participants) => {
    if (!user || !participants) return;
    const otherParticipants = participants.filter(p => p.id !== user.id);
    if (otherParticipants.length === 0) return; // Başka katılımcı yoksa (kendisiyle sohbet?)

    console.log('[Chat] Checking/Fetching recipient public keys...');
    const currentKeys = { ...recipientKeys }; // Mevcut anahtarları kopyala
    let keysChanged = false;
    let fetchNeeded = false;
    const promises = [];

    otherParticipants.forEach(p => {
      const existingKey = currentKeys[p.id];
      const keyInData = p.public_key; // ChatRoomSerializer'dan gelen

      if (keyInData && existingKey !== keyInData) {
         console.log(`[Chat] Updating key for ${p.username} from participant data.`);
         currentKeys[p.id] = keyInData;
         keysChanged = true;
      } else if (!existingKey && !keyInData) {
         // Ne state'te ne de veride anahtar yoksa API'den çekmeyi dene
         console.log(`[Chat] Key for ${p.username} not found. Scheduling fetch.`);
         fetchNeeded = true;
         promises.push(
           api.get(`/users/${p.id}/public_key/`)
             .then(response => ({ userId: p.id, key: response.data?.public_key, username: response.data?.username }))
             .catch(err => {
               console.error(`[Chat] Failed to fetch public key for user ${p.id}:`, err.response?.data || err.message);
               return { userId: p.id, key: null, username: p.username }; // Hata durumunda null dön
             })
         );
      }
    });

    if (promises.length > 0) {
         try {
             const results = await Promise.all(promises);
             results.forEach(result => {
               if (result.key) {
                 currentKeys[result.userId] = result.key;
                 keysChanged = true;
                 console.log(`[Chat] Fetched public key for ${result.username}.`);
               } else {
                    console.warn(`[Chat] Could not fetch public key for ${result.username}. E2EE might fail for this user.`);
                    // Anahtarı olmayan kullanıcı için state'e null veya özel bir değer atayabilirsiniz.
                    // currentKeys[result.userId] = 'FETCH_FAILED';
               }
             });
         } catch (error) {
           console.error('[Chat] Error fetching recipient keys batch:', error);
           setError("Bazı katılımcı anahtarları alınamadı.");
         }
    }

    if (keysChanged) {
      setRecipientKeys(currentKeys);
      console.log('[Chat] Recipient keys state updated:', currentKeys);
    } else if (!fetchNeeded) {
       console.log('[Chat] All necessary recipient keys were already available.');
    }
  }, [user, recipientKeys]); // recipientKeys'e bağımlılık önemli


  // --- Mesajları Çekme ve Şifre Çözmeyi Tetikleme ---
  const fetchMessages = useCallback(async (showLoading = true) => {
    if (!chatId) return;
    if (showLoading) setIsLoading(true);
    setError('');
    console.log(`[Chat] Fetching messages & chat info for ID: ${chatId}`);
    try {
      // Önce chat odası bilgisini al (katılımcılar ve anahtarları için)
      const chatRoomResponse = await api.get(`/chats/${chatId}/`);
      const roomData = chatRoomResponse.data;
      setChatRoomInfo(roomData); // Oda bilgisini state'e al
      if (roomData?.participants) {
        fetchRecipientKeys(roomData.participants); // Anahtarları çekmeyi tetikle
      } else {
        console.warn("[Chat] Could not get participants from chat room data.");
      }

      // Sonra mesajları çek
      const messagesResponse = await api.get(`/chats/${chatId}/messages/`);
      const fetchedMessages = messagesResponse.data || [];

      // Sadece yeni mesajları veya state'te olmayanları ekle/güncelle
      setMessages(prevMessages => {
          const existingIds = new Set(prevMessages.map(m => m.id));
          const newMessages = fetchedMessages.filter(fm => !existingIds.has(fm.id));
          // İsteğe bağlı: Mevcut mesajları güncellemek için (örn: tepkiler)
          // const updatedMessages = prevMessages.map(pm => fetchedMessages.find(fm => fm.id === pm.id) || pm);
          // return [...newMessages, ...updatedMessages].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // Sıralama önemli
          if (newMessages.length > 0) {
               return [...newMessages, ...prevMessages]; // Yeni mesajları başa ekle (ters sıralı olduğu için)
           }
           return prevMessages; // Değişiklik yoksa aynı state'i döndür
      });

      // Şifre çözme işlemi artık mesajlar render edilirken useEffect içinde yapılacak (aşağıda)

    } catch (e) {
      console.error('[Chat] Mesajlar/Oda Bilgisi çekilemedi:', e.response?.data || e.message);
      setError("Sohbet yüklenirken bir hata oluştu.");
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [chatId, fetchRecipientKeys]);


  // Ekran focuslandığında mesajları çek
  useFocusEffect(
    useCallback(() => {
      fetchMessages();
    }, [fetchMessages])
  );

  // --- Şifre Çözme Fonksiyonu ---
  // Bu fonksiyon artık doğrudan çağrılmayacak, MessageItem içinde kullanılacak.
  const decryptSingleMessage = useCallback(async (message) => {
    if (!message || !message.id || message.file_type !== 'encrypted_text' || !message.text) {
      return null; // Şifrelenmiş metin mesajı değilse null dön
    }
    if (decryptedMessages[message.id]) return decryptedMessages[message.id]; // Zaten çözülmüşse
    if (decryptionErrors[message.id]) throw new Error(decryptionErrors[message.id]); // Hata varsa fırlat
    if (decryptingMessages[message.id]) return null; // Hala çözülüyorsa null dön (veya özel bir durum)

    if (!myPrivateKey) throw new Error("Your encryption key is not available.");

    const senderId = message.sender?.id;
    const senderPublicKey = recipientKeys[senderId] || message.sender?.public_key;

    if (!senderPublicKey) throw new Error(`Encryption key for ${message.sender?.username || 'sender'} not found.`);

    try {
      setDecryptingMessages(prev => ({ ...prev, [message.id]: true }));
      const decrypted = await decryptMessage(message.text, senderPublicKey, myPrivateKey);
      setDecryptedMessages(prev => ({ ...prev, [message.id]: decrypted }));
      setDecryptingMessages(prev => ({ ...prev, [message.id]: false }));
      // Hata varsa temizle (başarılı oldu)
      if (decryptionErrors[message.id]) {
           setDecryptionErrors(prev => {
               const newState = {...prev};
               delete newState[message.id];
               return newState;
           });
      }
      return decrypted;
    } catch (error) {
      console.error(`[Chat] Decryption failed for message ${message.id}:`, error);
      setDecryptionErrors(prev => ({ ...prev, [message.id]: error.message || "Decryption failed" }));
      setDecryptingMessages(prev => ({ ...prev, [message.id]: false }));
      throw error; // Hatanın renderItem'a iletilmesi için fırlat
    }
  }, [myPrivateKey, recipientKeys, decryptedMessages, decryptionErrors, decryptingMessages]);


  // --- Metin Mesajı Gönderme (Şifreleyerek) ---
  const onSend = useCallback(async () => {
    const textToSend = messageText.trim();
    if (!textToSend || isSending || !chatId || isRecording) return;

    // --- E2EE Kontrolleri ---
    if (!keysReady || !myPrivateKey) {
      Alert.alert("Hata", "Kriptografik anahtarlarınız hazır değil. Mesaj gönderilemiyor.");
      return;
    }

    // Alıcıyı bul (şimdilik birebir sohbet varsayımı)
    const participants = chatRoomInfo?.participants;
    const recipient = participants?.find(p => p.id !== user?.id);
    if (!recipient) {
      Alert.alert("Hata", "Alıcı bulunamadı.");
      return;
    }

    const recipientPublicKey = recipientKeys[recipient.id] || recipient.public_key;
    if (!recipientPublicKey) {
      Alert.alert("Hata", `Alıcı (${recipient.username}) için şifreleme anahtarı bulunamadı. Mesaj gönderilemiyor.`);
      // Anahtarı tekrar çekmeyi deneyebiliriz
      await fetchRecipientKeys(participants);
      return;
    }
    // ------------------------

    setIsSending(true);
    setMessageText('');
    setError('');

    try {
      console.log(`[Chat] Encrypting message for recipient ${recipient.id}`);
      // --- ŞİFRELEME ---
      console.log('--- DEBUG: Before Encryption ---');
      console.log('Plaintext Length:', textToSend?.length); // textToSend undefined mı?
      console.log('Recipient Key:', recipientPublicKey); // Bu undefined mı?
      console.log('My Private Key:', myPrivateKey); // Bu undefined veya null mı?
      console.log('---------------------------------');
      const ciphertextBase64 = await encryptMessage(textToSend, recipientPublicKey, myPrivateKey);
      // -----------------

      // İyimser güncelleme için geçici ID ve veri
      const tempId = `temp_${Date.now()}`;
      const optimisticMessage = {
          _id: tempId, id: tempId,
          // text: textToSend, // İyimser güncellemede şifreli metni göstermeyelim
          text: "[Encrypting...]", // Veya şifreleniyor göstergesi
          createdAt: new Date().toISOString(),
          timestamp: new Date().toISOString(),
          user: { _id: user?.id, name: user?.name || user?.username, public_key: user?.public_key }, // Kendi user objemiz
          sender: { id: user?.id, username: user?.username, public_key: user?.public_key }, // Kendi sender objemiz
          file_type: 'encrypted_text', // Tipi belirt
          reactions: {},
          isOptimistic: true,
          // İyimser güncellemede gösterilecek metin (şifresi çözülmüş gibi)
          optimisticDecryptedText: textToSend,
      };

      // Mesajı listeye ekle (henüz çözülmemiş olarak)
      setMessages(prevMessages => [optimisticMessage, ...prevMessages]);

      // API'ye şifreli veriyi gönder
      const response = await api.post(`/chats/${chatId}/messages/`, {
          text: ciphertextBase64, // Şifreli metni gönder
          file_type: 'encrypted_text' // Tipi gönder
      });

      // Başarılı yanıttan gelen gerçek mesaj verisiyle iyimser mesajı değiştir
      // ve çözülmüş metin state'ine ekle
      setMessages(prevMessages => prevMessages.map(msg =>
          msg._id === tempId ? { ...response.data, isOptimistic: false } : msg
      ));
      // Yeni gelen mesajın text'i zaten şifreli, çözülmesi gerekecek.
      // Ama kendi gönderdiğimiz mesajın içeriğini bildiğimiz için direkt state'e ekleyebiliriz:
      setDecryptedMessages(prev => ({ ...prev, [response.data.id]: textToSend }));


    } catch (e) {
      console.error('[Chat] Şifreli Mesaj Gönderilemedi:', e.response?.data || e.message || e);
      setError("Mesaj gönderilemedi.");
      // İyimser mesajı kaldırabilir veya hata olarak işaretleyebiliriz
      setMessages(prevMessages => prevMessages.filter(msg => !msg.isOptimistic || msg.text !== "[Encrypting...]")); // Sadece bu mesajı kaldırmayı dene
      setMessageText(textToSend); // Gönderilemeyen metni input'a geri koy
      Alert.alert('Hata', `Mesaj gönderilemedi.\n${e.message || ''}`);
    } finally {
      setIsSending(false);
    }
  }, [messageText, isSending, chatId, user, isRecording, keysReady, myPrivateKey, chatRoomInfo, recipientKeys, fetchRecipientKeys]); // Bağımlılıklar eklendi


  // --- Ses Kaydı, Oynatma, Tepki vs. Fonksiyonları ---
  // Bu fonksiyonlar büyük ölçüde aynı kalabilir, çünkü metin şifreleme ile doğrudan ilgili değiller.
  // Sadece `sendAudio` içinde iyimser güncelleme kısmında `text` alanı boş bırakılabilir.
   const requestPermissions = useCallback(async () => { /* ... önceki kod ... */ }, []);
   const stopCurrentSound = useCallback(async (unload = true) => { /* ... önceki kod ... */ }, [currentSound]);
   useEffect(() => { /* ... önceki izin isteme ve audio modu ayarı kodu ... */ }, [requestPermissions, stopCurrentSound]);
   const playAudio = useCallback(async (uri) => { /* ... önceki kod ... */ }, [stopCurrentSound, currentSound, currentlyPlayingUri, isAudioLoading]);
   const startRecording = useCallback(async () => { /* ... önceki kod ... */ }, [audioPermissionStatus, isRecording, isSending, requestPermissions, stopCurrentSound]);
   const sendAudio = useCallback(async (uri) => {
        if (!uri || isSending || !chatId) return;
        setIsSending(true); setError('');
        const formData = new FormData(); /* ... FormData hazırlama (önceki kod) ... */
        const tempId = `temp_audio_${Date.now()}`;
        const optimisticMessage = {
            _id: tempId, id: tempId, text: '', /* text boş */
            createdAt: new Date().toISOString(), timestamp: new Date().toISOString(),
            user: { _id: user?.id, name: user?.name || user?.username }, sender: { id: user?.id, username: user?.username },
            file_type: 'audio', file_url: uri, reactions: {}, isOptimistic: true
        };
        setMessages(prevMessages => [optimisticMessage, ...prevMessages]);
        try { /* ... fetch ile gönderme (önceki kod) ... */
            // Başarılı olursa:
             // setMessages(prevMessages => prevMessages.map(msg => msg._id === tempId ? { ...responseData, isOptimistic: false } : msg));
        } catch (e) { /* ... hata yönetimi (önceki kod) ... */
             // Başarısız olursa:
             // setMessages(prevMessages => prevMessages.filter(msg => msg._id !== tempId));
        } finally { setIsSending(false); }
     }, [chatId, isSending, user, api]); // api bağımlılığı eklendi (fetch yerine api kullanılıyorsa)
   const stopRecording = useCallback(async (send = true) => { /* ... önceki kod ... */ }, [recording, sendAudio]);
   const handleTranscribeAudio = useCallback(async () => { /* ... önceki kod ... */ }, [selectedMessage, isTranscribing, api]);
   const handleReaction = useCallback(async (messageId, emoji) => { /* ... önceki kod ... */ }, [messages, user, isSending, api]);
   const closeModal = () => { /* ... önceki kod ... */ };
   // --- Müzik Paneli Fonksiyonları ---
   const toggleMusicPanel = () => { /* ... önceki kod ... */ };
   const handleSearchSong = async () => { /* ... önceki kod ... */ };
   const handleClosePlayer = () => { /* ... önceki kod ... */ };
   const handlePlayPause = async () => { /* ... önceki kod ... */ };
   const handleStop = () => { /* ... önceki kod ... */ };
   const handleNext = () => { /* ... önceki kod ... */ };
   // ---------------------------------


  // --- Mesaj Renderlama Komponenti (Şifre Çözme ile) ---
  const MessageItem = React.memo(({ item, currentUserId, onLongPress, onPlayAudio, isAudioPlaying, isAudioLoading }) => {
    const isOwnMessage = item.sender?.id === currentUserId;
    let messageTime = '';
    try { messageTime = item.createdAt ? new Date(item.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''; } catch(e) {}
    const isOptimistic = item.isOptimistic;
    const isAudio = item.file_type === 'audio';
    const isEncrypted = item.file_type === 'encrypted_text';
    const fileUrl = item.file_url ? (item.file_url.startsWith('http') ? item.file_url : `${MEDIA_BASE_URL}${item.file_url}`) : null;

    // --- Şifre Çözme State ve Effect ---
    const [decryptedText, setDecryptedText] = useState(null);
    const [isDecrypting, setIsDecrypting] = useState(false);
    const [decryptionErr, setDecryptionErr] = useState(null);

    // Kendi gönderdiğimiz mesajın içeriğini biliyoruz (iyimser güncelleme için)
    useEffect(() => {
         if (isOwnMessage && isEncrypted && item.optimisticDecryptedText) {
            setDecryptedText(item.optimisticDecryptedText);
         }
    }, [isOwnMessage, isEncrypted, item.optimisticDecryptedText]);


    // Mesaj değiştiğinde veya anahtarlar geldiğinde şifre çözmeyi dene
    useEffect(() => {
      let isMounted = true;
      const tryDecrypt = async () => {
        if (!isEncrypted || !item.text || decryptedText || decryptionErr || isOwnMessage) { // Kendi mesajımızı çözmeye gerek yok
           return;
        }

        setIsDecrypting(true);
        setDecryptionErr(null);
        try {
          // Global state'ten değil, bu effect içinde çözmeyi dene
          console.log('--- DEBUG: Before Decryption ---');
          console.log('Message ID:', message?.id);
          console.log('Ciphertext:', message?.text); // Ciphertext undefined mı?
          console.log('Sender Key:', senderPublicKey); // Bu undefined mı?
          console.log('My Private Key:', myPrivateKey); // Bu undefined veya null mı?
          console.log('--------------------------------');
// const decrypted = await decryptMessage(...)
          const decrypted = await decryptSingleMessage(item);
          if (isMounted && decrypted) {
            setDecryptedText(decrypted);
          }
        } catch (error) {
          if (isMounted) {
             console.error(`[MessageItem] Failed decryption for ${item.id}: ${error.message}`);
             setDecryptionErr(error.message || "Decryption Failed");
          }
        } finally {
          if (isMounted) {
            setIsDecrypting(false);
          }
        }
      };

      // Sadece şifreli ve kendi mesajımız olmayanlar için
      if (isEncrypted && !isOwnMessage && !isOptimistic) {
           tryDecrypt();
      } else {
           // Şifreli değilse veya kendi mesajımızsa state'leri temizle
           setDecryptedText(null);
           setIsDecrypting(false);
           setDecryptionErr(null);
      }

      return () => { isMounted = false; }; // Cleanup
    }, [item, isEncrypted, isOwnMessage, isOptimistic, decryptedText, decryptionErr, decryptSingleMessage]); // Bağımlılıklar önemli

    const handleLongPressInternal = () => {
      onLongPress(item);
    };

    const handlePlayAudioInternal = () => {
      if (fileUrl && !isOptimistic) {
         onPlayAudio(fileUrl);
      } else if (!fileUrl) {
          Alert.alert("Hata", "Ses dosyası URL'si yok.");
      }
    };

    // Mesaj içeriğini belirle
    let messageContent;
    if (isAudio) {
        messageContent = (
          <TouchableOpacity style={styles.audioMessageContainer} onPress={handlePlayAudioInternal} disabled={isOptimistic || !fileUrl || isSending || isAudioLoading}>
             {isAudioLoading && currentlyPlayingUri === fileUrl ? <ActivityIndicator size="small" color={isOwnMessage ? "#5a8d4c" : "#007AFF"} /> : <Ionicons name={isAudioPlaying ? "pause-circle" : "play-circle"} size={30} color={isOptimistic || !fileUrl ? "#bdbdbd" : (isOwnMessage ? "#5a8d4c" : "#007AFF")} /> }
             <Text style={[styles.audioText, { marginLeft: 8, color: isOptimistic || !fileUrl ? '#999' : '#000' }]}> {isOptimistic ? "Gönderiliyor..." : (isAudioLoading && currentlyPlayingUri === fileUrl ? "Yükleniyor..." : "Sesli Mesaj")} </Text>
          </TouchableOpacity>
        );
    } else if (isEncrypted) {
        if (isOptimistic && item.text === "[Encrypting...]") {
             messageContent = <Text style={[styles.messageText, styles.placeholderText]}>[Şifreleniyor...]</Text>;
        } else if (isOwnMessage && decryptedText) { // Kendi mesajımız, çözülmüş metni göster
            messageContent = <Text style={styles.messageText}>{decryptedText}</Text>;
        } else if (isDecrypting) {
            messageContent = <ActivityIndicator size="small" color={isOwnMessage ? "#5a8d4c" : "#007AFF"} />;
        } else if (decryptionErr) {
            messageContent = <Text style={[styles.messageText, styles.errorTextSmall]}><Ionicons name="warning-outline" size={14} color="red" /> Şifre Çözülemedi</Text>;
        } else if (decryptedText) {
            messageContent = <Text style={styles.messageText}>{decryptedText}</Text>;
        } else {
             // Henüz çözülmemiş veya çözülemiyor (anahtar bekleniyor vs.)
             messageContent = <Text style={[styles.messageText, styles.placeholderText]}>[Şifreli Mesaj]</Text>;
        }
    } else if (item.file_url) { // Diğer dosya türleri
         messageContent = <Text style={{ fontStyle: 'italic' }}>[Dosya: {item.file_url.split('/').pop()}]</Text>;
    } else { // Şifrelenmemiş eski metin mesajları veya sistem mesajları
        messageContent = <Text style={styles.messageText}>{item.text}</Text>;
    }


    return (
      <Pressable onLongPress={handleLongPressInternal} delayLongPress={300}>
        <View style={[styles.messageBubbleContainer, { alignSelf: isOwnMessage ? 'flex-end' : 'flex-start' }]}>
          {!isOwnMessage && item.sender?.username && ( <Text style={styles.messageUserName}>{item.sender.username}</Text> )}
          <View style={[ styles.messageBubble, { backgroundColor: isOwnMessage ? "#DCF8C6" : "#FFFFFF", borderTopLeftRadius: !isOwnMessage ? 0 : 20, borderTopRightRadius: isOwnMessage ? 0 : 20, opacity: isOptimistic ? 0.6 : 1.0 } ]}>
            {/* Mesaj İçeriği */}
            {messageContent}
            {/* Tepkileri Göster Alanı */}
            {item.reactions && Object.keys(item.reactions).length > 0 && (
              <View style={[ styles.messageReactionsContainer, { alignSelf: isOwnMessage ? 'flex-end' : 'flex-start' } ]}>
                {Object.entries(item.reactions).filter(([emoji, userIds]) => userIds && userIds.length > 0).map(([emoji, userIds]) => (
                  <TouchableOpacity key={emoji} style={[ styles.messageReactionBadge, userIds.includes(user?.id) ? styles.myReactionBadge : {} ]} onPress={() => handleReaction(item.id, emoji)} disabled={isOptimistic || isSending}>
                    <Text style={styles.messageReactionEmoji}>{emoji}</Text>
                    <Text style={styles.messageReactionCount}>{userIds.length}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {/* Zaman Damgası */}
            <Text style={[styles.messageDate, { color: isOptimistic ? 'orange' : 'grey' }]}> {isOptimistic && !isAudio ? 'Gönderiliyor...' : messageTime} </Text>
          </View>
        </View>
      </Pressable>
    );
  });

  // --- Yüklenme veya Hata Durumu Gösterimi ---
  if (authLoading || (isLoading && messages.length === 0)) {
       return <View style={styles.centerContainer}><ActivityIndicator size="large" color="#007AFF" /><Text style={{marginTop: 10}}>Yükleniyor...</Text></View>;
  }
  if (error && messages.length === 0) {
       return ( <View style={styles.centerContainer}> <Text style={styles.errorText}>{error}</Text> <Button onPress={() => fetchMessages(true)} title="Tekrar Dene" color="#007AFF" /> </View> );
  }
   // Anahtarlar hazır değilse veya private key yüklenememişse uyar
   const e2eeReady = keysReady && myPrivateKey;
   const inputDisabled = isSending || isRecording || !e2eeReady || isAudioLoading;

  // --- Ana Render ---
  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0} >

        {/* Müzik Paneli (değişiklik yok) */}
        <View style={styles.musicPanelContainer}>
             {/* ... önceki müzik paneli kodu ... */}
        </View>

        {/* Ana İçerik */}
        <View style={{ flex: 1 }}>

             {/* Uzun Basma Modalı (değişiklik yok) */}
            <Modal animationType="fade" transparent={true} visible={isModalVisible} onRequestClose={closeModal} >
                {/* ... önceki modal kodu ... */}
            </Modal>

            {/* Inline Hata */}
            {error && !isLoading && messages.length > 0 && ( <View style={styles.inlineErrorContainer}> <Text style={styles.inlineErrorText}>{error}</Text> <TouchableOpacity onPress={() => setError('')} style={{ paddingLeft: 10 }}> <Ionicons name="close-circle" size={16} color="red" /> </TouchableOpacity> </View> )}

            {/* E2EE Hazır Değil Uyarısı */}
            {!e2eeReady && !authLoading && !isLoading && (
                 <View style={styles.inlineWarningContainer}>
                    <Ionicons name="lock-closed-outline" size={14} color="#e65100" />
                    <Text style={styles.inlineWarningText}>Uçtan uca şifreleme etkinleştirilemedi. Mesajlar gönderilemez.</Text>
                 </View>
            )}


            {/* Mesaj Listesi */}
            <FlatList
                ref={flatListRef}
                data={messages}
                renderItem={({ item }) => (
                    <MessageItem
                        item={item}
                        currentUserId={user?.id}
                        onLongPress={setSelectedMessage} // Direkt item'ı gönderelim
                        onPlayAudio={playAudio}
                        isAudioPlaying={currentlyPlayingUri === (item.file_url ? (item.file_url.startsWith('http') ? item.file_url : `${MEDIA_BASE_URL}${item.file_url}`) : null) && currentSound != null}
                        isAudioLoading={isAudioLoading && currentlyPlayingUri === (item.file_url ? (item.file_url.startsWith('http') ? item.file_url : `${MEDIA_BASE_URL}${item.file_url}`) : null)}
                    />
                )}
                keyExtractor={(item) => item.id?.toString() || item._id?.toString()}
                inverted // Yeni mesajlar altta görünür
                contentContainerStyle={styles.listContentContainer}
                style={{ flex: 1 }}
                keyboardShouldPersistTaps="handled"
            />

            {/* Giriş Alanı */}
            <View style={styles.inputContainer}>
                {isRecording ? (
                    <>
                        {/* ... Kayıt butonları (önceki gibi) ... */}
                        <TouchableOpacity onPress={() => stopRecording(false)} style={styles.cancelRecordButton}> <Ionicons name="close" size={24} color="#fff" /> </TouchableOpacity>
                        <Text style={styles.recordingDurationText} numberOfLines={1}> {Math.floor(recordingDuration / 60)}:{String(recordingDuration % 60).padStart(2, '0')} </Text>
                        <View style={{flex:1}} />
                        <TouchableOpacity onPress={() => stopRecording(true)} style={styles.stopRecordButton} disabled={isSending}> {isSending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={24} color="#fff" />} </TouchableOpacity>
                    </>
                ) : (
                    <>
                         {/* Mikrofon Butonu */}
                         <TouchableOpacity
                              onPress={startRecording}
                              style={[styles.micButton, { backgroundColor: '#007AFF' }, (inputDisabled || audioPermissionStatus !== 'granted') && styles.disabledButton]}
                              disabled={inputDisabled || audioPermissionStatus !== 'granted'}
                          >
                              <Ionicons name={"mic-outline"} size={24} color="#fff" />
                          </TouchableOpacity>

                          {/* Metin Girişi */}
                          <TextInput
                              value={messageText}
                              onChangeText={setMessageText}
                              placeholder={e2eeReady ? "Şifreli mesaj yazın..." : "Şifreleme hazır değil..."}
                              style={[styles.textInput, !e2eeReady && { backgroundColor: '#eee'}]} // Hazır değilse farklı stil
                              multiline
                              editable={!inputDisabled} // inputDisabled state'ine göre
                              placeholderTextColor={e2eeReady ? "#999" : "#a00"}
                          />

                          {/* Gönderme Butonu */}
                          <TouchableOpacity
                              onPress={onSend}
                              style={[styles.sendButton, (!messageText.trim() || inputDisabled) && styles.disabledButton]}
                              disabled={!messageText.trim() || inputDisabled}
                          >
                              {isSending && !isRecording ? ( <ActivityIndicator size="small" color="white" /> ) : ( <Ionicons name="send" size={20} color="#fff" /> )}
                          </TouchableOpacity>
                    </>
                )}
            </View>
        </View>
    </KeyboardAvoidingView>
  );
};

// --- Stil Tanımları ---
// styles objesine eklemeler yapıldı
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ECE5DD' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#ECE5DD' },
  errorText: { color: 'red', marginBottom: 10, textAlign: 'center', fontSize: 16 },
  inlineErrorContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ffebee', paddingHorizontal: 10, paddingVertical: 5, },
  inlineErrorText: { color: 'red', textAlign: 'center', fontSize: 12, flexShrink: 1 },
  // Yeni uyarı stili
  inlineWarningContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff3e0', paddingHorizontal: 10, paddingVertical: 5, },
  inlineWarningText: { color: '#e65100', textAlign: 'center', fontSize: 12, flexShrink: 1, marginLeft: 5 },
  listContentContainer: { paddingBottom: 10, paddingHorizontal: 8, flexGrow: 1, justifyContent: 'flex-end', },
  messageBubbleContainer: { maxWidth: '80%', marginVertical: 4, paddingHorizontal: 5, alignSelf: 'flex-start' },
  messageUserName: { fontSize: 12, color: '#616161', marginBottom: 2, marginLeft: 10, },
  messageBubble: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 1.5, elevation: 1, minWidth: 80, position: 'relative', },
  messageText: { fontSize: 16, color: "#333" },
  placeholderText: { color: '#777', fontStyle: 'italic' }, // Şifreli mesaj placeholder stili
  errorTextSmall: { color: 'red', fontSize: 14 }, // Şifre çözme hatası stili
  messageDate: { fontSize: 11, color: "grey", marginTop: 4, textAlign: "right", marginLeft: 10, },
  audioMessageContainer: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, },
  audioText: { fontSize: 16 },
  inputContainer: { flexDirection: "row", paddingHorizontal: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#ddd", backgroundColor: "#F5F5F5", alignItems: 'flex-end', },
  textInput: { flex: 1, paddingTop: Platform.OS === 'ios' ? 10 : 8, paddingBottom: Platform.OS === 'ios' ? 10 : 8, paddingHorizontal: 15, borderWidth: 1, borderColor: "#ddd", borderRadius: 20, backgroundColor: "white", marginHorizontal: 8, fontSize: 16, maxHeight: 100, textAlignVertical: 'center', },
  micButton: { padding: 10, borderRadius: 25, justifyContent: 'center', alignItems: 'center', width: 44, height: 44, marginBottom: Platform.OS === 'ios' ? 0 : 4, },
  cancelRecordButton: { padding: 10, borderRadius: 25, width: 44, height: 44, backgroundColor: '#dc3545', justifyContent: 'center', alignItems: 'center', marginRight: 10, marginBottom: Platform.OS === 'ios' ? 0 : 4, },
  stopRecordButton: { padding: 10, borderRadius: 25, width: 44, height: 44, backgroundColor: '#28a745', justifyContent: 'center', alignItems: 'center', marginLeft: 10, marginBottom: Platform.OS === 'ios' ? 0 : 4, },
  recordingDurationText: { fontSize: 16, color: '#333', fontWeight: 'bold', lineHeight: 44, textAlign: 'center', minWidth: 60, marginBottom: Platform.OS === 'ios' ? 0 : 4, },
  sendButton: { padding: 10, borderRadius: 25, justifyContent: 'center', alignItems: 'center', backgroundColor: "#007AFF", width: 44, height: 44, marginBottom: Platform.OS === 'ios' ? 0 : 4, },
  disabledButton: { opacity: 0.5, backgroundColor: '#a0a0a0', },
  // Modal Stilleri (önceki gibi)
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)', justifyContent: 'center', alignItems: 'center', },
  modalContent: { backgroundColor: 'white', padding: 20, borderRadius: 10, width: '80%', maxWidth: 350, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84, },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', color: '#333', },
  modalButton: { paddingVertical: 12, },
  modalButtonText: { fontSize: 16, color: '#007AFF', textAlign: 'center', },
  reactionsContainer: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee', marginBottom: 10, },
  reactionButton: { padding: 5, },
  reactionEmoji: { fontSize: 28, },
  selectedReactionEmoji: { transform: [{ scale: 1.1 }], },
  transcriptionResultContainer: { marginTop: 15, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#eee', },
  transcriptionLabel: { fontSize: 14, fontWeight: 'bold', color: '#555', marginBottom: 5, },
  transcribedText: { fontSize: 15, color: '#333', textAlign: 'left', },
  transcriptionErrorText: { fontSize: 14, color: 'red', textAlign: 'center', paddingVertical: 10, },
  // Mesaj Altındaki Tepki Stilleri (önceki gibi)
  messageReactionsContainer: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 5, },
  messageReactionBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, marginRight: 4, marginBottom: 4, borderWidth: 1, borderColor: 'transparent', },
  myReactionBadge: { backgroundColor: '#d0eaff', borderColor: '#a0c4ff', },
  messageReactionEmoji: { fontSize: 12, marginRight: 2, },
  messageReactionCount: { fontSize: 11, fontWeight: 'bold', color: '#555', },
  // Müzik Paneli Stilleri (önceki gibi)
  musicPanelContainer: { position: 'absolute', top: Platform.OS === 'ios' ? 50 : 10, left: 10, zIndex: 100, },
  musicPanelAnimated: { height: 50, backgroundColor: 'rgba(0, 0, 0, 0.7)', borderRadius: 25, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', paddingLeft: 13, },
  musicIconTouchable: { width: 50, height: 50, justifyContent: 'center', alignItems: 'center', position: 'absolute', left: 0, top: 0, zIndex: 101, },
  musicPanelContent: { flex: 1, height: '100%', flexDirection: 'row', alignItems: 'center', paddingLeft: 50, paddingRight: 10, },
  musicSearchContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', },
  musicSearchInput: { flex: 1, height: 35, backgroundColor: 'rgba(255, 255, 255, 0.2)', borderRadius: 18, paddingHorizontal: 15, color: 'white', fontSize: 14, marginRight: 8, },
  musicSearchButton: { padding: 8, backgroundColor: '#007AFF', borderRadius: 17, },
  musicLoadingContainer: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', },
  musicLoadingText: { color: 'white', marginLeft: 10, },
  musicPlayerContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', },
  songTitle: { color: 'white', fontSize: 14, fontWeight: 'bold', flexShrink: 1, marginRight: 10, },
  playerControls: { flexDirection: 'row', alignItems: 'center', },
  playerButton: { padding: 5, marginLeft: 8, },
});

export default Chat;