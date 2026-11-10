// api/auth.js (expo-secure-store KULLANAN DOĞRU KOD)

import * as SecureStore from 'expo-secure-store';

// SecureStore anahtarı için benzersiz bir isim
const TOKEN_KEY = 'userAuthTokens'; // Bunu kullanacağız

/**
 * Access ve Refresh token'larını SecureStore'a güvenli bir şekilde kaydeder.
 */
export const setTokens = async (accessToken, refreshToken) => {
  if (!accessToken || !refreshToken) {
      console.warn("[auth.js] Kaydedilmeye çalışılan tokenlar eksik.");
      return;
  }
  try {
    console.log("[auth.js] setTokens çağrıldı."); // Log eklendi
    await SecureStore.setItemAsync(
        TOKEN_KEY,
        JSON.stringify({ access: accessToken, refresh: refreshToken })
    );
    console.log('[auth.js] Token SecureStore\'a kaydedildi.'); // Log eklendi
  } catch (error) {
    console.error('[auth.js] SecureStore kaydetme hatası:', error); // Log eklendi
  }
};

/**
 * Kaydedilmiş token'ları SecureStore'dan okur.
 */
export const getTokens = async () => {
  try {
    console.log('[auth.js] getTokens çağrıldı.'); // Log eklendi
    const tokenString = await SecureStore.getItemAsync(TOKEN_KEY);
    if (tokenString) {
      console.log('[auth.js] Token SecureStore\'dan okundu.'); // Log eklendi
      const tokens = JSON.parse(tokenString);
      return tokens;
    }
    console.log('[auth.js] SecureStore\'da token bulunamadı.'); // Log eklendi
    return null;
  } catch (error) {
    console.error('[auth.js] SecureStore okuma hatası:', error); // Log eklendi
    return null;
  }
};

/**
 * SecureStore'daki tüm token bilgilerini siler.
 */
export const clearTokens = async () => {
  try {
    console.log('[auth.js] clearTokens çağrıldı.'); // Log eklendi
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    console.log('[auth.js] Token SecureStore\'dan silindi.'); // Log eklendi
  } catch (error) {
    console.error('[auth.js] SecureStore silme hatası:', error); // Log eklendi
  }
};