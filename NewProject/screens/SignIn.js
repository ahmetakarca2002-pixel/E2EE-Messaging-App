import React, { useState, useContext } from "react"; // useContext eklendi
import { Text, View } from "react-native";
import { TextInput, Button, Subheading } from "react-native-paper";
// --- Firebase import'u kaldırıldı ---
// import firebase from "firebase/compat/app";
import { useNavigation } from "@react-navigation/native";

// --- Gerekli importlar ---
import api from '../utils/api'; // api.js'nin yolunu doğrulayın
import { setTokens } from '../utils/auth'; // auth.js'nin yolunu doğrulayın
import AuthContext from '../context/AuthContext'; // AuthContext dosyasının yolunu doğrulayın

const SignIn = () => {
    // State'ler aynı kalıyor
    const [email, setEmail] = useState(''); // Kullanıcı adını buraya girecek
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false); // setIsLoading olarak düzeltildi
    const [error, setError] = useState('');

    const navigation = useNavigation();
    // --- AuthContext kullanımı ---
    const { login } = useContext(AuthContext);

    const signIn = async () => {
        setIsLoading(true);
        setError(''); // Hata mesajını temizle
        try {
            // --- Firebase yerine API çağrısı ---
            const response = await api.post('/login/', {
                username: email, // Django genellikle 'username' bekler, email değil!
                password: password,
            });

            // Yanıtı kontrol et (token var mı?)
            if (response.data && response.data.access && response.data.refresh) {
                // Token'ları güvenli bir şekilde kaydet
                await setTokens(response.data.access, response.data.refresh);
                console.log('Login successful, tokens saved.');

                // Global state'i güncelle (AuthContext aracılığıyla)
                // login fonksiyonu App.js'deki state'i güncelleyip yönlendirmeyi tetiklemeli
                login(response.data.access); // Access token'ı veya kullanıcı bilgisini context'e gönderebilirsiniz

                // Başarılı giriş sonrası yönlendirme AuthContext tarafından yapılmalı
                // navigation.popToTop(); // Bu satır kaldırıldı

            } else {
                 // Beklenmedik yanıt formatı
                 console.error("Login response missing tokens:", response.data);
                 setError("Giriş yapılırken bir hata oluştu. Yanıt formatı hatalı.");
                 setIsLoading(false);
            }
            // try bloğu sonunda setIsLoading(false) olmamalı, çünkü başarılı olunca ekran değişecek

        } catch (e) {
            setIsLoading(false); // Hata durumunda yükleniyor durumunu kapat
            console.error('Sign in error:', e.response?.data || e.message); // Hata detayını logla
            if (e.response) {
                // API'den gelen hata
                if (e.response.status === 401 || e.response.status === 400) {
                     // Django'dan gelen hata mesajını kullanmayı deneyebiliriz
                     const detailError = e.response.data?.detail;
                    setError(detailError || "Kullanıcı adı veya şifre hatalı.");
                } else {
                    setError(`Sunucu hatası: ${e.response.status}. Lütfen tekrar deneyin.`);
                }
            } else if (e.request) {
                // İstek yapıldı ama yanıt alınamadı (network hatası vb.)
                setError("Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.");
            } else {
                // İstek hazırlanırken hata oluştu
                setError("Giriş işlemi sırasında bir hata oluştu.");
            }
        }
    };

    return (
        <View style={{ margin: 16, flex: 1, justifyContent: 'center' }}>
             {/* Başlık Eklenebilir */}
             {/* <Title style={{ textAlign: 'center', marginBottom: 20 }}>Giriş Yap</Title> */}
            {!!error && (
                <Subheading style={{ color: 'red', textAlign: 'center', marginBottom: 16 }}>{error}</Subheading>
            )}
            <TextInput
                label="Kullanıcı Adı" // Label'ı "Kullanıcı Adı" olarak değiştirdik
                value={email}
                onChangeText={(text) => setEmail(text)}
                style={{ marginTop: 12 }}
                keyboardType="email-address" // Klavye tipini ayarlayabilirsiniz
                autoCapitalize="none"
            />
            <TextInput
                label="Şifre" // Label'ı "Şifre" olarak değiştirdik
                value={password}
                onChangeText={(text) => setPassword(text)}
                style={{ marginTop: 12 }}
                secureTextEntry // Şifreyi gizle
            />
            <View style={{ flexDirection: "row", justifyContent: 'space-between', marginTop: 16, alignItems: 'center' }}>
                <Button compact onPress={() => navigation.navigate("SignUp")}>
                    Kayıt Ol
                </Button>
                <Button mode="contained" onPress={signIn} loading={isLoading} disabled={isLoading}>
                    Giriş Yap
                </Button>
            </View>
        </View>
    );
};

export default SignIn;