module.exports = {
  assets: ['./android/app/src/main/assets/fonts'],
  dependencies: {
    '@react-native-community/geolocation': {
      platforms: {
        // Geolocation 3.4.0 doesn't generate codegen JNI for RN 0.84 New Architecture.
        // Completely disable native autolinking — use JS-only bridge instead.
        android: null,
      },
    },
  },
};
