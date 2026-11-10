import React, { useState, useContext } from "react";
import {
    Text,
    View,
    TextInput,
    StyleSheet,
    Image,
    TouchableOpacity,
    ImageBackground,
    ActivityIndicator // Yükleme göstergesi için eklendi
} from "react-native";
import { useNavigation } from "@react-navigation/native";

// --- Gerekli importlar ---
import api from '../utils/api'; // api.js'nin yolunu doğrulayın
import { setTokens } from '../utils/auth'; // auth.js'nin yolunu doğrulayın
import AuthContext from '../context/AuthContext'; // AuthContext dosyasının yolunu doğrulayın

// --- İkonlar (İkinci koddaki yolları kendi projenize göre ayarlayın) ---

const SignIn = () => {
    // State'ler SignIn'dan alındı, passwordVisible eklendi
    const [email, setEmail] = useState(''); // Kullanıcı adı/email
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [passwordVisible, setPasswordVisible] = useState(false); // Şifre görünürlüğü için state

    const navigation = useNavigation();
    // --- AuthContext kullanımı ---
    const { login } = useContext(AuthContext);

    const signIn = async () => {
        setIsLoading(true);
        setError('');
        try {
            // --- API çağrısı (SignIn'daki gibi) ---
            const response = await api.post('/login/', {
                username: email, // Django 'username' bekliyorsa bu kalmalı
                password: password,
            });

            if (response.data && response.data.access && response.data.refresh) {
                await setTokens(response.data.access, response.data.refresh); // Tokenları kaydet
                console.log('Login successful, tokens saved.');
                // AuthContext'teki login fonksiyonuna iki token'ı da gönder (veya sadece access yeterliyse onu gönder)
                login(response.data.access, response.data.refresh); // login fonksiyonunu çağırmanın yeni yolu
                // Yönlendirme AuthContext tarafından yapılmalı

            } else {
                console.error("Login response missing tokens:", response.data);
                setError("Giriş yapılırken bir hata oluştu. Yanıt formatı hatalı.");
                setIsLoading(false); // Başarısız yanıtta yükleniyor durumunu kapat
            }
        } catch (e) {
            setIsLoading(false); // Hata durumunda yükleniyor durumunu kapat
            console.error('Sign in error:', e.response?.data || e.message);
            if (e.response) {
                const detailError = e.response.data?.detail;
                 // Django'dan gelen 'non_field_errors' da kontrol edilebilir
                 const nonFieldError = e.response.data?.non_field_errors?.[0];
                setError(detailError || nonFieldError || "Kullanıcı adı veya şifre hatalı.");
            } else if (e.request) {
                setError("Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.");
            } else {
                setError("Giriş işlemi sırasında beklenmedik bir hata oluştu.");
            }
        }
    };

    // --- LoginScreen'den alınan UI yapısı ---
    return (
        <View style={styles.container}>
            {/* Logo */}

            {/* Başlık */}
            <Text style={styles.title}>
                Giriş Yap
            </Text>

             {/* Alt Başlık (İsteğe bağlı) */}
             <Text style={styles.subtitle}>
                Hesabınıza giriş yapın
             </Text>

            {/* Hata Mesajı */}
            {!!error && (
                <Text style={styles.errorText}>{error}</Text>
            )}

            {/* Kullanıcı Adı/Email Input */}
            <View style={styles.inputContainerMail}>
                <View style={styles.iconContainer}>
                </View>
                <TextInput
                    style={styles.input}
                    placeholder="Kullanıcı Adı" // Placeholder güncellendi
                    placeholderTextColor="#95A6D1"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                />
            </View>

            {/* Şifre Input */}
            <View style={styles.inputContainerPassword}>
                <View style={styles.iconContainer}>
                </View>
                <TextInput
                    style={styles.input}
                    placeholder="Şifre" // Placeholder güncellendi
                    placeholderTextColor="#95A6D1"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!passwordVisible} // Görünürlük state'ine bağlandı
                />
                <TouchableOpacity
                    onPress={() => setPasswordVisible(!passwordVisible)}
                    style={styles.eyeIconContainer}
                >
                </TouchableOpacity>
            </View>

            {/* Giriş Yap Butonu */}
            <TouchableOpacity
                style={styles.buttonWrapper}
                onPress={signIn}
                disabled={isLoading} // Yüklenirken butonu devre dışı bırak
            >
                <ImageBackground
                    style={styles.buttonImage}
                    imageStyle={{ borderRadius: 5 }} // Kenar yuvarlaklığı için
                >
                    {isLoading ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                        <Text style={styles.buttonText}>Giriş Yap</Text>
                    )}
                </ImageBackground>
            </TouchableOpacity>

            {/* Şifremi Unuttum (İsteğe bağlı, LoginScreen'den alındı) */}
            {/* <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
                <Text style={styles.forgotPassword}>
                    Şifreni mi unuttun?
                </Text>
            </TouchableOpacity> */}


            {/* Kayıt Ol Metni ve Linki */}
             <View style={styles.signupContainer}>
                 <Text style={styles.signupText}>
                     Hesabınız yok mu?
                 </Text>
                 <TouchableOpacity onPress={() => navigation.navigate("SignUp")}>
                     <Text style={styles.signupLink}>
                         Kayıt Ol
                     </Text>
                 </TouchableOpacity>
            </View>
        </View>
    );
};

// --- LoginScreen'den alınan stiller, bazıları ayarlandı ---
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
        // justifyContent: 'center', // Ortalamak yerine absolut pozisyonlar kullanılıyor
        alignItems: 'center', // Yatayda ortalamak için eklendi
    },
    logo: {
        width: 100, // Boyut ayarlanabilir
        height: 35, // Boyut ayarlanabilir
        position: 'absolute',
        top: 60, // Konum ayarlanabilir
        resizeMode: 'contain',
    },
    title: {
        fontSize: 24, // Boyut ayarlanabilir
        fontFamily: 'Outfit_500Medium', // Font ailesi varsa kullanılabilir
        fontWeight: '500',
        color: '#2B3D4F',
        position: 'absolute',
        top: 140, // Konum ayarlanabilir
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 16,
        color: '#95A6D1',
        textAlign: 'center',
        position: 'absolute',
        top: 180, // Konum ayarlanabilir (title'ın altına)
        fontFamily: 'Outfit_500Medium', // Font ailesi varsa kullanılabilir
    },
    errorText: {
        color: 'red',
        textAlign: 'center',
        position: 'absolute',
        top: 220, // Konum ayarlanabilir (subtitle'ın altına)
        paddingHorizontal: 20,
        fontSize: 14,
    },
    inputContainerMail: {
        flexDirection: 'row',
        alignItems: 'center',
        width: '90%', // Genişlik yüzde olarak ayarlandı
        maxWidth: 350, // Maksimum genişlik
        borderColor: '#CEDEED',
        borderWidth: 1,
        borderRadius: 5,
        height: 50, // Yükseklik biraz artırıldı
        position: 'absolute',
        top: 260, // Konum ayarlanabilir
        backgroundColor: '#FBFCFF',
        paddingHorizontal: 5, // İkon için yer açıldı
    },
    inputContainerPassword: {
        flexDirection: 'row',
        alignItems: 'center',
        width: '90%', // Genişlik yüzde olarak ayarlandı
        maxWidth: 350, // Maksimum genişlik
        borderColor: '#CEDEED',
        borderWidth: 1,
        borderRadius: 5,
        height: 50, // Yükseklik biraz artırıldı
        position: 'absolute',
        top: 325, // Konum ayarlanabilir (önceki inputun altına)
        backgroundColor: '#FBFCFF',
        paddingHorizontal: 5, // İkon için yer açıldı
    },
    iconContainer: {
        paddingHorizontal: 10, // İkon çevresine boşluk
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    icon: {
        width: 18,
        height: 18,
        resizeMode: 'contain',
    },
    input: {
        flex: 1,
        height: '100%',
        paddingLeft: 10,
        color: '#2B3D4F', // Metin rengi
        fontSize: 15,
        fontFamily: 'Outfit_500Medium', // Font ailesi varsa kullanılabilir
    },
    eyeIconContainer: {
        paddingHorizontal: 12, // İkon çevresine boşluk
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    eyeIcon: {
        width: 18,
        height: 18,
        resizeMode: 'contain',
    },
    buttonWrapper: {
        width: '90%', // Genişlik yüzde olarak ayarlandı
        maxWidth: 350, // Maksimum genişlik
        height: 50, // Yükseklik artırıldı
        position: 'absolute',
        top: 410, // Konum ayarlanabilir
        borderRadius: 5, // ImageBackground'a da verildi
        overflow: 'hidden', // ImageBackground'un taşmasını engellemek için
    },
    buttonImage: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'blue',
        borderRadius: 20
    },
    buttonText: {
        fontFamily: 'Outfit_500Medium', // Font ailesi varsa kullanılabilir
        fontSize: 16, // Boyut ayarlandı
        fontWeight: '500',
        color: '#FFFFFF',
    },
    // forgotPassword: { // Şifremi unuttum stili (opsiyonel)
    //     position: 'absolute',
    //     top: 475, // Konum ayarlanabilir (butonun altına)
    //     color: '#007bff',
    //     fontFamily: 'Outfit_500Medium', // Font ailesi varsa kullanılabilir
    //     fontSize: 14,
    // },
    signupContainer: { // Kayıt ol için kapsayıcı
        position: 'absolute',
        bottom: 40, // Ekranın altına yakın konumlandırıldı
        flexDirection: 'row', // Metinleri yan yana getirmek için
        alignItems: 'center', // Dikeyde ortalamak için
    },
    signupText: {
        color: '#95A6D1',
        fontFamily: 'Outfit_500Medium', // Font ailesi varsa kullanılabilir
        fontSize: 14,
    },
    signupLink: {
        color: '#007bff', // Link rengi
        fontFamily: 'Outfit_500Medium', // Font ailesi varsa kullanılabilir
        fontWeight: 'bold',
        fontSize: 14,
        marginLeft: 5, // Metinler arasına boşluk
    },
});

export default SignIn;