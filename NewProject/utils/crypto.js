// utils/crypto.js
import { Platform } from 'react-native'; // Şimdilik kullanılmıyor ama ileride platforma özel işlem için kalabilir
import Sodium from 'react-native-libsodium';
import * as SecureStore from 'expo-secure-store';
import { Buffer } from 'buffer';

// Buffer hatasını önlemek için global'e ekle
if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}

// Anahtar isimleri
const PRIVATE_KEY_KEY = 'e2ee_privateKey';
const PUBLIC_KEY_KEY = 'e2ee_publicKey';

// Base64 yardımcıları
const toBase64 = (uint8Array) => {
  return Buffer.from(uint8Array).toString('base64');
};

const fromBase64 = (base64String) => {
  return Uint8Array.from(Buffer.from(base64String, 'base64'));
};

// Sodium hazır mı?
let isSodiumReady = false;
export const initializeSodium = async () => {
  if (isSodiumReady) return true;
  try {
    await Sodium.ready;
    console.log('[Crypto] Libsodium hazır.');
    isSodiumReady = true;
    return true;
  } catch (e) {
    console.error('[Crypto] Libsodium başlatılamadı:', e);
    return false;
  }
};

// Anahtar çifti üret ve sakla
export const generateAndStoreKeys = async () => {
  if (!isSodiumReady) await initializeSodium();
  if (!isSodiumReady) throw new Error("Libsodium başlatılamadı.");

  try {
    const keyPair = await Sodium.crypto_box_keypair();

    const publicKeyBase64 = toBase64(keyPair.publicKey);
    const privateKeyBase64 = toBase64(keyPair.privateKey);

    await SecureStore.setItemAsync(PUBLIC_KEY_KEY, publicKeyBase64);
    await SecureStore.setItemAsync(PRIVATE_KEY_KEY, privateKeyBase64);

    console.log('[Crypto] Anahtar çifti üretildi ve saklandı.');
    return publicKeyBase64;
  } catch (error) {
    console.error('[Crypto] Anahtar üretme hatası:', error);
    throw error;
  }
};

// Anahtarları getir
export const getKeysFromStore = async () => {
  try {
    const publicKeyBase64 = await SecureStore.getItemAsync(PUBLIC_KEY_KEY);
    const privateKeyBase64 = await SecureStore.getItemAsync(PRIVATE_KEY_KEY);
    return { publicKeyBase64, privateKeyBase64 };
  } catch (error) {
    console.error('[Crypto] Anahtar getirme hatası:', error);
    return { publicKeyBase64: null, privateKeyBase64: null };
  }
};

export const getPublicKeyFromStore = async () => {
  try {
    return await SecureStore.getItemAsync(PUBLIC_KEY_KEY);
  } catch (error) {
    console.error('[Crypto] Açık anahtar hatası:', error);
    return null;
  }
};

export const getPrivateKeyFromStore = async () => {
  try {
    return await SecureStore.getItemAsync(PRIVATE_KEY_KEY);
  } catch (error) {
    console.error('[Crypto] Özel anahtar hatası:', error);
    return null;
  }
};

export const clearStoredKeys = async () => {
  try {
    await SecureStore.deleteItemAsync(PUBLIC_KEY_KEY);
    await SecureStore.deleteItemAsync(PRIVATE_KEY_KEY);
    console.log('[Crypto] Anahtarlar temizlendi.');
  } catch (error) {
    console.error('[Crypto] Anahtar silme hatası:', error);
  }
};

// Mesajı şifrele
export const encryptMessage = async (messagePlaintext, recipientPublicKeyBase64, senderPrivateKeyBase64) => {
  if (!isSodiumReady) await initializeSodium();
  if (!isSodiumReady) throw new Error("Libsodium başlatılamadı.");

  if (!messagePlaintext || !recipientPublicKeyBase64 || !senderPrivateKeyBase64) {
    throw new Error('[Crypto] encryptMessage: Eksik veri.');
  }

  try {
    const messageBytes = Buffer.from(messagePlaintext, 'utf8');
    const recipientPublicKey = fromBase64(recipientPublicKeyBase64);
    const senderPrivateKey = fromBase64(senderPrivateKeyBase64);
    const nonce = await Sodium.randombytes_buf(24); // 24 baytlık nonce

    const ciphertext = await Sodium.crypto_box_easy(
      messageBytes,
      nonce,
      recipientPublicKey,
      senderPrivateKey
    );

    const payload = {
      nonce: toBase64(nonce),
      ciphertext: toBase64(ciphertext),
    };

    return JSON.stringify(payload);
  } catch (error) {
    console.error('[Crypto] Şifreleme hatası:', error);
    throw error;
  }
};

// Mesajı çöz
export const decryptMessage = async (payloadJSON, senderPublicKeyBase64, recipientPrivateKeyBase64) => {
  if (!isSodiumReady) await initializeSodium();
  if (!isSodiumReady) throw new Error("Libsodium başlatılamadı.");

  if (!payloadJSON || !senderPublicKeyBase64 || !recipientPrivateKeyBase64) {
    throw new Error('[Crypto] decryptMessage: Eksik veri.');
  }

  try {
    const payload = JSON.parse(payloadJSON);

    const nonce = fromBase64(payload.nonce);
    const ciphertext = fromBase64(payload.ciphertext);
    const senderPublicKey = fromBase64(senderPublicKeyBase64);
    const recipientPrivateKey = fromBase64(recipientPrivateKeyBase64);

    const decryptedBytes = await Sodium.crypto_box_open_easy(
      ciphertext,
      nonce,
      senderPublicKey,
      recipientPrivateKey
    );

    if (!decryptedBytes) {
      throw new Error('Şifre çözme başarısız. Anahtarlar yanlış veya veri bozuk olabilir.');
    }

    return Buffer.from(decryptedBytes).toString('utf8');
  } catch (error) {
    console.error('[Crypto] Şifre çözme hatası:', error);
    throw error;
  }
};
