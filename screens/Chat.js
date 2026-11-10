import React, { useState, useEffect, useCallback, useRef, useContext } from 'react';
import {
    View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet,
    KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Button,
    Modal, Pressable, Clipboard, Animated, Dimensions, Image, Linking
} from 'react-native';
import { Audio, Video } from 'expo-av';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Animatable from 'react-native-animatable';

// --- Context, API ve Crypto Importları ---
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
// CryptoUtils importları
import {
    encryptMessage,
    decryptMessage,
    fetchPublicKeyForUser,
    getStoredKeys
} from '../utils/cryptoUtils';

// API Adresleri
const API_BASE_URL = 'https://d83a-78-182-153-68.ngrok-free.app/api'; // KENDİ NGROK/API ADRESİNİZ
const MEDIA_BASE_URL = 'https://d83a-78-182-153-68.ngrok-free.app'; // KENDİ NGROK/API ADRESİNİZ

// Tepki emojileri ve diğer sabitler
const AVAILABLE_REACTIONS = ['👍', '❤️', '😂', '😢', '🙏'];
const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const HEADER_HEIGHT = Platform.OS === 'ios' ? 90 : 70;

const Chat = () => {
    const route = useRoute();
    const { user } = useAuth();
    const { chatId } = route.params;
    const navigation = useNavigation();

    // --- State Değişkenleri ---
    const [messages, setMessages] = useState([]);
    const [messageText, setMessageText] = useState("");
    const [isLoading, setIsLoading] = useState(true); // Genel yükleme (mesajlar vb.)
    const [isRecipientInfoLoading, setIsRecipientInfoLoading] = useState(true); // Alıcı bilgisi ve anahtar yükleme
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState('');
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [selectedMessage, setSelectedMessage] = useState(null);
    const [recording, setRecording] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const [audioPermissionStatus, setAudioPermissionStatus] = useState(null);
    const [mediaPermissionStatus, setMediaPermissionStatus] = useState(null);
    const [cameraPermissionStatus, setCameraPermissionStatus] = useState(null);
    const [isImageViewVisible, setIsImageViewVisible] = useState(false);
    const [selectedImageUri, setSelectedImageUri] = useState(null);
    const [currentSound, setCurrentSound] = useState(null);
    const [currentlyPlayingAudioUri, setCurrentlyPlayingAudioUri] = useState(null);
    const [isAudioLoading, setIsAudioLoading] = useState(false);
    const [currentlyPlayingVideoUri, setCurrentlyPlayingVideoUri] = useState(null);
    const [isVideoLoading, setIsVideoLoading] = useState({});
    const [isVideoPlaying, setIsVideoPlaying] = useState({});
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [transcribedText, setTranscribedText] = useState('');
    const [transcriptionError, setTranscriptionError] = useState('');
    const [isMusicPanelOpen, setIsMusicPanelOpen] = useState(false);
    const [musicPanelState, setMusicPanelState] = useState('search');
    const [musicSearchQuery, setMusicSearchQuery] = useState('');
    const [currentPlayingSong, setCurrentPlayingSong] = useState(null);
    const [isMusicSearchLoading, setIsMusicSearchLoading] = useState(false);
    const animatedWidth = useRef(new Animated.Value(50)).current;
    const [replyingToMessage, setReplyingToMessage] = useState(null);
    const [highlightedMessageId, setHighlightedMessageId] = useState(null);
    const [seenHighlightedMessageId, setSeenHighlightedMessageId] = useState(null);

    // --- E2EE için State'ler ---
    const [recipientId, setRecipientId] = useState(null);
    const [recipientPublicKeyJwk, setRecipientPublicKeyJwk] = useState(null);
    const [recipientInfoError, setRecipientInfoError] = useState(''); // Alıcı bilgisi/anahtar hatası için ayrı state

    // --- Referanslar ---
    const flatListRef = useRef(null);
    const videoRefs = useRef({});
    const highlightTimeoutRef = useRef(null);
    const seenHighlightTimeoutRef = useRef(null);
    const previousMessagesRef = useRef([]);
    const sentReadReceiptsRef = useRef(new Set());
    const initialLoadCompleteRef = useRef(false); // İlk yüklemenin tamamlanıp tamamlanmadığını takip et

    // --- İzinler ve Medya Kontrolleri (Değişiklik Yok) ---
    const requestPermissions = useCallback(async () => { /* ... (Kod öncekiyle aynı)... */ }, []);
    const requestMediaPermissions = useCallback(async () => { /* ... (Kod öncekiyle aynı)... */ }, []);
    const stopCurrentSound = useCallback(async (unload = true) => { /* ... (Kod öncekiyle aynı)... */ }, [currentSound]);
    const stopCurrentVideo = useCallback(async (unload = true, uriToStop = null) => { /* ... (Kod öncekiyle aynı)... */ }, [currentlyPlayingVideoUri]);
    const stopAllMedia = useCallback(async (exceptUri = null) => { /* ... (Kod öncekiyle aynı)... */ }, [currentlyPlayingAudioUri, currentlyPlayingVideoUri, currentPlayingSong, stopCurrentSound, stopCurrentVideo, isVideoPlaying, isVideoLoading, videoRefs]);

    useEffect(() => {
        requestPermissions();
        requestMediaPermissions();
        Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true }).catch(err => console.error("Error setting initial audio mode:", err));
        return () => {
             console.log("Chat component unmounting. Stopping all media.");
             stopAllMedia();
             if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
             if (seenHighlightTimeoutRef.current) clearTimeout(seenHighlightTimeoutRef.current);
        };
    }, [requestPermissions, requestMediaPermissions, stopAllMedia]);


    // --- Alıcı ID'sini ve Public Anahtarını Alma (DÜZENLENDİ) ---
    useEffect(() => {
        const fetchRecipientInfo = async () => {
            if (!chatId || !user) return;

            setIsRecipientInfoLoading(true);
            setRecipientInfoError('');
            setRecipientId(null); // Önceki ID'yi temizle
            setRecipientPublicKeyJwk(null); // Önceki anahtarı temizle
            console.log(`[Chat ${chatId}] Fetching recipient info...`);

            let foundRecipientId = null;
            let foundRecipientName = 'Sohbet';

            try {
                // 1. Sohbet Detaylarını API'den Al (Alıcı ID'si için)
                console.log(`[Chat ${chatId}] Fetching chat details from /chats/${chatId}/...`);
                const response = await api.get(`/chats/${chatId}/`);
                const participants = response.data?.participants || [];
                const otherParticipant = participants.find(p => p.id !== user.id);

                if (otherParticipant) {
                    foundRecipientId = otherParticipant.id;
                    foundRecipientName = otherParticipant.name || otherParticipant.username || `Kullanıcı ${otherParticipant.id}`;
                    setRecipientId(foundRecipientId);
                    navigation.setOptions({ title: foundRecipientName }); // Başlığı güncelle
                    console.log(`[Chat ${chatId}] Recipient ID determined: ${foundRecipientId} (${foundRecipientName})`);
                } else {
                    console.error(`[Chat ${chatId}] Recipient ID could not be determined from API response. Participants:`, participants);
                    throw new Error("Sohbet alıcısı bulunamadı.");
                }

                // 2. Alıcının Public Anahtarını API'den Al
                if (foundRecipientId) {
                    console.log(`[Chat ${chatId}] Fetching public key for recipient ${foundRecipientId}...`);
                    const key = await fetchPublicKeyForUser(foundRecipientId); // cryptoUtils'dan fonksiyon
                    if (key) {
                        console.log(`>>> [Chat ${chatId}] Alınan Alıcı Public Key JWK (${foundRecipientId}):`, JSON.stringify(key, null, 2));
                        console.log(`[Chat <span class="math-inline">\{chatId\}\] Alınan Alıcı Public Key JWK \(</span>{foundRecipientId}):`, JSON.stringify(key, null, 2));
                        setRecipientPublicKeyJwk(key);
                        console.log(`[Chat ${chatId}] Recipient public key fetched successfully.`);
                    } else {
                        // 404 veya başka bir hata durumu
                         console.warn(`[Chat ${chatId}] Could not fetch public key for recipient ${foundRecipientId}. E2EE might not work.`);
                         throw new Error("Alıcının şifreleme anahtarı bulunamadı. Güvenli mesajlaşma kullanılamayabilir.");
                    }
                }

            } catch (e) {
                console.error(`[Chat ${chatId}] Failed to fetch recipient info or key:`, e.response?.data || e.message);
                const errorMsg = e.message || "Alıcı bilgileri veya anahtarı alınamadı.";
                setRecipientInfoError(errorMsg); // Hata state'ini ayarla
                navigation.setOptions({ title: "Hata" }); // Başlığı güncelle
            } finally {
                setIsRecipientInfoLoading(false); // Yükleme bitti (başarılı veya hatalı)
            }
        };

        fetchRecipientInfo();
    }, [chatId, user, navigation]); // Bağımlılıklar doğru


    // --- Mesajları Şifre Çözme Yardımcı Fonksiyonu (Değişiklik Yok) ---
    const decryptMessages = useCallback(async (messagesToDecrypt) => {
         if (!messagesToDecrypt || messagesToDecrypt.length === 0) return [];
         // console.log(`[Chat ${chatId}] Attempting to decrypt ${messagesToDecrypt.length} messages...`);

         const { privateKeyJwk, publicKeyJwk: myPublicKeyJwk } = await getStoredKeys();
         if (!privateKeyJwk || !myPublicKeyJwk) {
             console.error(`[Chat ${chatId}] Decryption skipped: Own keys not found.`);
             // Hata mesajını state'e yazdırabiliriz ama sürekli tekrarlamaması için kontrol ekleyelim
              if (!error && !recipientInfoError) { // Sadece henüz genel bir hata yoksa ayarla
                  setError("Mesaj şifreleri çözülemiyor (Yerel anahtar eksik).");
              }
             return messagesToDecrypt.map(msg => ({ ...msg, text: '[Şifre Çözülemedi - Anahtar Eksik]', isDecrypted: false }));
         }
         // Alıcı anahtarı YÜKLENMEMİŞSE ve alıcıdan gelen mesaj varsa hata ver
         if (!recipientPublicKeyJwk && messagesToDecrypt.some(m => m.sender?.id === recipientId)) {
              console.error(`[Chat ${chatId}] Decryption skipped: Recipient public key not available.`);
              if (!error && !recipientInfoError) {
                  // setError("Mesaj şifreleri çözülemiyor (Alıcı anahtarı eksik)."); // Bu hata recipientInfoError'da zaten olabilir
              }
              return messagesToDecrypt.map(msg => ({ ...msg, text: '[Şifre Çözülemedi - Alıcı Anahtarı Eksik]', isDecrypted: false }));
         }

         const decrypted = [];
         for (const msg of messagesToDecrypt) {
             // Sadece text tipinde ve ciphertext olanları çöz
             if (msg.file_type !== 'encrypted_text' || !msg.ciphertext) {
                 decrypted.push({ ...msg, isDecrypted: true }); // Diğerleri çözülmüş sayılır
                 continue;
             }
              if (typeof msg.sender?.id === 'undefined') {
                   console.warn(`[Chat ${chatId}] Skipping decryption for message ${msg.id} with missing sender ID.`);
                   decrypted.push({ ...msg, text: '[Şifre Çözülemedi - Gönderen Eksik]', isDecrypted: false });
                   continue;
              }

             try {
                 let senderPublicKeyJwk;
                 if (msg.sender.id === recipientId) {
                     senderPublicKeyJwk = recipientPublicKeyJwk;
                     if (!senderPublicKeyJwk) throw new Error(`Recipient (${recipientId}) public key not available for message ${msg.id}.`);
                 } else if (msg.sender.id === user?.id) {
                     senderPublicKeyJwk = myPublicKeyJwk;
                     if (!senderPublicKeyJwk) throw new Error(`Own public key not available for message ${msg.id}.`);
                 } else {
                     throw new Error(`Unknown sender ID ${msg.sender.id} for message ${msg.id}`);
                 }

                 const decryptedText = await decryptMessage(msg.ciphertext, senderPublicKeyJwk);
                 decrypted.push({ ...msg, text: decryptedText, isDecrypted: true });

             } catch (decryptionError) {
                 console.error(`[Chat ${chatId}] Failed to decrypt message ${msg.id}:`, decryptionError);
                 decrypted.push({ ...msg, text: '[Mesaj Şifresi Çözülemedi]', isDecrypted: false });
             }
         }
         // console.log(`[Chat ${chatId}] Decryption process completed for ${messagesToDecrypt.length} messages.`);
         return decrypted;
     }, [recipientId, recipientPublicKeyJwk, user?.id, error, recipientInfoError]); // error ve recipientInfoError eklendi


    // --- fetchMessages (DÜZENLENDİ: Anahtar Yüklenmesini Bekleme) ---
    const fetchMessages = useCallback(async (showLoadingIndicator = true) => {
        if (!chatId) { console.warn("Chat ID missing, cannot fetch messages."); return; }

        // --- ÖNEMLİ KONTROL: Alıcı bilgisi ve anahtar yüklenmeden mesaj çekme ---
        if (isRecipientInfoLoading) {
             console.log(`[Chat ${chatId}] Waiting for recipient info/key before fetching messages.`);
             // Eğer ilk yükleme ise ve alıcı bilgisi hala yükleniyorsa, spinner gösterilsin diye isLoading'i true yapabiliriz
             if (showLoadingIndicator && !initialLoadCompleteRef.current) setIsLoading(true);
             return; // Anahtar yüklenmeden API çağrısı yapma
        }
        // Eğer anahtar yüklemesi hata ile sonuçlandıysa da mesajları çekme (veya özel durum?)
         if (recipientInfoError) {
              console.log(`[Chat ${chatId}] Skipping message fetch due to recipient info error.`);
              setIsLoading(false); // Yükleniyor durumunu kapat
              return;
         }
         // Eğer alıcı ID'si var ama public anahtar yoksa (beklenmeyen durum, ama olabilir)
          if (recipientId && !recipientPublicKeyJwk) {
               console.warn(`[Chat ${chatId}] Recipient ID (${recipientId}) exists, but public key is missing. Fetching messages might lead to decryption issues.`);
               // Belki burada da fetch'i durdurmak daha iyi olabilir? Veya hata mesajını göstermeye devam etmeli.
               setIsLoading(false);
               return;
          }
        // --------------------------------------------------------------------

        if (showLoadingIndicator && !initialLoadCompleteRef.current) {
             setIsLoading(true); // Sadece ilk tam yüklemede loading göster
         }
        // setError(''); // Genel mesaj hatasını temizleme (recipientInfoError kalmalı)
        console.log(`[Chat ${chatId}] Fetching messages...`);
        try {
            const response = await api.get(`/chats/${chatId}/messages/`);
            const fetchedMessages = response.data || [];
            console.log(`[Chat ${chatId}] Fetched ${fetchedMessages?.length ?? 0} raw messages.`);

            const decryptedMessages = await decryptMessages(fetchedMessages);

            // Mesajları güncelle (önceki kod ile aynı mantık)
            setMessages(prevMessages => {
                const messageMap = new Map(prevMessages.map(msg => [msg.id || msg._id, msg]));
                decryptedMessages.forEach(decMsg => {
                    const key = decMsg.id || decMsg._id;
                    const existingMsg = messageMap.get(key);
                     // Yeni mesaj veya önceden çözülemeyip şimdi çözülen mesaj
                    if (!existingMsg || (existingMsg.isDecrypted === false && decMsg.isDecrypted === true)) {
                        messageMap.set(key, decMsg);
                    } else if (existingMsg && !existingMsg.isOptimistic) {
                         // Varolan mesajı güncelle (örn. tepkiler) ama çözülmüş metni koru
                         messageMap.set(key, { ...decMsg, text: existingMsg.text, isDecrypted: existingMsg.isDecrypted });
                    }
                });
                // Map'ten array'e çevirip sırala
                return Array.from(messageMap.values()).sort((a, b) => {
                     const dateA = new Date(a.timestamp || a.createdAt);
                     const dateB = new Date(b.timestamp || b.createdAt);
                     return dateB - dateA; // En yeni en üste (FlatList inverted olduğu için render sırasında ters dönecek)
                });
            });

             if (!initialLoadCompleteRef.current) {
                 initialLoadCompleteRef.current = true; // İlk yükleme tamamlandı
             }

        } catch (e) {
            console.error('[fetchMessages] Mesajlar çekilemedi:', e.response?.data || e.message);
            const errorMsg = "Mesajlar yüklenirken bir hata oluştu.";
             // Sadece mesaj listesi boşsa veya ilk yükleme ise genel hata göster
             if (messages.length === 0 || (showLoadingIndicator && !initialLoadCompleteRef.current)) {
                  setError(errorMsg);
              } else { console.warn("Polling failed to update messages."); }
        } finally {
            // Yükleme göstergesini sadece ilk tam yüklemede kapat
            if (showLoadingIndicator && initialLoadCompleteRef.current) {
                setIsLoading(false);
            }
             // Eğer polling ise ve hala loading gösteriyorsa kapat (örn. hızlı refresh sonrası)
             if (!showLoadingIndicator && isLoading) {
                 setIsLoading(false);
             }
        }
        // recipientPublicKeyJwk bağımlılıktan çıkarıldı, isRecipientInfoLoading ve recipientInfoError eklendi
    }, [chatId, decryptMessages, isRecipientInfoLoading, recipientInfoError, recipientId, recipientPublicKeyJwk, isLoading, messages.length]);


    // Mesaj Güncellemelerini Dinle (Highlight - Değişiklik Yok)
    useEffect(() => { /* ... (Kod öncekiyle aynı)... */ }, [messages, user?.id]);

    // Focus Effect (Değişiklik Yok)
    useFocusEffect(useCallback(() => {
         console.log("Chat screen focused, fetching messages.");
          initialLoadCompleteRef.current = false; // Ekrana her gelindiğinde ilk yükleme gibi davran
         fetchMessages(true); // İlk yüklemeyi tetikle
     }, [fetchMessages]));


    // Polling Interval (DÜZENLENDİ: Anahtar kontrolü eklendi)
    useEffect(() => {
        const intervalId = setInterval(() => {
            const isAnyMediaActive = !!currentSound || !!currentlyPlayingVideoUri || Object.values(isVideoLoading).some(l => l) || Object.values(isVideoPlaying).some(p => p);
             // Anahtar YÜKLENMİŞSE ve diğer koşullar uygunsa poll yap
            const canPoll = !isLoading && !isSending && !isRecording && !isModalVisible && !isImageViewVisible && !isMusicPanelOpen && !isAnyMediaActive && !replyingToMessage && !isRecipientInfoLoading && !!recipientPublicKeyJwk && !recipientInfoError;

            if (canPoll) {
                fetchMessages(false); // Arka planda sessizce çek
            } else {
                 // console.log("Polling skipped:", {isLoading, isSending, isRecording, isModalVisible, isImageViewVisible, isMusicPanelOpen, isAnyMediaActive, replyingToMessage, isRecipientInfoLoading, hasKey: !!recipientPublicKeyJwk, keyError: !!recipientInfoError });
             }
        }, 7000); // Interval biraz uzatıldı (isteğe bağlı)
        return () => clearInterval(intervalId);
         // recipientPublicKeyJwk ve recipientInfoError bağımlılıklara eklendi
    }, [fetchMessages, isLoading, isSending, isRecording, isModalVisible, isImageViewVisible, isMusicPanelOpen, currentSound, currentlyPlayingVideoUri, isVideoLoading, isVideoPlaying, replyingToMessage, isRecipientInfoLoading, recipientPublicKeyJwk, recipientInfoError]);


    // onSend - Şifreleme (Değişiklik Yok, zaten anahtar kontrolü vardı)
    const onSend = useCallback(async () => {
        const textToSend = messageText.trim();
        // Anahtar yoksa veya yükleniyorsa göndermeyi engelle
        if (!recipientPublicKeyJwk || isRecipientInfoLoading) {
             Alert.alert(
                 "Gönderilemiyor",
                 recipientInfoError || "Alıcı şifreleme anahtarı henüz hazır değil. Lütfen bekleyin veya daha sonra tekrar deneyin."
             );
             console.warn(`[Chat ${chatId}] Send cancelled: Recipient public key not available or still loading.`);
             return;
         }
        if (!textToSend || isSending || !chatId || isRecording) {
             return;
         }

        setIsSending(true); setError(''); const tempId = `temp_${Date.now()}`;

        // --- Metni Şifrele ---
        let ciphertext;
        try {
            console.log(`[Chat ${chatId}] Encrypting text message...`);
            ciphertext = await encryptMessage(textToSend, recipientPublicKeyJwk);
            console.log(`[Chat ${chatId}] Text message encrypted.`);
        } catch (encryptionError) {
            console.error(`[Chat ${chatId}] Failed to encrypt message:`, encryptionError);
            setError("Mesaj şifrelenirken bir hata oluştu.");
            setIsSending(false);
            return;
        }

        const dataToSend = {
             ciphertext: ciphertext,
             file_type: 'encrypted_text',
             reply_to_id: replyingToMessage ? replyingToMessage.id : undefined
         };

        // Optimistic UI
        const optimisticMessage = {
            _id: tempId, id: tempId,
            text: textToSend, // Şifresi çözülmüş metni optimistic olarak gösterelim
            createdAt: new Date().toISOString(), timestamp: new Date().toISOString(),
            user: { _id: user?.id, name: user?.name || user?.username },
            sender: { id: user?.id, username: user?.username },
            file_type: 'encrypted_text',
            reactions: {},
            reply_to: replyingToMessage ? { id: replyingToMessage.id, sender: replyingToMessage.sender, text_snippet: replyingToMessage.text ? replyingToMessage.text.substring(0, 30) + '...' : `[${replyingToMessage.file_type}]`, file_type: replyingToMessage.file_type } : null,
            isOptimistic: true,
            isDecrypted: true // Kendi mesajımız, çözülmüş
        };

        setMessages(prevMessages => [optimisticMessage, ...prevMessages]);
        setReplyingToMessage(null); setMessageText('');

        try {
            const response = await api.post(`/chats/${chatId}/messages/`, dataToSend);
            console.log(`[Chat ${chatId}] Encrypted message sent, server responded. ID:`, response.data?.id);

            const savedMessage = response.data;
            const finalMessage = {
                 ...savedMessage,
                 text: textToSend, // Şifresi çözülmüş metni koru
                 isOptimistic: false,
                 isDecrypted: true,
                  sender: savedMessage.sender || { id: user?.id, username: user?.username },
                  user: savedMessage.user || { _id: user?.id }
             };

            setMessages(prevMessages => prevMessages.map(msg => msg._id === tempId ? finalMessage : msg));

        } catch (e) {
            console.error('[onSend] Şifreli Metin Mesajı Gönderilemedi:', e.response?.data || e.message);
            setError("Mesaj gönderilemedi.");
            setMessages(prevMessages => prevMessages.filter(msg => msg._id !== tempId));
            setMessageText(textToSend);
            Alert.alert('Hata', `Mesaj gönderilemedi.\n${e.response?.data?.detail || Object.values(e.response?.data || {})[0]?.[0] || e.message || ''}`);
        } finally {
            setIsSending(false);
        }
        // isRecipientInfoLoading ve recipientInfoError bağımlılıklara eklendi (kontroller için)
    }, [messageText, isSending, chatId, user, isRecording, api, replyingToMessage, recipientPublicKeyJwk, encryptMessage, isRecipientInfoLoading, recipientInfoError]);


    // --- Diğer Fonksiyonlar (playAudio, handleVideoPlayPause, vs. - Değişiklik Yok) ---
    const playAudio = useCallback(async (uri) => { /* ... (Kod öncekiyle aynı)... */ }, [stopCurrentSound, stopAllMedia, currentSound, currentlyPlayingAudioUri, isAudioLoading]);
    const handleVideoPlayPause = useCallback(async (uri) => { /* ... (Kod öncekiyle aynı)... */ }, [stopAllMedia]);
    const onPlaybackStatusUpdate = (uri, status) => { /* ... (Kod öncekiyle aynı)... */ };
    const startRecording = useCallback(async () => { /* ... (Kod öncekiyle aynı)... */ }, [audioPermissionStatus, isRecording, isSending, requestPermissions, stopAllMedia]);
    const sendAudio = useCallback(async (uri) => { /* ... (Kod öncekiyle aynı - Şifrelemesiz)... */ }, [chatId, isSending, user, fetchMessages, api, replyingToMessage]); // DİKKAT: Şifrelemesiz
    const stopRecording = useCallback(async (send = true) => { /* ... (Kod öncekiyle aynı)... */ }, [recording, sendAudio]);
    const pickMedia = useCallback(async (useCamera = false) => { /* ... (Kod öncekiyle aynı)... */ }, [cameraPermissionStatus, mediaPermissionStatus, requestMediaPermissions, sendMedia]);
    const sendMedia = useCallback(async (asset) => { /* ... (Kod öncekiyle aynı - Şifrelemesiz)... */ }, [chatId, isSending, user, fetchMessages, api, replyingToMessage]); // DİKKAT: Şifrelemesiz
    const handleTranscribeAudio = useCallback(async () => { /* ... (Kod öncekiyle aynı)... */ }, [selectedMessage, isTranscribing, api]);
    const handleReaction = useCallback(async (messageId, emoji) => { /* ... (Kod öncekiyle aynı)... */ }, [messages, user, isSending, api]);
    const closeModal = () => { /* ... (Kod öncekiyle aynı)... */ };
    const openImageViewer = (uri) => { /* ... (Kod öncekiyle aynı)... */ };
    const closeImageViewer = () => { /* ... (Kod öncekiyle aynı)... */ };
    const toggleMusicPanel = () => { /* ... (Kod öncekiyle aynı)... */ };
    const handleSearchSong = async () => { /* ... (Kod öncekiyle aynı)... */ };
    const handleClosePlayer = () => { /* ... (Kod öncekiyle aynı)... */ };
    const handleMusicPlayPause = async () => { /* ... (Kod öncekiyle aynı)... */ };
    const handleMusicStop = () => { /* ... (Kod öncekiyle aynı)... */ };
    const markMessageAsRead = useCallback(async (messageId) => { /* ... (Kod öncekiyle aynı)... */ }, [api, user?.id, messages]);
    const handleViewableItemsChanged = useCallback(({ viewableItems }) => { /* ... (Kod öncekiyle aynı)... */ }, [user?.id, markMessageAsRead]);


    // --- RenderItem (Değişiklik Yok) ---
    const renderItem = ({ item }) => {
        const isOwnMessage = item.sender?.id === user?.id;
        let messageTime = '';
        try { messageTime = item.timestamp ? new Date(item.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''; } catch (e) { console.warn("Error formatting date:", e); }
        const isOptimistic = item.isOptimistic;
         const messageTextToShow = item.isDecrypted === false ? '[Şifre Çözülemedi]' : item.text;
         const isTextMessageType = item.file_type === 'text' || item.file_type === 'encrypted_text';

         const isAudio = item.file_type === 'audio' || item.file_type === 'encrypted_audio'; // Encrypted tipleri de ekle
         const isImage = item.file_type === 'image' || item.file_type === 'encrypted_image';
         const isVideo = item.file_type === 'video' || item.file_type === 'encrypted_video';
         const isFile = !isTextMessageType && !isAudio && !isImage && !isVideo && (item.file_url || item.file_type.startsWith('encrypted_')); // Diğer şifreli/şifresiz dosyalar
         const fileUrl = item.file_url ? (item.file_url.startsWith('http') || item.file_url.startsWith('file://') ? item.file_url : `${MEDIA_BASE_URL}${item.file_url}`) : null;
        const hasReply = item.reply_to && (item.reply_to.id || item.reply_to.sender);
        const isHighlighted = item.id === highlightedMessageId && !isOwnMessage;
        const isSeenHighlighted = item.id === seenHighlightedMessageId && isOwnMessage;
        const isAudioPlaying = currentlyPlayingAudioUri === fileUrl && currentSound != null;
        const isAudioMsgLoading = isAudioLoading && currentlyPlayingAudioUri === fileUrl;
        const isVideoMsgPlaying = isVideoPlaying[fileUrl] ?? false;
        const isVideoMsgLoading = isVideoLoading[fileUrl] ?? false;
        const handleLongPress = () => { if (!isOptimistic && (item.id || item._id)) { setSelectedMessage(item); setIsModalVisible(true); } };
        const animationType = isOptimistic ? "fadeInUp" : undefined;
        const animationDuration = 400;
        const yellowHighlightStyle = isHighlighted ? { borderColor: 'gold', borderWidth: 2 } : {};
        const greenHighlightStyle = isSeenHighlighted ? { borderColor: '#4CAF50', borderWidth: 2 } : {};
        let isSeenByOthers = false;
        if (isOwnMessage && !item.isOptimistic && item.read_statuses && item.read_statuses.length > 0) {
            isSeenByOthers = item.read_statuses.some(status => status.user.id !== user?.id);
        }
        const hasReactions = !isOptimistic && item.reactions && Object.keys(item.reactions).length > 0 && Object.values(item.reactions).some(v => v?.length > 0);

        // --- RenderItem JSX (Değişiklik yok) ---
         return (
            <Animatable.View animation={animationType} duration={animationDuration} useNativeDriver={true} style={{ maxWidth: '80%', alignSelf: isOwnMessage ? 'flex-end' : 'flex-start' }} >
                 <Pressable onLongPress={handleLongPress} delayLongPress={300}>
                     <View style={styles.messageBubbleInnerContainer}>
                         {!isOwnMessage && item.sender?.username && ( <Text style={styles.messageUserName}>{item.sender.username}</Text> )}
                         <View style={[ styles.messageBubble, { backgroundColor: isOwnMessage ? "#DCF8C6" : "#FFFFFF", borderTopLeftRadius: !isOwnMessage ? 0 : 20, borderTopRightRadius: isOwnMessage ? 0 : 20, opacity: isOptimistic ? 0.9 : 1.0, borderColor: isOwnMessage ? '#DCF8C6' : '#FFFFFF', borderWidth: 0 }, yellowHighlightStyle, greenHighlightStyle ]}>
                             {hasReply && ( <TouchableOpacity style={styles.repliedMessagePreview} activeOpacity={0.7}> <View style={styles.replyIndicator}></View> <View style={styles.repliedContent}> <Text style={styles.repliedUser} numberOfLines={1}>{item.reply_to.sender?.username || item.reply_to.sender?.name || 'Bilinmeyen'}</Text> <Text style={styles.repliedText} numberOfLines={1}>{item.reply_to.text_snippet || item.reply_to.text || `[${item.reply_to.file_type || 'Dosya'}]`}</Text> </View> </TouchableOpacity> )}
                             {/* --- Medya Gösterimi (Encrypted tipler eklendi) --- */}
                              {isAudio && ( <TouchableOpacity style={styles.audioMessageContainer} onPress={() => fileUrl ? playAudio(fileUrl) : null} disabled={isOptimistic || !fileUrl || isSending || isAudioMsgLoading}> {isAudioMsgLoading ? <ActivityIndicator size="small" color={isOwnMessage ? "#5a8d4c" : "#007AFF"} /> : <Ionicons name={isAudioPlaying ? "pause-circle" : "play-circle"} size={30} color={isOptimistic || !fileUrl ? "#bdbdbd" : (isOwnMessage ? "#5a8d4c" : "#007AFF")} />} <Text style={[styles.audioText, { marginLeft: 8, color: isOptimistic || !fileUrl ? '#999' : '#000' }]}>{isOptimistic ? "Gönderiliyor..." : (isAudioMsgLoading ? "Yükleniyor..." : "Sesli Mesaj")}</Text> </TouchableOpacity> )}
                              {!isAudio && isImage && ( <TouchableOpacity onPress={() => fileUrl && !isOptimistic ? openImageViewer(fileUrl) : null} disabled={!fileUrl || isOptimistic}> {messageTextToShow ? <Text style={[styles.messageText, { marginBottom: fileUrl ? 5 : 0 }]}>{messageTextToShow}</Text> : null} {fileUrl ? ( <Image source={{ uri: fileUrl }} style={styles.messageImage} resizeMode="cover" /> ) : ( <View style={[styles.messageImage, styles.placeholderImage]}><Ionicons name="image-outline" size={40} color="#ccc" /><Text style={styles.placeholderText}>{isOptimistic ? 'Resim gönderiliyor...' : 'Resim yüklenemedi'}</Text></View> )} </TouchableOpacity> )}
                              {!isAudio && !isImage && isVideo && ( <View> {messageTextToShow ? <Text style={[styles.messageText, { marginBottom: fileUrl ? 5 : 0 }]}>{messageTextToShow}</Text> : null} {fileUrl && !isOptimistic ? ( <View style={styles.videoContainer}> <Video ref={(ref) => { if(ref && fileUrl) videoRefs.current[fileUrl] = ref; }} style={styles.messageVideo} source={{ uri: fileUrl }} useNativeControls={false} resizeMode={Video.RESIZE_MODE_CONTAIN} isLooping={false} onPlaybackStatusUpdate={(status) => onPlaybackStatusUpdate(fileUrl, status)} /> <TouchableOpacity style={styles.videoOverlayButton} onPress={() => handleVideoPlayPause(fileUrl)} disabled={isVideoMsgLoading}> {isVideoMsgLoading ? ( <ActivityIndicator size="large" color="rgba(255, 255, 255, 0.8)" /> ) : ( <Ionicons name={isVideoMsgPlaying ? "pause" : "play"} size={40} color="rgba(255, 255, 255, 0.8)" /> )} </TouchableOpacity> </View> ) : ( <View style={[styles.messageVideo, styles.placeholderVideo]}> <Ionicons name="film-outline" size={40} color="#ccc" /> <Text style={styles.placeholderText}>{isOptimistic ? "Video gönderiliyor..." : "Video yüklenemedi"}</Text> </View> )} </View> )}
                              {isFile && ( <TouchableOpacity onPress={() => Alert.alert("Dosya", "Dosya açma/indirme özelliği henüz eklenmedi.")} disabled={isOptimistic || !fileUrl}> {messageTextToShow ? <Text style={[styles.messageText, { marginBottom: 5 }]}>{messageTextToShow}</Text> : null} <View style={styles.fileMessageContainer}> <Ionicons name="document-attach-outline" size={24} color="#666" /> <Text style={styles.fileText}>Dosya: {item.file?.name || item.file_url?.split('/').pop() || 'Bilinmeyen Dosya'} {isOptimistic ? "(Gönderiliyor...)" : ""}</Text> </View> </TouchableOpacity> )}
                              {isTextMessageType && !isFile && !isAudio && !isImage && !isVideo && ( <Text style={styles.messageText}>{messageTextToShow}</Text> )}

                             {/* Tepkiler ve Zaman Damgası (Aynı) */}
                              {hasReactions && ( <View style={[ styles.messageReactionsContainer, { alignSelf: isOwnMessage ? 'flex-end' : 'flex-start' } ]}> {Object.entries(item.reactions).filter(([, userIds]) => userIds && userIds.length > 0).map(([emoji, userIds]) => ( <TouchableOpacity key={emoji} style={[ styles.messageReactionBadge, userIds.includes(user?.id) ? styles.myReactionBadge : {} ]} onPress={() => handleReaction(item.id || item._id, emoji)} disabled={isSending}> <Text style={styles.messageReactionEmoji}>{emoji}</Text> <Text style={styles.messageReactionCount}>{userIds.length}</Text> </TouchableOpacity> ))} </View> )}
                              <View style={[styles.timestampContainer, { marginTop: hasReactions ? 4 : 4 }]}> {!isOptimistic ? ( <Text style={[styles.messageDate]}> {messageTime} </Text> ) : ( <Text style={[styles.messageDate, { color: 'orange' }]}> Gönderiliyor... </Text> )} {isOwnMessage && !item.isOptimistic && ( <Ionicons name={isSeenByOthers ? "checkmark-done" : "checkmark"} size={16} color={isSeenByOthers ? '#4FC3F7' : '#9e9e9e'} style={{ marginLeft: 4 }} /> )} </View>
                         </View>
                     </View>
                 </Pressable>
             </Animatable.View>
        );
    };


    // --- Ana Render (Yükleme/Hata kontrolleri güncellendi) ---
    const isAnyVideoLoading = Object.values(isVideoLoading).some(loading => loading === true);
     // Hem genel yükleme hem de alıcı bilgisi yüklenirken spinner göster
     const showFullLoadingIndicator = (isLoading || isRecipientInfoLoading) && messages.length === 0 && !initialLoadCompleteRef.current;
     // Sadece alıcı bilgisi/anahtar hatası varsa tam ekran hata göster
     const showFullRecipientError = recipientInfoError && messages.length === 0 && !isRecipientInfoLoading;
     // Mesaj yükleme hatası varsa ve liste boşsa tam ekran hata göster (alıcı hatası yoksa)
     const showFullMessageError = error && messages.length === 0 && !showFullLoadingIndicator && !showFullRecipientError;

    const viewabilityConfig = { itemVisiblePercentThreshold: 50 };

    return (
        <KeyboardAvoidingView style={styles.outerContainer} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={HEADER_HEIGHT} >
            {/* Müzik Paneli (Değişiklik Yok) */}
             <View style={styles.musicPanelContainer}>
                 {/* ... Müzik paneli içeriği ... */}
                 <Animated.View style={[styles.musicPanelAnimated, { width: animatedWidth }]}>
                     <TouchableOpacity onPress={toggleMusicPanel} style={styles.musicIconTouchable}>
                         <Ionicons name="musical-notes-outline" size={24} color="white" />
                     </TouchableOpacity>
                     {isMusicPanelOpen && (
                         <View style={styles.musicPanelContent}>
                             {musicPanelState === 'search' && ( <View style={styles.musicSearchContainer}><TextInput style={styles.musicSearchInput} placeholder="Şarkı adı veya sözü..." placeholderTextColor="#ccc" value={musicSearchQuery} onChangeText={setMusicSearchQuery} editable={!isMusicSearchLoading}/><TouchableOpacity style={[styles.musicSearchButton, (!musicSearchQuery.trim() || isMusicSearchLoading) && styles.disabledButton]} onPress={handleSearchSong} disabled={!musicSearchQuery.trim() || isMusicSearchLoading} ><Ionicons name="search" size={20} color="white" /></TouchableOpacity></View> )}
                             {musicPanelState === 'loading' && ( <View style={styles.musicLoadingContainer}><ActivityIndicator size="small" color="white" /><Text style={styles.musicLoadingText}>Aranıyor...</Text></View> )}
                             {musicPanelState === 'player' && currentPlayingSong && ( <View style={styles.musicPlayerContainer}><Text style={styles.songTitle} numberOfLines={1}>{currentPlayingSong.title}</Text><View style={styles.playerControls}><TouchableOpacity onPress={handleMusicPlayPause} style={styles.playerButton}><Ionicons name={isAudioLoading && currentlyPlayingAudioUri === currentPlayingSong.url ? "hourglass-outline" : (currentlyPlayingAudioUri === currentPlayingSong.url ? "pause-outline" : "play-outline")} size={22} color="white" /></TouchableOpacity><TouchableOpacity onPress={handleMusicStop} style={styles.playerButton} disabled={currentlyPlayingAudioUri !== currentPlayingSong.url || isAudioLoading}><Ionicons name="stop-outline" size={22} color={currentlyPlayingAudioUri !== currentPlayingSong.url || isAudioLoading ? "#aaa" : "white"} /></TouchableOpacity><TouchableOpacity onPress={handleClosePlayer} style={styles.playerButton}><Ionicons name="close-circle-outline" size={22} color="#ff7f7f" /></TouchableOpacity></View></View> )}
                         </View>
                     )}
                 </Animated.View>
             </View>

            {/* --- Tam Ekran Yükleniyor / Hata Göstergeleri (DÜZENLENDİ) --- */}
            {showFullLoadingIndicator && (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color="#007AFF" />
                    <Text style={styles.loadingStateText}>
                        {isRecipientInfoLoading ? "Alıcı bilgileri yükleniyor..." : "Mesajlar yükleniyor..."}
                    </Text>
                </View>
            )}
            {showFullRecipientError && (
                <View style={styles.centerContainer}>
                    <Ionicons name="key-outline" size={50} color="orange" />
                    <Text style={styles.errorText}>{recipientInfoError}</Text>
                     {/* Belki login'e dönme butonu eklenebilir */}
                     <Button title="Sohbet Listesine Dön" onPress={() => navigation.goBack()} color="#007AFF"/>
                </View>
            )}
             {showFullMessageError && (
                 <View style={styles.centerContainer}>
                     <Ionicons name="cloud-offline-outline" size={50} color="red" />
                     <Text style={styles.errorText}>{error}</Text>
                     <Button title="Tekrar Dene" onPress={() => { setError(null); fetchMessages(true); }} color="#007AFF"/>
                 </View>
             )}
            {/* ---------------------------------------------------------- */}


            {/* Mesaj Listesi ve Input Alanı (Sadece yükleme bitince ve alıcı hatası yoksa göster) */}
            {!isRecipientInfoLoading && !recipientInfoError && (
                <>
                     {/* Satır içi Mesaj Yükleme Hatası */}
                     {error && !showFullMessageError && ( // Tam ekran hata yoksa satır içi göster
                        <View style={styles.inlineErrorContainer}>
                            <Text style={styles.inlineErrorText}>{error}</Text>
                            <TouchableOpacity onPress={() => setError('')} style={{ paddingLeft: 10 }}>
                                <Ionicons name="close-circle" size={16} color="#c62828" />
                            </TouchableOpacity>
                        </View>
                    )}
                     {/* Mesaj Listesi */}
                     <FlatList
                         ref={flatListRef}
                         data={messages}
                         renderItem={renderItem}
                         keyExtractor={(item, index) => item.id?.toString() || item._id?.toString() || `message-${index}`}
                         inverted
                         contentContainerStyle={styles.listContentContainer}
                         style={styles.flatList}
                         keyboardShouldPersistTaps="handled"
                         onViewableItemsChanged={handleViewableItemsChanged}
                         viewabilityConfig={viewabilityConfig}
                         ListEmptyComponent={ // Liste boşken gösterilecek component
                             !isLoading ? ( // Sadece mesajlar yüklenmiyorsa boş mesajı göster
                                <View style={styles.centerContainer}>
                                    <Text style={styles.emptyListText}>Henüz mesaj yok.</Text>
                                </View>
                            ) : null
                         }
                     />
                     {/* Giriş Alanı (Alıcı anahtarı yüklendiyse aktif) */}
                      <View style={styles.inputContainerWrapper}>
                         {/* Cevaplama Preview (Değişiklik Yok) */}
                         {replyingToMessage && ( <View style={styles.replyPreviewContainer}> <View style={styles.replyPreviewContent}> <Ionicons name="arrow-undo" size={16} color="#007AFF" style={{ marginRight: 5, transform: [{ scaleX: -1 }] }}/> <Text style={styles.replyPreviewUser} numberOfLines={1}>{replyingToMessage.sender?.username || replyingToMessage.user?.name || 'Bilinmeyen'}</Text> <Text style={styles.replyPreviewText} numberOfLines={1}>{replyingToMessage.text ? replyingToMessage.text : `[${replyingToMessage.file_type}]`}</Text> </View> <TouchableOpacity onPress={() => setReplyingToMessage(null)} style={styles.replyPreviewClose}><Ionicons name="close-circle" size={20} color="#aaa" /></TouchableOpacity> </View> )}
                         {/* Ana Input Alanı */}
                          <View style={styles.inputContainer}>
                              {isRecording ? (
                                  /* ... Kayıt Kontrolleri (Değişiklik Yok) ... */
                                    <>
                                        <TouchableOpacity onPress={() => stopRecording(false)} style={styles.cancelRecordButton}><Ionicons name="trash-outline" size={24} color="#fff" /></TouchableOpacity>
                                        <Text style={styles.recordingDurationText} numberOfLines={1}>{Math.floor(recordingDuration / 60)}:{String(recordingDuration % 60).padStart(2, '0')}</Text>
                                        <View style={{flex:1}} />
                                        <TouchableOpacity onPress={() => stopRecording(true)} style={styles.stopRecordButton} disabled={isSending || recordingDuration < 1}>{isSending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={24} color="#fff" />}</TouchableOpacity>
                                    </>
                              ) : (
                                  /* ... Normal Input Kontrolleri (Değişiklik Yok) ... */
                                    <>
                                         <TouchableOpacity onPress={() => { const hasCameraPermission = cameraPermissionStatus === 'granted'; const hasLibraryPermission = mediaPermissionStatus === 'granted'; if (!hasCameraPermission && !hasLibraryPermission) { Alert.alert( "İzin Gerekli", "Kamera veya galeriye erişmek için izin vermelisiniz.", [ { text: "Ayarlar'a Git", onPress: () => Linking.openSettings() }, { text: "İzin İste", onPress: requestMediaPermissions }, { text: "İptal", style: "cancel" } ] ); return; } const options = []; if (hasCameraPermission) options.push({ text: "Kamera", onPress: () => pickMedia(true) }); if (hasLibraryPermission) options.push({ text: "Galeri", onPress: () => pickMedia(false) }); options.push({ text: "İptal", style: "cancel" }); Alert.alert( "Medya Seç", "Nereden yüklemek istersiniz?", options ); }} style={[styles.iconButton, { backgroundColor: '#007AFF' }]} disabled={isSending || isAudioLoading || isAnyVideoLoading || isRecording || !recipientPublicKeyJwk} >
                                             <Ionicons name="camera" size={24} color="#fff" />
                                         </TouchableOpacity>
                                         <TouchableOpacity onPress={startRecording} style={[styles.iconButton, { backgroundColor: audioPermissionStatus !== 'granted' ? '#aaa' : '#007AFF' }]} disabled={audioPermissionStatus !== 'granted' || isSending || isAudioLoading || isAnyVideoLoading || isRecording || !recipientPublicKeyJwk} >
                                             <Ionicons name="mic-outline" size={24} color="#fff" />
                                         </TouchableOpacity>
                                          <TextInput
                                             value={messageText}
                                             onChangeText={setMessageText}
                                             placeholder={recipientPublicKeyJwk ? "Mesaj yazın..." : "Alıcı anahtarı yükleniyor..."} // Placeholder güncellendi
                                             style={styles.textInput}
                                             multiline
                                              editable={!isSending && !isAudioLoading && !isAnyVideoLoading && !isRecording && !!recipientPublicKeyJwk} // Anahtar varsa aktif
                                          />
                                          <TouchableOpacity
                                             onPress={onSend}
                                             style={[styles.sendButton, (!messageText.trim() || isSending || isAudioLoading || isAnyVideoLoading || isRecording || !recipientPublicKeyJwk) && styles.disabledButton]}
                                             disabled={!messageText.trim() || isSending || isAudioLoading || isAnyVideoLoading || isRecording || !recipientPublicKeyJwk} // Anahtar yoksa pasif
                                          >
                                              {isSending && !isRecording ? <ActivityIndicator size="small" color="white" /> : <Ionicons name="send" size={20} color="#fff" />}
                                          </TouchableOpacity>
                                      </>
                               )}
                           </View>
                       </View>
                </>
             )}

            {/* İşlem Modalı (Değişiklik Yok) */}
            <Modal animationType="fade" transparent={true} visible={isModalVisible} onRequestClose={closeModal} >
                 {/* ... Modal içeriği ... */}
                  <Pressable style={styles.modalOverlay} onPress={closeModal}>
                      <Pressable style={styles.modalContent} onPress={() => {}}>
                          <Text style={styles.modalTitle}>İşlemler</Text>
                          {selectedMessage && (<View style={styles.reactionsContainer}> {AVAILABLE_REACTIONS.map((emoji) => (<TouchableOpacity key={emoji} style={styles.reactionButton} onPress={() => handleReaction(selectedMessage.id || selectedMessage._id, emoji)} disabled={isSending} > <Text style={[ styles.reactionEmoji, selectedMessage.reactions && selectedMessage.reactions[emoji]?.includes(user?.id) ? styles.selectedReactionEmoji : {} ]}> {emoji} </Text> </TouchableOpacity> ))} </View> )}
                          {selectedMessage && ( <TouchableOpacity style={styles.modalButton} onPress={() => { setReplyingToMessage(selectedMessage); closeModal(); }} > <Text style={styles.modalButtonText}>Cevapla</Text> </TouchableOpacity> )}
                           {selectedMessage?.text && selectedMessage?.isDecrypted !== false && (selectedMessage?.file_type === 'text' || selectedMessage?.file_type === 'encrypted_text') && ( <TouchableOpacity style={styles.modalButton} onPress={() => { Clipboard.setString(selectedMessage.text); Alert.alert("Kopyalandı", "Mesaj panoya kopyalandı."); closeModal(); }} > <Text style={styles.modalButtonText}>Kopyala</Text> </TouchableOpacity> )}
                          {/* Şifreli ses dosyalarını çevirme desteklenmiyor (şimdilik) */}
                          {selectedMessage?.file_type === 'audio' && ( <TouchableOpacity style={styles.modalButton} onPress={handleTranscribeAudio} disabled={isTranscribing} > <Text style={styles.modalButtonText}> {isTranscribing ? "Çevriliyor..." : "Metne Çevir"} </Text> </TouchableOpacity> )}
                          {selectedMessage?.file_type === 'audio' && ( <View style={styles.transcriptionResultContainer}> {isTranscribing && ( <View style={styles.activityIndicatorContainer}> <ActivityIndicator size="small" color="#007AFF" /> <Text style={styles.loadingText}>Çevriliyor...</Text> </View> )} {transcriptionError && !isTranscribing && ( <Text style={styles.transcriptionErrorText}>{transcriptionError}</Text> )} {transcribedText && !isTranscribing && !transcriptionError && ( <> <Text style={styles.transcriptionLabel}>Çevrilen Metin:</Text> <TextInput style={styles.transcribedTextInput} value={transcribedText} editable={false} multiline scrollEnabled={false} selectable={true}/> <TouchableOpacity style={[styles.modalButton, { paddingTop: 5, paddingBottom: 5}]} onPress={() => { Clipboard.setString(transcribedText); Alert.alert("Kopyalandı", "Çevrilen metin panoya kopyalandı."); }}> <Text style={[styles.modalButtonText, {fontSize: 14}]}>Metni Kopyala</Text> </TouchableOpacity> </> )} </View> )}
                          <TouchableOpacity style={[styles.modalButton, styles.modalCloseButton]} onPress={closeModal} > <Text style={styles.modalButtonText}>Kapat</Text> </TouchableOpacity>
                      </Pressable>
                  </Pressable>
              </Modal>

            {/* Resim Görüntüleme Modalı (Değişiklik Yok) */}
            <Modal animationType="fade" transparent={true} visible={isImageViewVisible} onRequestClose={closeImageViewer} >
                {/* ... Resim görüntüleme içeriği ... */}
                 <Pressable style={styles.imageViewerOverlay} onPress={closeImageViewer}>
                     <TouchableOpacity style={styles.imageViewerCloseButton} onPress={closeImageViewer}><Ionicons name="close-circle" size={30} color="white" /></TouchableOpacity>
                     <View style={styles.imageViewerContent}>
                         <Image source={{ uri: selectedImageUri }} style={styles.fullScreenImage} resizeMode="contain" />
                     </View>
                 </Pressable>
            </Modal>

        </KeyboardAvoidingView>
    );
};

// --- Stiller (DÜZENLENDİ: Yeni stiller eklendi) ---
const styles = StyleSheet.create({
    outerContainer: { flex: 1, backgroundColor: '#ECE5DD' },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#ECE5DD' },
    errorText: { color: 'red', marginTop: 10, marginBottom: 15, textAlign: 'center', fontSize: 16 },
    loadingStateText: { marginTop: 10, color: '#666', fontSize: 14 }, // Yükleme durumu metni
    emptyListText: { marginTop: 10, color: '#666', fontSize: 14, textAlign: 'center' }, // Boş liste metni
    inlineErrorContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ffebee', paddingHorizontal: 15, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#ffcdd2' },
    inlineErrorText: { color: '#c62828', fontSize: 13, flexShrink: 1 },
    flatList: { flex: 1 },
    listContentContainer: { paddingBottom: 10, paddingHorizontal: 8, flexGrow: 1, justifyContent: 'flex-end' },
    messageBubbleInnerContainer: { marginVertical: 4, paddingHorizontal: 5 },
    messageUserName: { fontSize: 12, color: '#616161', marginBottom: 2, marginLeft: 10, fontWeight: '500' },
    messageBubble: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 1.5, elevation: 1, minWidth: 80, position: 'relative', overflow: 'visible' },
    messageText: { fontSize: 16, color: "#333", lineHeight: 21 },
    audioMessageContainer: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
    audioText: { fontSize: 16 },
    messageImage: { width: screenWidth * 0.6, height: screenWidth * 0.6, maxWidth: 250, maxHeight: 250, borderRadius: 10, marginTop: 5, backgroundColor: '#e0e0e0' },
    placeholderImage: { justifyContent: 'center', alignItems: 'center' },
    placeholderText: { fontSize: 12, color: '#aaa', marginTop: 5, textAlign: 'center' },
    videoContainer: { width: screenWidth * 0.65, height: screenWidth * 0.45, maxWidth: 300, maxHeight: 170, borderRadius: 10, marginTop: 5, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
    messageVideo: { width: '100%', height: '100%' },
    placeholderVideo: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#e0e0e0', width: screenWidth * 0.65, height: screenWidth * 0.45, maxWidth: 300, maxHeight: 170, borderRadius: 10, marginTop: 5 },
    videoOverlayButton: { position: 'absolute', top: '50%', left: '50%', marginTop: -25, marginLeft: -25, width: 50, height: 50, backgroundColor: 'rgba(0, 0, 0, 0.5)', borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
    fileMessageContainer: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10, backgroundColor: '#f0f0f0', borderRadius: 5, marginTop: 5 },
    fileText: { fontSize: 14, marginLeft: 8, color: '#333', flexShrink: 1 },
    inputContainerWrapper: { borderTopWidth: 1, borderTopColor: "#ddd", backgroundColor: "#F5F5F5" },
    inputContainer: { flexDirection: "row", paddingHorizontal: 8, paddingVertical: 8, alignItems: 'flex-end' },
    textInput: { flex: 1, paddingTop: Platform.OS === 'ios' ? 10 : 8, paddingBottom: Platform.OS === 'ios' ? 10 : 8, paddingHorizontal: 15, borderWidth: 1, borderColor: "#ddd", borderRadius: 20, backgroundColor: "white", marginHorizontal: 4, fontSize: 16, maxHeight: 100 },
    iconButton: { padding: 10, borderRadius: 25, justifyContent: 'center', alignItems: 'center', width: 44, height: 44, marginLeft: 4, marginBottom: Platform.OS === 'ios' ? 0 : 4 },
    cancelRecordButton: { padding: 10, borderRadius: 25, width: 44, height: 44, backgroundColor: '#dc3545', justifyContent: 'center', alignItems: 'center', marginRight: 10, marginBottom: Platform.OS === 'ios' ? 0 : 4 },
    stopRecordButton: { padding: 10, borderRadius: 25, width: 44, height: 44, backgroundColor: '#28a745', justifyContent: 'center', alignItems: 'center', marginLeft: 10, marginBottom: Platform.OS === 'ios' ? 0 : 4 },
    recordingDurationText: { fontSize: 16, color: '#333', fontWeight: 'bold', lineHeight: 44, textAlign: 'center', minWidth: 60, marginBottom: Platform.OS === 'ios' ? 0 : 4 },
    sendButton: { padding: 10, borderRadius: 25, justifyContent: 'center', alignItems: 'center', backgroundColor: "#007AFF", width: 44, height: 44, marginLeft: 4, marginBottom: Platform.OS === 'ios' ? 0 : 4 },
    disabledButton: { opacity: 0.5 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { backgroundColor: 'white', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10, borderRadius: 10, width: '85%', maxWidth: 380, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84 },
    modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', color: '#333' },
    modalButton: { paddingVertical: 12, borderTopWidth: 1, borderColor: '#eee', marginTop: 10 },
    modalButtonText: { fontSize: 16, color: '#007AFF', textAlign: 'center' },
    modalCloseButton: {},
    reactionsContainer: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingVertical: 10, marginBottom: 10 },
    reactionButton: { padding: 5 },
    reactionEmoji: { fontSize: 28 },
    selectedReactionEmoji: { transform: [{ scale: 1.1 }] },
    transcriptionResultContainer: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#eee', marginBottom: 5 },
    transcriptionLabel: { fontSize: 14, fontWeight: 'bold', color: '#555', marginBottom: 5 },
    transcribedTextInput: { fontSize: 15, color: '#333', textAlign: 'left', paddingVertical: 8, paddingHorizontal: 5, backgroundColor: '#f9f9f9', borderRadius: 5, maxHeight: 150 },
    transcriptionErrorText: { fontSize: 14, color: 'red', textAlign: 'center', paddingVertical: 10 },
    activityIndicatorContainer: { alignItems: 'center', paddingVertical: 10 },
    loadingText: { marginTop: 5, color: '#666' },
    messageReactionsContainer: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, },
    messageReactionBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, marginRight: 4, marginBottom: 3, borderWidth: 1, borderColor: 'transparent' },
    myReactionBadge: { backgroundColor: '#d0eaff', borderColor: '#a0c4ff' },
    messageReactionEmoji: { fontSize: 12, marginRight: 2 },
    messageReactionCount: { fontSize: 11, fontWeight: 'bold', color: '#555' },
    imageViewerOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.9)', justifyContent: 'center', alignItems: 'center' },
    imageViewerContent: { width: screenWidth, height: screenHeight, justifyContent: 'center', alignItems: 'center' },
    fullScreenImage: { width: '100%', height: '100%' },
    imageViewerCloseButton: { position: 'absolute', top: Platform.OS === 'ios' ? 50 : 20, right: 20, padding: 10, zIndex: 1 },
    musicPanelContainer: { position: 'absolute', top: Platform.OS === 'ios' ? 60 : 20, left: 10, zIndex: 100 },
    musicPanelAnimated: { height: 50, backgroundColor: 'rgba(0, 0, 0, 0.7)', borderRadius: 25, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', paddingLeft: 13 },
    musicIconTouchable: { width: 50, height: 50, justifyContent: 'center', alignItems: 'center', position: 'absolute', left: 0, top: 0, zIndex: 101 },
    musicPanelContent: { flex: 1, height: '100%', flexDirection: 'row', alignItems: 'center', paddingLeft: 50, paddingRight: 10 },
    musicSearchContainer: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    musicSearchInput: { flex: 1, height: 35, backgroundColor: 'rgba(255, 255, 255, 0.2)', borderRadius: 18, paddingHorizontal: 15, color: 'white', fontSize: 14, marginRight: 8 },
    musicSearchButton: { padding: 8, backgroundColor: '#007AFF', borderRadius: 17 },
    musicLoadingContainer: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
    musicLoadingText: { color: 'white', marginLeft: 10 },
    musicPlayerContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    songTitle: { color: 'white', fontSize: 14, fontWeight: 'bold', flexShrink: 1, marginRight: 10 },
    playerControls: { flexDirection: 'row', alignItems: 'center' },
    playerButton: { padding: 5, marginLeft: 8 },
    replyPreviewContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eee', backgroundColor: 'rgba(0, 122, 255, 0.05)', },
    replyPreviewContent: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10, },
    replyPreviewUser: { fontWeight: 'bold', fontSize: 13, color: '#007AFF', marginRight: 5, },
    replyPreviewText: { fontSize: 13, color: '#666', flexShrink: 1, },
    replyPreviewClose: { padding: 5, },
    repliedMessagePreview: { flexDirection: 'row', marginBottom: 6, marginLeft: -5, marginRight: -5, paddingLeft: 8, paddingRight: 8, paddingVertical: 4, backgroundColor: 'rgba(0, 0, 0, 0.05)', borderTopLeftRadius: 15, borderTopRightRadius: 15, borderBottomWidth: 1, borderBottomColor: 'rgba(0, 0, 0, 0.08)', },
    replyIndicator: { width: 3, backgroundColor: '#007AFF', borderRadius: 2, marginRight: 8, },
    repliedContent: { flex: 1, },
    repliedUser: { fontSize: 12, fontWeight: 'bold', color: '#007AFF', marginBottom: 1, },
    repliedText: { fontSize: 13, color: '#555', },
    timestampContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', minHeight: 16, },
    messageDate: { fontSize: 11, color: 'grey', },
});

export default Chat;