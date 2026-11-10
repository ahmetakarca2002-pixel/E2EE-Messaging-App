import React, { useState } from "react";
import { Text, View, ScrollView } from "react-native"; // ScrollView eklendi
import { TextInput, Button, Subheading, HelperText } from "react-native-paper"; // HelperText eklendi
// --- Firebase import'u kaldırıldı ---
// import firebase from "firebase/compat/app";
import { useNavigation } from "@react-navigation/native";

// --- Gerekli importlar ---
import api from '../utils/api'; // api.js'nin yolunu doğrulayın

const SignUp = () => {
    // --- State'ler Django Serializer'a göre güncellendi ---
    const [username, setUsername] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [password2, setPassword2] = useState(''); // Şifre onayı için

    const [isLoading, setIsLoading] = useState(false); // setIsLoading olarak düzeltildi
    const [errors, setErrors] = useState({}); // Hataları obje olarak tutmak daha iyi

    const navigation = useNavigation();

    const createAccount = async () => {
        setIsLoading(true);
        setErrors({}); // Hataları temizle

        // Şifreleri kontrol et
        if (password !== password2) {
            setErrors({ password2: "Şifreler eşleşmiyor." });
            setIsLoading(false);
            return;
        }

        try {
            // --- Firebase yerine API çağrısı ---
            const response = await api.post('/register/', {
                username: username,
                email: email,
                password: password,
                password2: password2,
                first_name: firstName,
                last_name: lastName,
            });

            // Başarılı kayıt (genellikle 201 Created status döner)
            console.log('Account created successfully:', response.data);
            setIsLoading(false);

            // Başarı mesajı gösterilebilir veya direkt login'e yönlendirilebilir
            // Alert.alert("Başarılı", "Hesabınız oluşturuldu. Lütfen giriş yapın."); // Örnek
            navigation.navigate("SignIn"); // Giriş ekranına yönlendir

        } catch (e) {
            setIsLoading(false);
            console.error('Sign up error:', e.response?.data || e.message);

            if (e.response && e.response.data) {
                 // Django REST Framework validation errors genellikle obje döner
                 if (typeof e.response.data === 'object') {
                    // Gelen hataları state'e set et
                    setErrors(e.response.data);
                 } else {
                    // Genel bir hata mesajı (beklenmedik format)
                     setErrors({ non_field_errors: ["Kayıt sırasında bir hata oluştu. Lütfen tekrar deneyin."] });
                 }

            } else if (e.request) {
                // İstek yapıldı ama yanıt alınamadı
                 setErrors({ non_field_errors: ["Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin."] });
            } else {
                // İstek hazırlanırken hata oluştu
                 setErrors({ non_field_errors: ["Kayıt işlemi sırasında bir hata oluştu."] });
            }
        }
    };

    // HelperText'leri göstermek için yardımcı fonksiyon
    const hasError = (field) => errors?.[field];
    const getError = (field) => errors?.[field]?.[0]; // Genellikle liste içinde ilk hatayı gösteririz

    return (
        // Çok fazla input olduğu için ScrollView kullanmak iyi olabilir
        <ScrollView contentContainerStyle={{ padding: 16, flexGrow: 1, justifyContent: 'center' }}>
             {/* Genel (alan dışı) hatalar için */}
             {hasError('non_field_errors') && (
                <Subheading style={{ color: 'red', textAlign: 'center', marginBottom: 16 }}>
                    {getError('non_field_errors')}
                </Subheading>
             )}
             {hasError('detail') && ( // Bazen DRF 'detail' anahtarıyla dönebilir
                  <Subheading style={{ color: 'red', textAlign: 'center', marginBottom: 16 }}>
                     {errors.detail}
                 </Subheading>
             )}

            <TextInput
                label="Kullanıcı Adı"
                value={username}
                onChangeText={setUsername}
                style={{ marginTop: 12 }}
                error={hasError('username')}
                autoCapitalize="none"
            />
             <HelperText type="error" visible={hasError('username')}>
                 {getError('username')}
             </HelperText>

             <TextInput
                label="İsim"
                value={firstName}
                onChangeText={setFirstName}
                style={{ marginTop: 12 }}
                error={hasError('first_name')}
             />
             <HelperText type="error" visible={hasError('first_name')}>
                 {getError('first_name')}
             </HelperText>

             <TextInput
                label="Soyisim"
                value={lastName}
                onChangeText={setLastName}
                style={{ marginTop: 12 }}
                error={hasError('last_name')}
            />
             <HelperText type="error" visible={hasError('last_name')}>
                 {getError('last_name')}
             </HelperText>

            <TextInput
                label="Email"
                value={email}
                onChangeText={setEmail}
                style={{ marginTop: 12 }}
                keyboardType="email-address"
                error={hasError('email')}
                autoCapitalize="none"
            />
             <HelperText type="error" visible={hasError('email')}>
                 {getError('email')}
             </HelperText>

            <TextInput
                label="Şifre"
                value={password}
                onChangeText={setPassword}
                style={{ marginTop: 12 }}
                secureTextEntry
                error={hasError('password')}
            />
            <HelperText type="error" visible={hasError('password')}>
                 {getError('password')}
             </HelperText>

            <TextInput
                label="Şifre (Tekrar)"
                value={password2}
                onChangeText={setPassword2}
                style={{ marginTop: 12 }}
                secureTextEntry
                error={hasError('password2')} // Bu hata manuel olarak set ediliyor
            />
            <HelperText type="error" visible={hasError('password2')}>
                {getError('password2') || errors?.password2}
            </HelperText>


            <View style={{ flexDirection: "row", justifyContent: 'space-between', marginTop: 16, alignItems: 'center' }}>
                <Button compact onPress={() => navigation.navigate("SignIn")}>
                    Giriş Yap
                </Button>
                <Button mode="contained" onPress={createAccount} loading={isLoading} disabled={isLoading}>
                    Kayıt Ol
                </Button>
            </View>
        </ScrollView>
    );
};

export default SignUp;