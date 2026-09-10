import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.myteleproject2026.mtp2026',
  appName: 'MTP2026 App Launcher',
  webDir: 'frontend/dist',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#070811'
    },
    ScreenOrientation: {
      defaultOrientation: 'portrait'
    }
  }
};

export default config;
