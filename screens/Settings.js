import React, { useContext } from "react"; // useEffect, useState kaldırıldı, useContext eklendi
import { View, StyleSheet, ActivityIndicator, Alert } from "react-native"; // StyleSheet, ActivityIndicator, Alert eklendi
import { Avatar, Title, Subheading, Button } from "react-native-paper";
// --- Firebase import kaldırıldı ---
// import firebase from "firebase/compat/app";

// --- Gerekli importlar ---
import { useAuth } from '../context/AuthContext'; // AuthContext'ten useAuth hook'unu import et (yolu kontrol edin)

const Settings = () => {
    // --- AuthContext'ten user ve logout fonksiyonunu al ---
    // AuthContext'inizin user nesnesi ve logout fonksiyonu sağladığını varsayıyoruz
    const { user, logout, isLoading } = useAuth();

    // Kullanıcı bilgisi yüklenirken veya yoksa (bir hata durumu olabilir)
    if (isLoading) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" />
            </View>
        );
    }

    // Eğer kullanıcı bilgisi yoksa (login olmamış veya hata var)
    if (!user) {
         return (
             <View style={styles.centered}>
                 <Subheading>Kullanıcı bilgileri yüklenemedi.</Subheading>
                 {/* Opsiyonel: Tekrar deneme veya login'e yönlendirme butonu */}
             </View>
         );
     }


    // Avatar için baş harfleri hesapla (UserSerializer'daki 'name' veya 'username' kullanılır)
    const getInitials = (name, username) => {
        const fullName = name?.trim(); // Serializer'dan gelen 'name' alanı (first_name + last_name)
        if (fullName) {
            // İsim ve soyisim varsa baş harflerini al
            return fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        }
        // Sadece kullanıcı adı varsa onun ilk harfini al
        return username?.[0]?.toUpperCase() || '?';
    };

    const initials = getInitials(user.name, user.username);
    // Görüntülenecek isim (önce tam ad, yoksa kullanıcı adı)
    const displayName = user.name || user.username || 'Kullanıcı';

    // Çıkış yapma fonksiyonu (güvenlik için onay isteyebiliriz)
    const handleLogout = () => {
        Alert.alert(
            "Çıkış Yap",
            "Hesabınızdan çıkış yapmak istediğinizden emin misiniz?",
            [
                { text: "İptal", style: "cancel" },
                { text: "Çıkış Yap", onPress: logout, style: "destructive" } // Context'teki logout fonksiyonunu çağırır
            ]
        );
    };

    return (
        <View style={styles.container}>
            <Avatar.Text label={initials} size={80} style={styles.avatar} />
            <Title style={styles.title}>{displayName}</Title>
            <Subheading style={styles.subheading}>{user.email}</Subheading>
            <Button
                mode="contained"
                onPress={handleLogout} // Onay ile çıkış yap
                style={styles.button}
                icon="logout" // İkon ekleyebiliriz
                color="#e91e63" // Farklı bir renk (isteğe bağlı)
            >
                Çıkış Yap
            </Button>
        </View>
    );
};

const styles = StyleSheet.create({
    centered: { // Yükleme veya hata durumları için ortalanmış container
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
    },
    container: { // Ana içerik container'ı
        flex: 1,
        alignItems: "center",
        paddingTop: 40, // İçeriği biraz aşağıdan başlat
        paddingHorizontal: 16,
    },
    avatar: {
        marginBottom: 16,
        backgroundColor: '#2196f3', // Avatar rengi (tema ile uyumlu)
    },
    title: {
        fontSize: 22,
        fontWeight: 'bold', // Daha belirgin
        marginBottom: 4,
        textAlign: 'center',
    },
    subheading: {
        fontSize: 16,
        color: 'gray',
        marginBottom: 32, // Butonla arayı aç
        textAlign: 'center',
    },
    button: {
        width: '80%', // Buton genişliği
        paddingVertical: 8, // Buton iç yüksekliği
    }
});

export default Settings;