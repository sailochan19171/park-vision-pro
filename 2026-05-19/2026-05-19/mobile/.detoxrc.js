/** @type {import('detox').DetoxConfig} */
module.exports = {
  testRunner: {
    args: {
      $0: 'jest',
      config: 'e2e/jest.config.js',
    },
    jest: {
      setupTimeout: 120000,
    },
  },

  apps: {
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      build: 'cd android && bash ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug',
      reversePorts: [3000],
    },
    'android.release': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/release/app-release.apk',
      build: 'cd android && gradlew.bat assembleRelease assembleAndroidTest -DtestBuildType=release',
    },
  },

  devices: {
    // Physical device connected via ADB
    attached: {
      type: 'android.attached',
      device: {
        adbName: '.*', // matches any attached device
      },
    },
    // Emulator fallback
    emulator: {
      type: 'android.emulator',
      device: {
        avdName: 'Pixel_3a_API_30',
      },
    },
  },

  configurations: {
    // Primary: physical device via ADB
    'android.att.debug': {
      device: 'attached',
      app: 'android.debug',
    },
    'android.att.release': {
      device: 'attached',
      app: 'android.release',
    },
    // Fallback: emulator
    'android.emu.debug': {
      device: 'emulator',
      app: 'android.debug',
    },
  },
};
