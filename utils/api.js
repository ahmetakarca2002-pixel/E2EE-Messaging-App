import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
// auth.js'deki fonksiyonları import et
import { getTokens, setTokens, clearTokens } from '../utils/auth'; // './auth' yerine '../utils/auth' olmalı (genellikle)

// --- Backend Adresi ---
const API_BASE_URL = 'https://5759-88-240-171-243.ngrok-free.app'; // KENDİ ADRESİNİZLE GÜNCELLEYİN
// ---------------------

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // Timeout süresi artırıldı (isteğe bağlı)
  headers: {
    'Content-Type': 'application/json',
  },
});

// --- İstek Interceptor'ı: Token Ekleme ---
api.interceptors.request.use(
  async (config) => {
    const url = config.url;
    console.log(`[Request Interceptor] İstek: ${config.method?.toUpperCase()} ${url}`);

    if (!config.headers) {
        console.warn(`[Request Interceptor - ${url}] Config headers tanımsız!`);
        config.headers = {};
    }

    // Login/register/refresh dışındaki istekler için token ekle
    const noAuthUrls = ['/login/', 'login/', '/register/', 'register/', '/login/refresh/', 'login/refresh/'];
    if (!noAuthUrls.some(noAuthUrl => url?.endsWith(noAuthUrl))) {
      try {
        // console.log(`[Request Interceptor - ${url}] Token alınıyor...`);
        const tokens = await getTokens();
        if (tokens && tokens.access) {
          config.headers.Authorization = `Bearer ${tokens.access}`;
          // console.log(`[Request Interceptor - ${url}] Token eklendi.`);
        } else {
          console.log(`[Request Interceptor - ${url}] Token BULUNAMADI.`);
          // Token yoksa ve header varsa temizle (opsiyonel)
          // delete config.headers.Authorization;
        }
      } catch (tokenError) {
        console.error(`[Request Interceptor - ${url}] getTokens HATA:`, tokenError);
      }
    } else {
      // console.log(`[Request Interceptor - ${url}] Token eklenmiyor (login/register/refresh).`);
    }

    // FormData Content-Type ayarı (Axios normalde halleder, silmek daha güvenli)
    if (config.data instanceof FormData) {
       console.log(`[Request Interceptor - ${url}] FormData algılandı, Content-Type siliniyor.`);
       delete config.headers['Content-Type'];
    }

    return config;
  },
  (error) => {
    console.error('[Request Interceptor] İstek gönderim HATA:', error);
    return Promise.reject(error);
  }
);

// --- Yanıt Interceptor'ı: Token Yenileme ---
api.interceptors.response.use(
  (response) => {
    // Başarılı yanıtlar
    // console.log(`[Response Interceptor] Başarılı Yanıt: ${response.status} ${response.config.method?.toUpperCase()} ${response.config.url}`);
    return response;
  },
  async (error) => {
    // Hata durumları
    const originalRequest = error.config;

    // Hata loglama
    if (error.response) {
        console.error(`[Response Interceptor] Hata Yanıt: Status=${error.response.status}, URL=${error.config?.url}, Data=`, error.response.data);
    } else if (error.request) {
        console.error('[Response Interceptor] Hata: Yanıt alınamadı.', error.request);
    } else {
        console.error('[Response Interceptor] Hata: İstek ayarlanırken sorun.', error.message);
    }

    // originalRequest kontrolü
    if (!originalRequest) {
        console.error("[Response Interceptor] 'config' (originalRequest) bulunamadı! Yenileme atlanıyor.");
        return Promise.reject(error);
    }

    // Token Yenileme Mantığı
    const isUnauthorized = error.response?.status === 401;
    const isTokenError = error.response?.data?.code === 'token_not_valid'; // Django SimpleJWT hatası
    const shouldRetry = !originalRequest._retry;
    const isRefreshEndpoint = originalRequest.url?.endsWith('/login/refresh/');

    if (isUnauthorized && isTokenError && shouldRetry && !isRefreshEndpoint) {
      originalRequest._retry = true;
      try {
        console.log('[Response Interceptor] 401 - Token yenileme deneniyor...');
        const tokens = await getTokens();
        if (!tokens || !tokens.refresh) {
          console.error('[Response Interceptor] Yenileme için Refresh token bulunamadı.');
          await clearTokens();
          // TODO: Kullanıcıyı login'e yönlendirme mekanizması ekle (Context veya event bus ile)
          // Örneğin: AuthContext.dispatch({ type: 'LOGOUT' });
          return Promise.reject(error);
        }

        console.log('[Response Interceptor] Refresh token ile yeni token isteniyor...');
        // Token yenileme isteği için yeni bir axios instance kullanmak döngüyü engeller
        const refreshResponse = await axios.post(`${API_BASE_URL}/login/refresh/`, {
          refresh: tokens.refresh,
        });
        const newAccessToken = refreshResponse.data.access;

        console.log('[Response Interceptor] Yeni token alındı, kaydediliyor...');
        // Eski refresh token'ı koruyarak yeni access token'ı kaydet
        await setTokens(newAccessToken, tokens.refresh);

        // Hem api instance'ının default header'ını hem de orijinal isteğin header'ını güncelle
        if (api.defaults.headers.common) {
             api.defaults.headers.common['Authorization'] = `Bearer ${newAccessToken}`;
        }
        if (!originalRequest.headers) {
            originalRequest.headers = {};
        }
        originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`;

        console.log('[Response Interceptor] Orijinal istek tekrar deneniyor...');
        return api(originalRequest); // Orijinal isteği tekrar gönder

      } catch (refreshError) {
        console.error('[Response Interceptor] Token yenileme BAŞARISIZ:', refreshError.response?.data || refreshError.message);
        await clearTokens();
        // TODO: Kullanıcıyı login'e yönlendir
         // Örneğin: AuthContext.dispatch({ type: 'LOGOUT' });
        // Yenileme hatasını veya orijinal 401 hatasını döndür (refreshError daha açıklayıcı olabilir)
        return Promise.reject(refreshError.response ? refreshError : error);
      }
    }

    // Diğer tüm hatalar
    return Promise.reject(error);
  }
);

export default api;