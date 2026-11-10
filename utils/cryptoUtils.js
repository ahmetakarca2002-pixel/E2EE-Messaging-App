// utils/cryptoUtils.js

import * as SecureStore from 'expo-secure-store';
import { Buffer } from 'buffer';
import api from './api'; // API utility'nizin doğru yolda olduğundan emin olun

// --- Noble Kütüphaneleri ---
import { p256 } from '@noble/curves/p256'; // P-256 eğrisi için
import { sha256 } from '@noble/hashes/sha256'; // SHA256 hash
import { hkdf } from '@noble/hashes/hkdf'; // HKDF anahtar türetme
import { aes256gcm } from '@noble/ciphers/aes'; // AES-GCM şifreleme (doğru import)
import { randomBytes, bytesToHex, hexToBytes } from '@noble/ciphers/utils'; // Rastgele byte, hex dönüşümleri
import { utf8ToBytes, bytesToUtf8 } from '@noble/ciphers/utils'; // UTF8 dönüşümleri

// --- Anahtar İsimleri ---
const PRIVATE_KEY_JWK_TAG = 'my_app_ec_private_key_jwk';
const PUBLIC_KEY_JWK_TAG = 'my_app_ec_public_key_jwk';

// --- Base64URL Kodlama/Çözme ---
const base64UrlEncode = (buffer) => {
    if (!buffer || !(buffer instanceof Buffer)) { // EKLENDİ: Buffer kontrolü
        console.error("[CryptoUtils] base64UrlEncode: Geçersiz buffer!", buffer);
        return null; // Hata durumunda null dön
    }
    return buffer.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
};

const base64UrlDecode = (str) => {
    if (typeof str !== 'string') { // EKLENDİ: String kontrolü
        console.error("[CryptoUtils] base64UrlDecode: Geçersiz string!", str);
        return Buffer.alloc(0); // Hata durumunda boş buffer dön
    }
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) {
        str += '=';
    }
    return Buffer.from(str, 'base64');
};

// --- Anahtar Üretme ve Saklama ---
export const generateAndStoreKeys = async () => {
    console.log('[CryptoUtils] LOG: generateAndStoreKeys BAŞLADI...'); // LOG EKLENDİ
    const yBytes = publicKeyBytes.slice(33);
    console.log(`[CryptoUtils] LOG: Raw yBytes (hex): ${bytesToHex(yBytes)}`); // Ham y baytlarını hex olarak yazdır
    console.log(`[CryptoUtils] LOG: Raw yBytes (length): ${yBytes.length}`);
    const yBuffer = Buffer.from(yBytes);
    console.log(`[CryptoUtils] LOG: yBuffer (Buffer):`, yBuffer); // Buffer objesini yazdır
    const yBase64Attempt = yBuffer.toString('base64');
    console.log(`[CryptoUtils] LOG: yBuffer.toString('base64'):`, yBase64Attempt); // Standart Base64 denemesini yazdır
    const yBase64 = base64UrlEncode(yBuffer); // Fonksiyonu çağır
    console.log(`[CryptoUtils] LOG: Encoded yBase64 (final): ${yBase64}`); // Sonucu yazdır
    try {
        const privateKeyBytes = p256.utils.randomPrivateKey();
        const publicKeyBytes = p256.getPublicKey(privateKeyBytes);
        console.log(`[CryptoUtils] LOG: Raw publicKeyBytes (hex): ${bytesToHex(publicKeyBytes)}`); // LOG EKLENDİ

        const xBytes = publicKeyBytes.slice(1, 33);
        const yBytes = publicKeyBytes.slice(33);
        console.log(`[CryptoUtils] LOG: Extracted xBytes length: ${xBytes.length}, yBytes length: ${yBytes.length}`); // LOG EKLENDİ

        const xBase64 = base64UrlEncode(Buffer.from(xBytes));
        const yBase64 = base64UrlEncode(Buffer.from(yBytes));
        console.log(`[CryptoUtils] LOG: Encoded xBase64: ${xBase64}`); // LOG EKLENDİ
        console.log(`[CryptoUtils] LOG: Encoded yBase64: ${yBase64}`); // LOG EKLENDİ

        // EKLENDİ: base64UrlEncode null döndü mü kontrolü
        if (xBase64 === null || yBase64 === null) {
             throw new Error(`Base64URL encoding failed for coordinates. x: ${xBase64}, y: ${yBase64}`);
        }

        const publicKeyJwk = {
            kty: 'EC',
            crv: 'P-256',
            x: xBase64,
            y: yBase64,
        };

        const privateKeyJwk = {
            ...publicKeyJwk,
            d: base64UrlEncode(Buffer.from(privateKeyBytes)),
        };

        // LOG EKLENDİ: Kaydetmeden hemen önce JWK'ları logla
        console.log('[CryptoUtils] LOG: Oluşturulan publicKeyJwk:', JSON.stringify(publicKeyJwk, null, 2));
        console.log('[CryptoUtils] LOG: Oluşturulan privateKeyJwk:', JSON.stringify(privateKeyJwk, null, 2)); // d değerini loglarda görmemeye dikkat edin!

        await SecureStore.setItemAsync(PUBLIC_KEY_JWK_TAG, JSON.stringify(publicKeyJwk));
        await SecureStore.setItemAsync(PRIVATE_KEY_JWK_TAG, JSON.stringify(privateKeyJwk));

        console.log('[CryptoUtils] LOG: generateAndStoreKeys BAŞARILI.'); // LOG EKLENDİ
        return { privateKeyJwk, publicKeyJwk };

    } catch (error) {
        console.error('[CryptoUtils] LOG: generateAndStoreKeys HATA:', error); // LOG EKLENDİ
        throw error; // Hatanın yukarıya iletilmesi önemli
    }
};

// --- Saklanan JWK Anahtarlarını Alma ---
export const getStoredKeys = async () => {
    // console.log('[CryptoUtils] LOG: getStoredKeys BAŞLADI...'); // İsteğe bağlı log
    try {
        const publicKeyJson = await SecureStore.getItemAsync(PUBLIC_KEY_JWK_TAG);
        const privateKeyJson = await SecureStore.getItemAsync(PRIVATE_KEY_JWK_TAG);

        // LOG EKLENDİ: SecureStore'dan okunan ham JSON'ları logla
        // console.log('[CryptoUtils] LOG: SecureStore publicKeyJson:', publicKeyJson);
        // console.log('[CryptoUtils] LOG: SecureStore privateKeyJson:', privateKeyJson);

        if (!publicKeyJson || !privateKeyJson) {
            console.log('[CryptoUtils] LOG: getStoredKeys - Saklanan anahtar bulunamadı.'); // LOG EKLENDİ
            return null;
        }

        const publicKeyJwk = JSON.parse(publicKeyJson);
        const privateKeyJwk = JSON.parse(privateKeyJson);

        // LOG EKLENDİ: Parse edilmiş JWK'ları logla (doğrulama amaçlı)
        // console.log('[CryptoUtils] LOG: getStoredKeys - Ayrıştırılmış publicKeyJwk:', JSON.stringify(publicKeyJwk, null, 2));

        return { publicKeyJwk, privateKeyJwk };
    } catch (error) {
        console.error('[CryptoUtils] LOG: getStoredKeys HATA:', error); // LOG EKLENDİ
        return null;
    }
};

// --- Public Anahtarı Sunucuya Yükleme ---
export const uploadPublicKey = async (publicKeyJwk) => {
    console.log('[CryptoUtils] LOG: uploadPublicKey BAŞLADI...'); // LOG EKLENDİ
    if (!publicKeyJwk) {
        console.error('[CryptoUtils] LOG: uploadPublicKey - Yüklenecek public key eksik.'); // LOG EKLENDİ
        return; // Veya hata fırlat
    }

    // LOG EKLENDİ: Yüklenmek üzere gönderilecek JWK'yı logla
    console.log('[CryptoUtils] LOG: Sunucuya yüklenen publicKeyJwk:', JSON.stringify(publicKeyJwk, null, 2));

    try {
        const response = await api.post('/keys/upload/', {
             public_key_jwk: publicKeyJwk
        });
        console.log('[CryptoUtils] LOG: uploadPublicKey BAŞARILI.'); // LOG EKLENDİ
        return response.data;
    } catch (error) {
        console.error('[CryptoUtils] LOG: uploadPublicKey HATA:', error?.response?.data || error.message); // LOG EKLENDİ
        throw error;
    }
};

// --- Belirli Kullanıcının Public Anahtarını Alma ---
export const fetchPublicKeyForUser = async (userId) => {
    console.log(`[CryptoUtils] LOG: fetchPublicKeyForUser BAŞLADI (User ID: ${userId})...`); // LOG EKLENDİ
    if (!userId) {
        console.error('[CryptoUtils] LOG: fetchPublicKeyForUser - User ID gerekli.'); // LOG EKLENDİ
        return null;
    }
    try {
        const response = await api.get(`/keys/user/${userId}/`);

        // LOG EKLENDİ: API'den gelen tüm yanıtı logla
        console.log(`[CryptoUtils] LOG: fetchPublicKeyForUser(${userId}) - API Yanıtı (status ${response.status}):`, JSON.stringify(response.data, null, 2));

        if (response.status === 200 && response.data?.public_key_jwk) {
             // LOG EKLENDİ: Dönen public key'i logla
             console.log(`[CryptoUtils] LOG: fetchPublicKeyForUser(${userId}) - Dönen public_key_jwk:`, JSON.stringify(response.data.public_key_jwk, null, 2));
            return response.data.public_key_jwk;
        } else {
            console.warn(`[CryptoUtils] LOG: fetchPublicKeyForUser(${userId}) - Beklenmeyen yanıt veya eksik anahtar.`); // LOG EKLENDİ
            return null;
        }
    } catch (error) {
        if (error.response && error.response.status === 404) {
            console.log(`[CryptoUtils] LOG: fetchPublicKeyForUser(${userId}) - Public key bulunamadı (404).`); // LOG EKLENDİ
        } else {
             console.error(`[CryptoUtils] LOG: fetchPublicKeyForUser(${userId}) HATA:`, error?.response?.data || error.message); // LOG EKLENDİ
        }
        return null;
    }
};

// --- Anahtarların Var Olduğundan ve Yüklendiğinden Emin Olma ---
export const ensureKeysExistAndUploaded = async () => {
    console.log('[CryptoUtils] LOG: ensureKeysExistAndUploaded BAŞLADI...'); // LOG EKLENDİ
    try {
        let keys = await getStoredKeys();
        let publicKeyToUpload = keys?.publicKeyJwk;

        if (!keys) {
            console.log('[CryptoUtils] LOG: ensureKeysExistAndUploaded - Yerel anahtar yok, yeni üretiliyor...'); // LOG EKLENDİ
            keys = await generateAndStoreKeys();
            publicKeyToUpload = keys?.publicKeyJwk;
        } else {
            console.log('[CryptoUtils] LOG: ensureKeysExistAndUploaded - Yerel anahtar bulundu.'); // LOG EKLENDİ
            // LOG EKLENDİ: Yerelde bulunan anahtarı logla
            console.log('[CryptoUtils] LOG: Yerelde bulunan publicKeyJwk:', JSON.stringify(publicKeyToUpload, null, 2));
        }

        if (publicKeyToUpload) {
             // EKLENDİ: Yüklemeden önce x ve y kontrolü
             if (!publicKeyToUpload.x || !publicKeyToUpload.y) {
                  console.error('[CryptoUtils] LOG: ensureKeysExistAndUploaded - YÜKLEME ÖNCESİ KONTROL BAŞARISIZ! publicKeyJwk x veya y eksik!', JSON.stringify(publicKeyToUpload, null, 2));
                  // Hata fırlatabilir veya yeniden üretmeyi deneyebilir
                   throw new Error("Yerel publicKeyJwk x veya y koordinatları eksik. Yükleme yapılamaz.");
             }
            console.log('[CryptoUtils] LOG: ensureKeysExistAndUploaded - Public key yükleniyor...'); // LOG EKLENDİ
            await uploadPublicKey(publicKeyToUpload);
        } else {
             console.error("[CryptoUtils] LOG: ensureKeysExistAndUploaded - Public key üretme/alma sonrası hala eksik!"); // LOG EKLENDİ
        }
        console.log('[CryptoUtils] LOG: ensureKeysExistAndUploaded BİTTİ.'); // LOG EKLENDİ
    } catch (error) {
        console.error('[CryptoUtils] LOG: ensureKeysExistAndUploaded HATA:', error); // LOG EKLENDİ
    }
};

// --- ECDH ile Ortak Gizli Anahtar Hesaplama ---
async function computeSharedSecret(myPrivateKeyJwk, peerPublicKeyJwk) {
    console.log('[CryptoUtils] LOG: computeSharedSecret BAŞLADI...'); // LOG EKLENDİ

    // LOG EKLENDİ: Fonksiyona gelen peerPublicKeyJwk'yı logla
    console.log('[CryptoUtils] LOG: computeSharedSecret - Gelen peerPublicKeyJwk:', JSON.stringify(peerPublicKeyJwk, null, 2));

    try {
        // KONTROL GÜNCELLENDİ: Sadece varlığını değil, geçerli bir string olup olmadığını da kontrol et
        if (!myPrivateKeyJwk?.d || typeof myPrivateKeyJwk.d !== 'string' || myPrivateKeyJwk.d.length === 0) {
             throw new Error(`Geçersiz özel anahtar (JWK.d eksik veya geçersiz tip/uzunluk). Tip: ${typeof myPrivateKeyJwk?.d}, Değer: ${myPrivateKeyJwk?.d}`);
        }
        if (!peerPublicKeyJwk?.x || typeof peerPublicKeyJwk.x !== 'string' || peerPublicKeyJwk.x.length === 0 ||
            !peerPublicKeyJwk?.y || typeof peerPublicKeyJwk.y !== 'string' || peerPublicKeyJwk.y.length === 0) {
             // Hata mesajını daha detaylı yapalım
             throw new Error(`Geçersiz karşı taraf genel anahtarı. x: [Tip: ${typeof peerPublicKeyJwk?.x}, Değer: ${peerPublicKeyJwk?.x}], y: [Tip: ${typeof peerPublicKeyJwk?.y}, Değer: ${peerPublicKeyJwk?.y}]`);
        }

        const privateKeyBytes = base64UrlDecode(myPrivateKeyJwk.d);
        const xBytes = base64UrlDecode(peerPublicKeyJwk.x);
        const yBytes = base64UrlDecode(peerPublicKeyJwk.y);

        // EKLENDİ: Decode sonrası byte array kontrolü
        if (xBytes.length !== 32 || yBytes.length !== 32) {
             throw new Error(`Base64URL decode sonrası koordinat uzunlukları geçersiz. x: ${xBytes.length}, y: ${yBytes.length}`);
        }

        const peerPublicKeyBytes = Buffer.concat([ Buffer.from([0x04]), xBytes, yBytes ]);

        const sharedSecretPoint = p256.getSharedSecret(privateKeyBytes, peerPublicKeyBytes);
        const sharedSecretX = sharedSecretPoint.slice(1, 33);

        console.log('[CryptoUtils] LOG: computeSharedSecret BAŞARILI.'); // LOG EKLENDİ
        return sharedSecretX;

    } catch (error) {
        console.error('[CryptoUtils] LOG: computeSharedSecret HATA:', error); // LOG EKLENDİ
        // Orijinal hatayı tekrar fırlatmak yerine daha açıklayıcı bir hata fırlatabiliriz
        throw new Error(`Paylaşılan sır hesaplanamadı: ${error.message}`);
    }
}

// --- HKDF ile Paylaşılan Sırdan AES Anahtarı Türetme ---
// Bu fonksiyonda ekstra log eklemeye şimdilik gerek yok, hata genellikle computeSharedSecret'ten sonra olur.
async function deriveAesKeyFromSecret(sharedSecretBytes) {
    try {
        const salt = undefined;
        const info = utf8ToBytes("ChatApp-AES-256-GCM-KeyDerivation-v1");
        const keyLength = 32;
        const derivedKey = hkdf(sha256, sharedSecretBytes, salt, info, keyLength);
        return derivedKey;
    } catch (error) {
        console.error("[CryptoUtils] LOG: deriveAesKeyFromSecret HATA:", error); // LOG EKLENDİ
        throw new Error("AES anahtarı türetilemedi.");
    }
}


// --- Mesaj Şifreleme (AES-GCM @noble/ciphers) ---
export const encryptMessage = async (plainText, peerPublicKeyJwk) => {
    console.log('[CryptoUtils] LOG: encryptMessage BAŞLADI...'); // LOG EKLENDİ
    try {
        const storedKeys = await getStoredKeys();
        if (!storedKeys?.privateKeyJwk) throw new Error("Şifreleme için özel anahtar bulunamadı.");

        // LOG EKLENDİ: Şifreleme için kullanılacak peerPublicKeyJwk'yı logla
        console.log('[CryptoUtils] LOG: encryptMessage - Kullanılacak peerPublicKeyJwk:', JSON.stringify(peerPublicKeyJwk, null, 2));

        const sharedSecretBytes = await computeSharedSecret(storedKeys.privateKeyJwk, peerPublicKeyJwk);
        const aesKeyBytes = await deriveAesKeyFromSecret(sharedSecretBytes);
        const iv = randomBytes(12);
        const plainTextBytes = utf8ToBytes(plainText);
        const cipher = aes256gcm(aesKeyBytes, iv);
        const encryptedBytes = await cipher.encrypt(plainTextBytes);
        const ivAndCiphertext = Buffer.concat([Buffer.from(iv), Buffer.from(encryptedBytes)]);
        const encryptedBase64 = ivAndCiphertext.toString('base64');

        console.log('[CryptoUtils] LOG: encryptMessage BAŞARILI.'); // LOG EKLENDİ
        return encryptedBase64;

    } catch (error) {
        console.error('[CryptoUtils] LOG: encryptMessage HATA:', error); // LOG EKLENDİ
        throw new Error(`Mesaj şifrelenemedi: ${error.message || 'Bilinmeyen hata'}`);
    }
};

// --- Mesaj Şifresini Çözme (AES-GCM @noble/ciphers) ---
export const decryptMessage = async (encryptedBase64, senderPublicKeyJwk) => {
    console.log('[CryptoUtils] LOG: decryptMessage BAŞLADI...'); // LOG EKLENDİ
    try {
        if (!encryptedBase64) throw new Error("Şifresi çözülecek metin eksik.");
        if (!senderPublicKeyJwk) throw new Error("Şifre çözme için gönderenin JWK anahtarı gerekli.");

        // LOG EKLENDİ: Şifre çözme için kullanılacak senderPublicKeyJwk'yı logla
        console.log('[CryptoUtils] LOG: decryptMessage - Kullanılacak senderPublicKeyJwk:', JSON.stringify(senderPublicKeyJwk, null, 2));

        const ivAndCiphertext = Buffer.from(encryptedBase64, 'base64');
        if (ivAndCiphertext.length < 13) {
            throw new Error(`Geçersiz şifreli veri (uzunluk: ${ivAndCiphertext.length}). IV ayrılamadı.`); // Hata mesajı güncellendi
        }

        const iv = ivAndCiphertext.slice(0, 12);
        const encryptedBytes = ivAndCiphertext.slice(12);

        const storedKeys = await getStoredKeys();
        if (!storedKeys?.privateKeyJwk) throw new Error("Şifre çözme için yerel özel anahtar bulunamadı.");

        const sharedSecretBytes = await computeSharedSecret(storedKeys.privateKeyJwk, senderPublicKeyJwk);
        const aesKeyBytes = await deriveAesKeyFromSecret(sharedSecretBytes);
        const cipher = aes256gcm(aesKeyBytes, new Uint8Array(iv));
        const decryptedBytes = await cipher.decrypt(new Uint8Array(encryptedBytes));
        const decryptedText = bytesToUtf8(decryptedBytes);

        console.log('[CryptoUtils] LOG: decryptMessage BAŞARILI.'); // LOG EKLENDİ
        return decryptedText;

    } catch (error) {
        console.error('[CryptoUtils] LOG: decryptMessage HATA:', error); // LOG EKLENDİ
        if (error.message && (error.message.toLowerCase().includes('decryption failed') || error.message.toLowerCase().includes('tag mismatch'))) {
            console.error("[CryptoUtils] LOG: decryptMessage - KRİTİK HATA (yanlış anahtar veya veri bozulması)."); // LOG EKLENDİ
            throw new Error("Mesajın şifresi çözülemedi. Mesajın bütünlüğü bozulmuş olabilir veya yanlış anahtar kullanılmış olabilir.");
        }
        throw new Error(`Mesajın şifresi çözülemedi: ${error.message || 'Bilinmeyen hata'}`);
    }
};