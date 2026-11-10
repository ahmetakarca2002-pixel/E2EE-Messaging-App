// context/AuthContext.js

import React, { createContext, useState, useEffect, useContext } from 'react';
import api from '../utils/api';
import { getTokens, clearTokens, setTokens } from '../utils/auth';
// --- YENİ: Crypto importları ---
import {
    initializeSodium,
    generateAndStoreKeys,
    getKeysFromStore,
    clearStoredKeys
 } from '../utils/crypto'; // crypto.js yolunu doğrulayın
// -----------------------------

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [accessToken, setAccessToken] = useState(null);
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    // --- YENİ: Anahtar durumu state'i (opsiyonel) ---
    const [keysReady, setKeysReady] = useState(false);
    // ----------------------------------------------

    // --- YENİ: Public Key'i Backend'e Yükleme Fonksiyonu ---
    const uploadPublicKey = async (publicKeyBase64) => {
        if (!publicKeyBase64) return;
        console.log('[Auth] Attempting to upload public key to backend...');
        try {
            // Adım 2'de oluşturduğumuz endpoint'i kullan
            await api.patch('/users/me/public_key/', {
                public_key: publicKeyBase64
            });
            console.log('[Auth] Public key successfully uploaded.');
            // Kullanıcı nesnesini lokalde güncellemek isteyebiliriz ama fetchUserData zaten yapacak.
            // setUser(prevUser => ({ ...prevUser, public_key: publicKeyBase64 }));
        } catch (uploadError) {
            console.error('[Auth] Failed to upload public key:', uploadError.response?.data || uploadError.message);
            // Hata durumunda ne yapılacağına karar verin (örn: tekrar dene, kullanıcıyı bilgilendir)
            // Şimdilik sadece logluyoruz.
             setError("Genel anahtar sunucuya yüklenemedi."); // Kullanıcıya bilgi verilebilir
        }
    };
    // -------------------------------------------------------


    useEffect(() => {
        const loadAuthData = async () => {
            setIsLoading(true);
            setError(null);
            setKeysReady(false); // Başlangıçta anahtarlar hazır değil

            try {
                // --- YENİ: Sodium'u başlat ---
                await initializeSodium();
                // ---------------------------

                const tokens = await getTokens();
                if (tokens && tokens.access) {
                    console.log('[Auth] Token found on initial load.');
                    api.defaults.headers.common['Authorization'] = `Bearer ${tokens.access}`;
                    setAccessToken(tokens.access); // Token'ı state'e hemen alalım

                    // Kullanıcı bilgisini çek (bu user state'ini dolduracak)
                    await fetchUserData(tokens.access);

                    // --- YENİ: Anahtarları Kontrol Et/Oluştur/Yükle ---
                    console.log('[Auth] Checking for E2EE keys...');
                    const { publicKeyBase64, privateKeyBase64 } = await getKeysFromStore();

                    if (publicKeyBase64 && privateKeyBase64) {
                         console.log('[Auth] Existing E2EE keys found in SecureStore.');
                         setKeysReady(true); // Anahtarlar mevcut ve hazır

                         // Opsiyonel: Backend'deki anahtarla lokaldeki eşleşiyor mu kontrolü
                         // const backendPublicKey = user?.public_key; // fetchUserData sonrası user'dan alınır
                         // if (backendPublicKey && publicKeyBase64 !== backendPublicKey) {
                         //     console.warn('[Auth] Local public key differs from backend! Re-uploading local key.');
                         //     await uploadPublicKey(publicKeyBase64);
                         // } else if (!backendPublicKey) {
                         //      console.log('[Auth] Backend has no public key. Uploading local key.');
                         //      await uploadPublicKey(publicKeyBase64);
                         // }

                    } else {
                        console.log('[Auth] No E2EE keys found. Generating new keys...');
                        try {
                            const newPublicKeyBase64 = await generateAndStoreKeys();
                            // Yeni üretilen public key'i backend'e yükle
                            await uploadPublicKey(newPublicKeyBase64);
                            setKeysReady(true); // Anahtarlar oluşturuldu ve yüklendi (veya yükleme hatası loglandı)
                        } catch (keyGenError) {
                            console.error("[Auth] Failed to generate/store/upload keys:", keyGenError);
                            setError("Kriptografik anahtarlar oluşturulamadı.");
                            // Anahtar üretilemezse E2EE kullanılamaz, belki logout?
                            setKeysReady(false);
                        }
                    }
                    // -------------------------------------------------

                } else {
                    console.log('[Auth] No token found on initial load.');
                    clearAuthState(); // Token yoksa state'i temizle (anahtarları da siler)
                }
            } catch (e) {
                console.error("[Auth] Error loading auth data:", e);
                setError("Oturum bilgileri yüklenirken bir hata oluştu.");
                clearAuthState(); // Hata durumunda temizle
            } finally {
                setIsLoading(false);
            }
        };

        loadAuthData();
    }, []); // Sadece mount'ta çalışır

    const fetchUserData = async (tokenToUse) => {
        // ... (Bu fonksiyon önceki adımdaki gibi kalabilir) ...
         if (!tokenToUse) { console.log("fetchUserData called without a token."); clearAuthState(); return; }
         const currentAuthHeader = api.defaults.headers.common['Authorization'];
         if (!currentAuthHeader || currentAuthHeader !== `Bearer ${tokenToUse}`) {
             api.defaults.headers.common['Authorization'] = `Bearer ${tokenToUse}`;
         }
        try {
            console.log('[Auth] Fetching user data...');
            const response = await api.get('/users/me/'); // public_key de gelmeli
            if (response.data) {
                setUser(response.data);
                console.log('[Auth] User data fetched:', {username: response.data.username, hasPublicKey: !!response.data.public_key});
                setError(null);
            } else { throw new Error("User data not found in response"); }
        } catch (error) {
            console.error("[Auth] Failed to fetch user data:", error.response?.data || error.message);
            setError("Kullanıcı bilgileri alınamadı.");
            clearAuthState(); // Hata durumunda temizle (token geçersiz olabilir)
        }
    };

    const login = async (newAccessToken, newRefreshToken) => {
       setIsLoading(true); setError(null); setKeysReady(false); // Login başlarken anahtarlar hazır değil
       try {
           await setTokens(newAccessToken, newRefreshToken);
           setAccessToken(newAccessToken);
           api.defaults.headers.common['Authorization'] = `Bearer ${newAccessToken}`;
           await fetchUserData(newAccessToken); // Kullanıcı bilgisini çek

           // --- YENİ: Login sonrası anahtar kontrolü/üretimi/yüklemesi ---
           console.log('[Auth] Checking/Generating E2EE keys after login...');
           const { publicKeyBase64, privateKeyBase64 } = await getKeysFromStore();
           if (publicKeyBase64 && privateKeyBase64) {
                console.log('[Auth] E2EE keys found after login.');
                setKeysReady(true);
                // Opsiyonel: Backend'deki ile kontrol et ve gerekirse yükle (yukarıdaki gibi)
           } else {
               console.log('[Auth] No E2EE keys found after login. Generating...');
               try {
                   const newPublicKeyBase64 = await generateAndStoreKeys();
                   await uploadPublicKey(newPublicKeyBase64);
                   setKeysReady(true);
               } catch (keyGenError) {
                   console.error("[Auth] Failed to generate/store/upload keys after login:", keyGenError);
                   setError("Kriptografik anahtarlar oluşturulamadı.");
                   setKeysReady(false);
               }
           }
           // ----------------------------------------------------------

           console.log('[Auth] User logged in successfully.');
       } catch (e) {
           console.error("[Auth] Login process error (in context):", e);
           setError("Giriş işlemi sırasında bir hata oluştu.");
           clearAuthState();
       } finally {
           setIsLoading(false);
       }
    };

    // State'i temizleyen yardımcı fonksiyon (anahtarları da silmeli)
    const clearAuthState = async () => { // async yapalım
        console.log("[Auth] Clearing auth state...");
        setAccessToken(null);
        setUser(null);
        setKeysReady(false); // Anahtarlar artık geçerli/hazır değil
        delete api.defaults.headers.common['Authorization'];
        // --- YENİ: SecureStore'daki anahtarları da temizle ---
        await clearStoredKeys();
        // -------------------------------------------------
        // Tokenları zaten çağıran fonksiyon (örn: logout) siliyor.
    };


    const logout = async () => {
        console.log('[Auth] Logging out...');
        const currentRefreshToken = (await getTokens())?.refresh; // Refresh token'ı al (opsiyonel blacklist için)
        try {
            await clearTokens(); // Expo SecureStore'daki tokenları sil
            // --- YENİ: E2EE anahtarlarını da sil ---
            await clearStoredKeys();
            // -------------------------------------

            // Opsiyonel: Backend'de refresh token'ı blacklist'e ekle
            // if (currentRefreshToken) {
            //     try {
            //         await api.post('/logout/', { refresh: currentRefreshToken }); // Örnek endpoint
            //         console.log('[Auth] Refresh token blacklisted on backend.');
            //     } catch (logoutError) {
            //         console.error("[Auth] Backend logout/blacklist failed:", logoutError.response?.data || logoutError.message);
            //     }
            // }
        } catch (e) {
             console.error("[Auth] Error clearing tokens/keys during logout:", e);
        } finally {
             clearAuthState(); // State'i ve API header'ını temizle (async olduğu için await'e gerek yok)
             console.log('[Auth] User logged out.');
        }
    };

    const contextValue = {
        accessToken,
        user,
        isLoading,
        error,
        keysReady, // Anahtarların kullanıma hazır olup olmadığını dışarıya bildirebiliriz
        login,
        logout,
        // fetchUserData // Dışarıdan çağırmaya gerek yok genelde
    };

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    );
};

// 3. Context'i kullanmak için özel bir hook (isteğe bağlı ama önerilir)
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export default AuthContext; // Varsayılan olarak Context'i export et