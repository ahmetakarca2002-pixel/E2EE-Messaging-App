import 'react-native-get-random-values';
import React, { useEffect, useState, useContext } from "react"; // useEffect ve useState artık AppContent'te gerekmeyebilir
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer, useNavigation } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import ChatList from './screens/Chatlist';
import Settings from './screens/Settings';
import Chat from './screens/Chat';
import SignUp from './screens/SignUp';
import SignIn from './screens/SignIn';
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from '@expo/vector-icons';
import { DefaultTheme, Provider as PaperProvider } from "react-native-paper";

// --- AuthContext Import'unu Aktifleştir ---
import AuthContext, { AuthProvider } from './context/AuthContext'; // Yolu doğrulayın

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

const TabsNavigator = () => {
  // Bu bileşen artık sadece giriş yapılmışken render ediliyor,
  // bu yüzden içindeki auth kontrolüne gerek yok.
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          return <Ionicons name={route.name === 'ChatList' ? "chatbubbles" : "settings"} color={color} size={size} />;
        },
      })}
    >
      <Tabs.Screen name="ChatList" component={ChatList} options={{ title: 'Sohbetler' }} />
      <Tabs.Screen name="Settings" component={Settings} options={{ title: 'Ayarlar' }} />
    </Tabs.Navigator>
  );
};

const theme = {
  ...DefaultTheme,
  roundness: 2,
  colors: {
    ...DefaultTheme.colors,
    primary: '#2196f3',
    accent: '#e91e63',
  },
};

// --- AppContent'i Context Kullanacak Şekilde Güncelle ---
const AppContent = () => {
  // isLoading ve accessToken'ı AuthContext'ten al
  const { isLoading, authToken } = useContext(AuthContext);


  // Yerel state ve useEffect kaldırıldı, çünkü bu mantık AuthProvider'da
  // const [isLoading, setIsLoading] = useState(true);
  // const [userToken, setUserToken] = useState(null);
  // useEffect(() => { ... checkToken ... }, []);

  // AuthProvider'ın başlangıç kontrolü bitene kadar yükleme göstergesi göster
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {/* Artık accessToken context'ten geliyor */}
        {authToken == null ? (
          // Giriş yapılmamışsa gösterilecek ekranlar
          <>
            <Stack.Screen name="SignIn" component={SignIn} options={{ headerShown: false }} />
            <Stack.Screen name="SignUp" component={SignUp} options={{ headerShown: false }} />
          </>
        ) : (
          // Giriş yapılmışsa gösterilecek ekranlar
          <>
            <Stack.Screen name="Main" component={TabsNavigator} options={{ headerShown: false }} />
            <Stack.Screen name="Chat" component={Chat} />
            {/* <Stack.Screen name="Settings" component={Settings} /> */}
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}


const App = () => {
  return (
    // --- AuthProvider Sarmalayıcısını Aktifleştir ---
    <AuthProvider>
      <PaperProvider theme={theme}>
          <AppContent />
      </PaperProvider>
    </AuthProvider>
  );
};

export default App;