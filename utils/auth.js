// utils/auth.js
import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';

// Ensure this function is defined and exported
export const getTokens = async () => {
  try {
    const access = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
    const refresh = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    // Return null or an object with null values if tokens don't exist
    return (access || refresh) ? { access, refresh } : null;
  } catch (error) {
    console.error('Error getting tokens:', error);
    return null; // Return null on error
  }
};

// Ensure this function is defined and exported
export const setTokens = async (access, refresh) => {
  try {
    const tasks = [];
    if (access !== undefined) { // Allow storing null/empty strings if needed, or check truthiness
        tasks.push(SecureStore.setItemAsync(ACCESS_TOKEN_KEY, access || ''));
    }
    if (refresh !== undefined) {
         tasks.push(SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refresh || ''));
    }
    await Promise.all(tasks);
  } catch (error) {
    console.error('Error setting tokens:', error);
  }
};

// Ensure this function is defined and exported
export const clearTokens = async () => {
  try {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  } catch (error) {
    console.error('Error clearing tokens:', error);
  }
};