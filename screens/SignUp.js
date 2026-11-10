import React, { useState, useEffect, useRef } from "react";
import { Text, View, ScrollView, StyleSheet, Keyboard, Alert } from "react-native";
import { TextInput, Button, Subheading, HelperText, useTheme, Portal, Snackbar } from "react-native-paper"; // Portal ve Snackbar eklendi
import { useNavigation } from "@react-navigation/native";
import api from '../utils/api'; // api.js'nin yolunu doğrulayın

const SignUp = () => {
    const theme = useTheme(); // Tema renklerine erişim için
    const navigation = useNavigation();

    // --- State'ler ---
    const [username, setUsername] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [password2, setPassword2] = useState('');

    const [isLoading, setIsLoading] = useState(false);
    const [apiErrors, setApiErrors] = useState({}); // API'den dönen hatalar
    const [clientErrors, setClientErrors] = useState({}); // Ön yüz kontrol hataları (boş alan vb.)

    // Alanlara dokunuldu mu state'i
    const [touched, setTouched] = useState({
        username: false,
        firstName: false,
        lastName: false,
        email: false,
        password: false,
        password2: false,
    });

    // Hata Pop-up (Snackbar kullanalım)
    const [showErrorSnackbar, setShowErrorSnackbar] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState("");
    const snackbarTimerRef = useRef(null); // Snackbar zamanlayıcısı

    // --- Alan Dokunma Handler ---
    const handleBlur = (field) => {
        setTouched(prev => ({ ...prev, [field]: true }));
        // Blur olduğunda client-side validasyonunu tekrar yapabiliriz
        validateField(field);
    };

    // --- Client-Side Validasyon ---
    // --- Client-Side Validasyon (Düzeltilmiş) ---
    const validateField = (field, valueOverride = null) => {
        let error = null;

        // State değerlerini bir obje içinde topla
        const stateValues = {
            username: username,
            firstName: firstName,
            lastName: lastName,
            email: email,
            password: password,
            password2: password2,
        };

        // Değeri stateValues objesinden al (eval yerine)
        const value = valueOverride !== null ? valueOverride : stateValues[field];

        // Alan adı geçerli değilse (programlama hatası varsa) kontrol et
        if (stateValues[field] === undefined && valueOverride === null) {
             console.warn(`validateField: Geçersiz alan adı "${field}"`);
             // return false; // Veya bir hata fırlat
        }


        // --- Geri kalan validasyon mantığı aynı ---
        if (value === undefined || value === null || value === '') { // Daha kapsamlı boş kontrolü
            error = "Bu alan boş bırakılamaz.";
        } else if (field === 'email' && !/\S+@\S+\.\S+/.test(value)) {
            error = "Geçerli bir e-posta adresi girin.";
        } else if (field === 'password' && value.length < 8) { // Örnek: Min 8 karakter
            error = "Şifre en az 8 karakter olmalıdır.";
        } else if (field === 'password2' && password !== value) {
            error = "Şifreler eşleşmiyor.";
        }
        // Diğer özel validasyonlar eklenebilir

        setClientErrors(prev => ({ ...prev, [field]: error }));
        return !error; // Hata yoksa true döner
    };

    const validateAll = () => {
        const fields = ['username', 'firstName', 'lastName', 'email', 'password', 'password2'];
        let isValid = true;
        fields.forEach(field => {
             // Tüm alanları dokunulmuş gibi işaretle (submit denemesi)
             setTouched(prev => ({ ...prev, [field]: true }));
             if (!validateField(field)) {
                 isValid = false;
             }
        });
        return isValid;
    };


    // --- Kayıt Fonksiyonu ---
    const createAccount = async () => {
        Keyboard.dismiss(); // Klavyeyi kapat
        setApiErrors({}); // API hatalarını temizle
        clearTimeout(snackbarTimerRef.current); // Varsa eski zamanlayıcıyı temizle

        // 1. Client-side validasyon
        const isFormValid = validateAll();
        if (!isFormValid) {
            setSnackbarMessage("Lütfen işaretli alanları kontrol edin.");
            setShowErrorSnackbar(true);
            snackbarTimerRef.current = setTimeout(() => setShowErrorSnackbar(false), 3000);
            return; // Hata varsa API'ye gitme
        }

        // 2. API Çağrısı
        setIsLoading(true);
        try {
            const response = await api.post('/register/', {
                username: username,
                email: email,
                password: password,
                password2: password2,
                first_name: firstName,
                last_name: lastName,
            });

            console.log('Account created successfully:', response.data);
            setIsLoading(false);
            Alert.alert(
                "Başarılı!",
                "Hesabınız başarıyla oluşturuldu. Giriş sayfasına yönlendiriliyorsunuz.",
                [{ text: "Tamam", onPress: () => navigation.navigate("SignIn") }]
            );

        } catch (e) {
            setIsLoading(false);
            console.error('Sign up error:', e.response?.data || e.message);
            let errorMessage = "Kayıt sırasında beklenmedik bir hata oluştu."; // Genel hata
            if (e.response && e.response.data) {
                // API'den dönen hataları işle
                const errorsData = e.response.data;
                setApiErrors(errorsData); // API hatalarını state'e set et
                // Hata mesajını oluştur (ilk hatayı veya genel mesajı al)
                const firstErrorKey = Object.keys(errorsData)[0];
                if (firstErrorKey) {
                    const firstErrorMessage = Array.isArray(errorsData[firstErrorKey])
                        ? errorsData[firstErrorKey][0]
                        : errorsData[firstErrorKey];
                    // Alan adını daha okunabilir yap (opsiyonel)
                    const fieldNameMap = { username: "Kullanıcı adı", email: "E-posta", password: "Şifre", first_name: "İsim", last_name: "Soyisim", non_field_errors: "Genel", detail: "Detay" };
                    errorMessage = `${fieldNameMap[firstErrorKey] || firstErrorKey}: ${firstErrorMessage}`;
                } else if (typeof errorsData === 'string') {
                     errorMessage = errorsData;
                }
            } else if (e.request) {
                errorMessage = "Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.";
                setApiErrors({ non_field_errors: [errorMessage] });
            } else {
                 setApiErrors({ non_field_errors: [errorMessage] });
            }

            // Hata Snackbar'ını göster
            setSnackbarMessage(errorMessage);
            setShowErrorSnackbar(true);
            snackbarTimerRef.current = setTimeout(() => setShowErrorSnackbar(false), 4000); // API hataları için biraz daha uzun süre
        }
    };

    // --- Yardımcı Fonksiyonlar ve Değişkenler ---
    const getCombinedError = (field) => apiErrors?.[field]?.[0] || clientErrors?.[field];
    const hasError = (field) => !!getCombinedError(field);
    const isValid = (field) => touched[field] && !clientErrors[field] && !apiErrors[field];

    const getOutlineColor = (field) => {
        if (hasError(field)) return theme.colors.error; // Hata varsa kırmızı
        if (isValid(field)) return theme.colors.primary; // Geçerliyse tema rengi (veya yeşil) 'green';
        return undefined; // Varsayılan renk
    };

    const getActiveOutlineColor = (field) => {
         if (hasError(field)) return theme.colors.error;
         if (isValid(field)) return theme.colors.primary; // Veya 'green'
         return theme.colors.primary; // Odaklanınca tema rengi
    }

    // Snackbar kapandığında çalışacak fonksiyon
    const onDismissSnackbar = () => {
        setShowErrorSnackbar(false);
        clearTimeout(snackbarTimerRef.current); // Zamanlayıcıyı temizle
    }

    // --- Render ---
    return (
        // Portal.Host, Snackbar gibi bileşenlerin root seviyesinde render edilmesini sağlar
        <Portal.Host>
            <ScrollView
                contentContainerStyle={styles.container}
                keyboardShouldPersistTaps="handled" // ScrollView içindeyken klavyeyi kapatmak için
            >
                <Subheading style={styles.title}>Yeni Hesap Oluştur</Subheading>

                {/* --- Alanlar --- */}
                <View style={styles.inputContainer}>
                    <TextInput
                        label="Kullanıcı Adı"
                        mode="outlined" // Outlined modu kenarlıkları daha belirgin yapar
                        value={username}
                        onChangeText={setUsername}
                        onBlur={() => handleBlur('username')}
                        error={hasError('username')}
                        outlineColor={getOutlineColor('username')}
                        activeOutlineColor={getActiveOutlineColor('username')}
                        style={styles.input}
                        autoCapitalize="none"
                    />
                    <HelperText type="error" visible={hasError('username')}>
                        {getCombinedError('username')}
                    </HelperText>
                </View>

                <View style={styles.inputContainer}>
                    <TextInput
                        label="İsim"
                        mode="outlined"
                        value={firstName}
                        onChangeText={setFirstName}
                        onBlur={() => handleBlur('firstName')}
                        error={hasError('first_name')} // API hatası için
                        outlineColor={getOutlineColor('firstName')} // clientError + API Error
                        activeOutlineColor={getActiveOutlineColor('firstName')}
                        style={styles.input}
                    />
                    <HelperText type="error" visible={hasError('first_name') || hasError('firstName')}>
                        {getCombinedError('first_name') || getCombinedError('firstName')}
                    </HelperText>
                </View>

                 <View style={styles.inputContainer}>
                    <TextInput
                        label="Soyisim"
                        mode="outlined"
                        value={lastName}
                        onChangeText={setLastName}
                        onBlur={() => handleBlur('lastName')}
                        error={hasError('last_name')}
                        outlineColor={getOutlineColor('lastName')}
                        activeOutlineColor={getActiveOutlineColor('lastName')}
                        style={styles.input}
                    />
                    <HelperText type="error" visible={hasError('last_name') || hasError('lastName')}>
                         {getCombinedError('last_name') || getCombinedError('lastName')}
                    </HelperText>
                </View>


                <View style={styles.inputContainer}>
                    <TextInput
                        label="Email"
                        mode="outlined"
                        value={email}
                        onChangeText={setEmail}
                        onBlur={() => handleBlur('email')}
                        error={hasError('email')}
                        outlineColor={getOutlineColor('email')}
                        activeOutlineColor={getActiveOutlineColor('email')}
                        style={styles.input}
                        keyboardType="email-address"
                        autoCapitalize="none"
                    />
                    <HelperText type="error" visible={hasError('email')}>
                        {getCombinedError('email')}
                    </HelperText>
                </View>

                <View style={styles.inputContainer}>
                    <TextInput
                        label="Şifre"
                        mode="outlined"
                        value={password}
                        onChangeText={setPassword}
                        onBlur={() => handleBlur('password')}
                        error={hasError('password')}
                        outlineColor={getOutlineColor('password')}
                        activeOutlineColor={getActiveOutlineColor('password')}
                        style={styles.input}
                        secureTextEntry
                    />
                    <HelperText type="error" visible={hasError('password')}>
                        {getCombinedError('password')}
                    </HelperText>
                </View>

                <View style={styles.inputContainer}>
                    <TextInput
                        label="Şifre (Tekrar)"
                        mode="outlined"
                        value={password2}
                        onChangeText={setPassword2}
                        onBlur={() => handleBlur('password2')}
                        // Hem API(password2 anahtarı varsa) hem de client hatasını kontrol et
                        error={hasError('password2')}
                        outlineColor={getOutlineColor('password2')}
                        activeOutlineColor={getActiveOutlineColor('password2')}
                        style={styles.input}
                        secureTextEntry
                    />
                     <HelperText type="error" visible={hasError('password2')}>
                        {getCombinedError('password2')}
                    </HelperText>
                </View>


                {/* --- Butonlar --- */}
                <View style={styles.buttonContainer}>
                    <Button
                        compact
                        onPress={() => navigation.navigate("SignIn")}
                        disabled={isLoading} // Kayıt sırasında diğer butonlar da pasif olsun
                        style={styles.linkButton}
                    >
                        Giriş Yap
                    </Button>
                    <Button
                        mode="contained"
                        onPress={createAccount}
                        loading={isLoading}
                        disabled={isLoading}
                        style={styles.submitButton}
                        contentStyle={styles.submitButtonContent} // Buton içeriği için stil
                    >
                        Kayıt Ol
                    </Button>
                </View>

                 {/* Genel API Hataları (Alanlarla İlişkili Olmayan) */}
                 {apiErrors.non_field_errors && (
                    <HelperText type="error" visible={true} style={styles.generalError}>
                        {apiErrors.non_field_errors[0]}
                    </HelperText>
                 )}
                 {apiErrors.detail && (
                    <HelperText type="error" visible={true} style={styles.generalError}>
                         {apiErrors.detail}
                     </HelperText>
                 )}

            </ScrollView>

             {/* Hata Snackbar'ı */}
             {/* Portal içinde olması gerekmez ama bazen layout sorunlarını çözer */}
            {/* <Portal> */}
                <Snackbar
                    visible={showErrorSnackbar}
                    onDismiss={onDismissSnackbar}
                    duration={Snackbar.DURATION_SHORT} // Süreyi biz yöneteceğiz (3sn)
                    style={styles.snackbar}
                    action={{
                        label: 'Kapat',
                        onPress: onDismissSnackbar,
                    }}
                >
                    {snackbarMessage}
                </Snackbar>
            {/* </Portal> */}
        </Portal.Host>
    );
};

const styles = StyleSheet.create({
    container: {
        padding: 20, // Kenar boşlukları
        flexGrow: 1,
        justifyContent: 'center', // İçeriği dikeyde ortala
        backgroundColor: '#f5f5f5', // Hafif bir arka plan rengi
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      textAlign: 'center',
      marginBottom: 24, // Başlık altı boşluk
      color: '#333',
    },
    inputContainer: {
        marginBottom: 0, // Input grupları arası boşluk azaltıldı, HelperText boşluk sağlar
    },
    input: {
        // backgroundColor: 'white', // Paper TextInput zaten ayarlar
    },
    buttonContainer: {
        flexDirection: "row",
        justifyContent: 'space-around', // Butonları aralıklı yap
        marginTop: 24, // Inputlardan sonra boşluk
        alignItems: 'center',
    },
    linkButton: {
       // marginRight: 8,
    },
    submitButton: {
       // marginLeft: 8,
       elevation: 2, // Hafif gölge
    },
    submitButtonContent: {
        paddingVertical: 6, // Buton iç yüksekliği
        paddingHorizontal: 12,
    },
    snackbar: {
        // backgroundColor: 'red', // Varsayılan error rengini kullanır genelde
        // marginBottom: 50, // Konumu ayarlamak için (opsiyonel)
    },
    generalError: {
        textAlign: 'center',
        marginTop: 10,
        fontSize: 14,
    }
});

export default SignUp;