import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.ecd04ec9242e4fb6ad55099986cb1985',
  appName: 'iotistic-inventory',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
};

export default config;
