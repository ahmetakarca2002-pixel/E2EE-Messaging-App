// context/AuthContext.js
import React, { createContext, useState, useEffect, useContext } from 'react';
import * as SecureStore from 'expo-secure-store'; // <--- BU SATIRI EKLEYİN
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../utils/api';
import { setTokens, clearTokens, getTokens } from '../utils/auth';
// Crypto utils importu
import { ensureKeysExistAndUploaded } from '../utils/cryptoUtils';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [authToken, setAuthToken] = useState(null);

    useEffect(() => {
        const loadAuthData = async () => {
            console.log("[AuthContext] Loading auth data..."); // LOG
            setIsLoading(true);
            let token = null;
            try {
                const storedTokens = await getTokens();
                token = storedTokens?.access;

                if (token) {
                    console.log("[AuthContext] Token found, setting API header."); // LOG
                    setAuthToken(token);
                    if (api?.defaults?.headers?.common) {
                        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
                    } else {
                        console.warn("[AuthContext] API instance or headers not ready when setting token.");
                    }

                    console.log("[AuthContext] Fetching /users/me/..."); // LOG
                    const response = await api.get('/users/me/');
                    setUser(response.data);
                    console.log('[AuthContext] User loaded:', response.data.username); // LOG

                    // --- LOG EKLE ---
                    console.log("[AuthContext] >>> Calling ensureKeysExistAndUploaded from loadAuthData..."); // LOG
                    await ensureKeysExistAndUploaded();
                    console.log("[AuthContext] <<< ensureKeysExistAndUploaded finished in loadAuthData."); // LOG
                    // --- LOG BİTTİ ---

                } else {
                    console.log('[AuthContext] No token found.'); // LOG
                    setUser(null);
                    setAuthToken(null);
                     if (api?.defaults?.headers?.common) {
                        delete api.defaults.headers.common['Authorization'];
                     }
                }
            } catch (error) {
                 console.error('[AuthContext] Failed to load auth data:', error.response?.data || error.message || error); // LOG
                 if (error.response && (error.response.status === 401 || error.response.status === 403)) {
                     console.log("[AuthContext] Clearing tokens due to API error during load."); // LOG
                     await clearTokens();
                     setAuthToken(null);
                     if (api?.defaults?.headers?.common) {
                         delete api.defaults.headers.common['Authorization'];
                     }
                 } else if (!token) {
                     console.log("[AuthContext] No token and other error occurred, ensuring clean state."); // LOG
                 }
                 setUser(null);
            } finally {
                console.log("[AuthContext] Loading finished."); // LOG
                setIsLoading(false);
            }
        };
        loadAuthData();
    }, []);

    const login = async (accessToken, refreshToken) => {
        console.log("[AuthContext] Login function called."); // LOG
        setIsLoading(true);
        try {
             // Tokenları kaydetme işlemi zaten SignIn.js içinde yapılıyor.
             console.log("[AuthContext] Setting auth token and API header for login."); // LOG
             setAuthToken(accessToken);
             if (api?.defaults?.headers?.common) {
                api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
             } else {
                 console.warn("[AuthContext] API instance or headers not ready when setting token in login.");
             }

             console.log("[AuthContext] Fetching /users/me/ after login..."); // LOG
             const response = await api.get('/users/me/');
             setUser(response.data);
             console.log('[AuthContext] User logged in and loaded:', response.data.username); // LOG

             // --- LOG EKLE ---
             console.log("[AuthContext] >>> Calling ensureKeysExistAndUploaded from login..."); // LOG
             await ensureKeysExistAndUploaded();
             console.log("[AuthContext] <<< ensureKeysExistAndUploaded finished in login."); // LOG
             // --- LOG BİTTİ ---

        } catch (error) {
            console.error('[AuthContext] Failed to fetch user after login:', error.response?.data || error.message); // LOG
            await logout();
        } finally {
             console.log("[AuthContext] Login process finished."); // LOG
             setIsLoading(false);
        }
    };

    const logout = async () => {
        console.log("[AuthContext] Logout function called."); // LOG
        setIsLoading(true);
        try {
             console.log("[AuthContext] Clearing tokens..."); // LOG
             await clearTokens(); // Auth tokenları temizler
             // ----> BOZUK KRİPTO ANAHTARLARINI SİL <----
             try {
                 console.log("[AuthContext] !!! GEÇİCİ: Çıkış yaparken yerel kripto anahtarları siliniyor !!!");
                 await SecureStore.deleteItemAsync('my_app_ec_private_key_jwk'); // Anahtar ismini doğru yazdığınızdan emin olun
                 await SecureStore.deleteItemAsync('my_app_ec_public_key_jwk'); // Anahtar ismini doğru yazdığınızdan emin olun
                 console.log("[AuthContext] Yerel kripto anahtarları silindi.");
             } catch (keyError) {
                 console.error("[AuthContext] Yerel kripto anahtarları silinirken HATA:", keyError);
             }
             // --------------------------------------
             console.log("[AuthContext] Clearing local state..."); // LOG
             setUser(null);
             setAuthToken(null);
             if (api?.defaults?.headers?.common) {
                console.log("[AuthContext] Deleting API authorization header."); // LOG
                delete api.defaults.headers.common['Authorization'];
             }
            console.log('[AuthContext] User logged out.'); // LOG
        } catch (error) {
            console.error('[AuthContext] Logout error:', error); // LOG
        } finally {
            console.log("[AuthContext] Logout process finished."); // LOG
            setIsLoading(false);
        }
    }

    const contextValue = { user, isLoading, login, logout, authToken };

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
       throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export default AuthContext;