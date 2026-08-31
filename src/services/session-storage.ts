import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const REFRESH_TOKEN_KEY = 'interview-atlas.refresh-token.v1';
const options: SecureStore.SecureStoreOptions = {
  keychainService: 'interview-atlas.session',
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
let webMemoryToken: string | null = null;

export async function readRefreshToken(): Promise<string | null> {
  if (Platform.OS === 'web') return webMemoryToken;
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY, options);
}
export async function writeRefreshToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    webMemoryToken = token;
    return;
  }
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token, options);
}

export async function deleteRefreshToken(): Promise<void> {
  if (Platform.OS === 'web') {
    webMemoryToken = null;
    return;
  }
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY, options);
}
