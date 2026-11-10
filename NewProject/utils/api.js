import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
// auth.js'deki fonksiyonları import et (aynı klasörde oldukları için ./)
import { getTokens, setTokens, clearTokens } from './auth';

// --- ÖNEMLİ: Django backend adresiniz ---
// Kendi IP adresinizle veya emülatör için doğru adresle değiştirin!
// Örnekler:
const API_BASE_URL = 'https://9a1b-78-182-149-120.ngrok-free.app/api';
// const API_BASE_URL = 'http://192.168.1.105:8000/api'; // Yerel IP Adresiniz
// const API_BASE_URL = 'http://127.0.0.1:8000/api'; // Test için localhost (genelde mobil cihazda çalışmaz)
// -----------------------------------------

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // Timeout süresini biraz artırabilirsiniz (15 saniye)
  headers: {
    'Content-Type': 'application/json',
  },
});

// --- İstek Interceptor'ı: Token Ekleme ---
// api.js - Request Interceptor (Loglar Eklenmiş Hali)

api.interceptors.request.use(
  async (config) => {
    const url = config.url; // İstek yapılan URL
    console.log(`[Request Interceptor] İstek gönderiliyor: ${url}`); // URL'yi logla

    // Sadece login/register/refresh dışındaki istekler için token ekle
    if (url !== '/login/' && url !== 'login/' && url !== '/register/' && url !== 'register/' && url !== '/login/refresh/' && url !== 'login/refresh/') {
        try {
            const tokens = await getTokens(); // Token'ları almayı dene
            if (tokens && tokens.access) {
                config.headers.Authorization = `Bearer ${tokens.access}`;
                // Özellikle /chats/ isteği için daha detaylı log
                if (url === '/chats/' || url === 'chats/') {
                    console.log('[Request Interceptor - /chats/] Token BAŞARIYLA eklendi.');
                }
                // else { console.log(`[Request Interceptor - ${url}] Token eklendi.`); } // Diğerleri için gerekirse aç
            } else {
                 // Token alınamadıysa logla
                console.log(`[Request Interceptor - ${url}] Token BULUNAMADI.`);
            }
        } catch (tokenError) {
             // Token alma sırasında hata olursa logla
            console.error(`[Request Interceptor - ${url}] Token alınırken HATA:`, tokenError);
        }
    } else {
        console.log(`[Request Interceptor - ${url}] Token eklenmiyor (login/register/refresh).`);
    }

    // FormData Content-Type ayarı
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    // api.js -> api.interceptors.request.use -> async (config) => { ... } bloğunun sonu
    if (config.data instanceof FormData) {
      console.log('>>> [Request Interceptor] Final HEADERS for FormData request:', JSON.stringify(config.headers, null, 2));
    } else {
      console.log('>>> [Request Interceptor] Final HEADERS for non-FormData request:', JSON.stringify(config.headers, null, 2));
    }
    return config;
  },
  (error) => {
    console.error('[Request Interceptor] İstek Hatası:', error);
    return Promise.reject(error);
  }
);

// --- Yanıt Interceptor'ı: Token Yenileme ---
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry && originalRequest.url !== '/login/refresh/') {
      originalRequest._retry = true;
      try {
        console.log('Access token expired or invalid. Attempting refresh...');
        const tokens = await getTokens();
        if (!tokens || !tokens.refresh) {
           console.error('No refresh token found for refresh attempt.');
           await clearTokens();
           // Burada kullanıcıyı login'e yönlendirme global state üzerinden yapılmalı
           return Promise.reject(error);
        }
        const { data } = await axios.post(`${API_BASE_URL}/login/refresh/`, {
          refresh: tokens.refresh,
        });
        await setTokens(data.access, tokens.refresh);
        console.log('Token refreshed successfully.');
        api.defaults.headers.common['Authorization'] = `Bearer ${data.access}`;
        originalRequest.headers['Authorization'] = `Bearer ${data.access}`;
        return api(originalRequest);
      } catch (refreshError) {
        console.error('Unable to refresh token:', refreshError.response?.data || refreshError.message);
        await clearTokens();
         // Burada kullanıcıyı login'e yönlendirme global state üzerinden yapılmalı
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

export default api;