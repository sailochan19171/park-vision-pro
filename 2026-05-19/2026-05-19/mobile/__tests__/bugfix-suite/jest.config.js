/** Jest config for bug-fix verification test suite */
module.exports = {
  rootDir: '../..',
  testMatch: ['<rootDir>/__tests__/bugfix-suite/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['babel-jest', { presets: ['module:@react-native/babel-preset'] }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|@nozbe|react-native-vector-icons|react-native-linear-gradient|react-native-image-picker|@react-native-async-storage|react-native-view-shot|uuid)/)',
  ],
  moduleNameMapper: {
    '\\.(jpg|jpeg|png|gif|webp|svg)$': '<rootDir>/__tests__/bugfix-suite/__mocks__/fileMock.js',
  },
  setupFiles: ['<rootDir>/__tests__/bugfix-suite/setup.js'],
  reporters: [
    'default',
    ['jest-html-reporters', {
      publicPath: '<rootDir>/__tests__/bugfix-suite/report',
      filename: 'test-report.html',
      pageTitle: 'Farmley SFA v2 - Bug Fix Verification Report',
      expand: true,
      openReport: false,
    }],
  ],
  testTimeout: 30000,
  verbose: true,
};
