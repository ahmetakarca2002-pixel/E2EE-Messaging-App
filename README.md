# 🔒 Uçtan Uca Şifrelemeli Mesajlaşma Uygulaması [WIP]

Bu proje, modern mobil iletişim gereksinimlerine yanıt vermek amacıyla, kullanıcı gizliliğini ve veri güvenliğini merkeze alan, uçtan uca şifreleme (E2EE) destekli bir sohbet uygulamasının **Kavram Kanıtı (Proof of Concept)** niteliğindedir. 

Projenin temel amacı; metin ve çoklu ortam (multimedya) mesajlarının aracı sunucular tarafından okunamayacak şekilde istemci tarafında şifrelenmesi ve asimetrik kriptografi mimarisinin React Native mobil ekosistemiyle nasıl entegre edilebileceğinin gösterilmesidir[cite: 11].

> **🚧 Geliştirme Notu (WIP):** Bu proje, şifreleme mimarisine, anahtar yönetimine ve API entegrasyonlarına odaklanarak geliştirilmiştir. Bazı arayüz özellikleri ve son kullanıcı deneyimi detayları geliştirilme aşamasındadır.

## 🌟 Temel Özellikler (Mevcut & Planlanan)

*   **Uçtan Uca Şifreleme (E2EE):** Mesajlar ve medya dosyaları, NaCl (TweetNaCl) kütüphanesi kullanılarak istemci cihazda şifrelenir ve yalnızca hedeflenen alıcı tarafından kendi cihazında çözülebilir[cite: 16]. Sunucu, şifreli verinin içeriğine erişemez[cite: 11, 25].
*   **Asimetrik Anahtar Yönetimi:** Kullanıcı cihazında yerel olarak üretilen açık (public) ve gizli (private) anahtar çiftleri. Gizli anahtarlar, cihaz dışına çıkmayacak şekilde Expo SecureStore kullanılarak yerel donanımda güvenle saklanır[cite: 25, 27].
*   **Çoklu Ortam (Multimedya) Paylaşımı:** Metin mesajlarına ek olarak şifrelenmiş fotoğraf, video ve sesli mesaj iletimi[cite: 11, 14, 33]. Medya dosyaları, Base64 formatında şifrelenerek API'ye aktarılır[cite: 51, 53].
*   **Kullanıcı Arayüzü (UI) Özellikleri:**
    *   Animasyonlu arama ve indirme yapılabilen müzik paneli[cite: 11, 22].
    *   Mesajlara emoji ile reaksiyon verebilme[cite: 11, 31].
    *   FlatList tabanlı performanslı mesaj listeleme[cite: 38].

## 🏗️ Mimari ve Teknoloji Yığını (Tech Stack)

Uygulamanın mimarisi, istemci, sunucu ve depolama katmanlarından oluşacak şekilde tasarlanmıştır[cite: 38]. 

### 📱 İstemci Katmanı (Frontend)
*   **Çerçeve:** React Native (Expo)[cite: 11, 20].
*   **Kriptografi:** TweetNaCl (Networking and Cryptography library)[cite: 16, 26, 48].
*   **Güvenli Depolama:** Expo SecureStore[cite: 27, 48].
*   **Medya Yönetimi:** Expo Audio, Expo FileSystem[cite: 48, 53].

### 🖥️ Sunucu Katmanı (Backend)
*   **Çerçeve:** Python tabanlı Django ve Django REST Framework (DRF)[cite: 11, 28, 48].
*   **Mimari:** Sadece şifreli veriyi iletmekle ve saklamakla görevli RESTful API[cite: 11].
*   **Veritabanı:** PostgreSQL / SQLite[cite: 63].
*   **Kimlik Doğrulama:** JWT (JSON Web Token)[cite: 16, 33].

## 🔐 Kriptografik İş Akışı

1.  **Anahtar Üretimi:** Kullanıcı uygulamayı kurduğunda, cihaz üzerinde NaCl kullanılarak açık/gizli (public/private) anahtar çifti oluşturulur[cite: 50]. 
2.  **Mesaj Şifreleme:** Gönderici, yazılan mesajı iki ayrı şifreli kopya olarak hazırlar:
    *   Kendi gizli anahtarı ile şifrelenmiş kopya (geçmişi görebilmek için).
    *   Alıcının açık anahtarı ile şifrelenmiş kopya (iletim için)[cite: 50].
3.  **Veri İletimi:** Şifrelenmiş bu veri paketleri HTTPS üzerinden Django REST API'ye iletilir[cite: 37, 38].
4.  **Mesaj Çözme:** Alıcı, sunucudan kendi açık anahtarına yönelik şifrelenmiş veriyi çeker ve cihazında yalnızca kendi bilebileceği gizli anahtar ile mesajı çözer[cite: 25, 50].

## 📅 Geliştirici & Lisans
**Ahmet AKARCA**
Bilgisayar Mühendisi & Yazılım Mühendisi 
*Bu çalışma, Yazılım Mühendisliği Bitirme Projesi kapsamında tasarlanmış ve geliştirilmiştir.*[cite: 6, 8, 63]