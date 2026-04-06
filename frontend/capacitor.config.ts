import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ricewarehouse.app',
  appName: 'Rice Warehouse',
  webDir: 'build',
  server: {
    androidScheme: 'https',
    // For production, use your deployed URL:
    // url: 'https://your-railway-app.up.railway.app'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#d4891a',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#d4891a',
    },
  },
  android: {
    allowMixedContent: true,
    minWebViewVersion: 60,
  },
};

export default config;
