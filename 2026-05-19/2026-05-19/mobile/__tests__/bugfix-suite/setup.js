/* Global mocks for React Native modules used by the screens under test */
jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  RN.Alert.alert = jest.fn();
  RN.BackHandler.addEventListener = jest.fn(() => ({ remove: jest.fn() }));
  RN.BackHandler.exitApp = jest.fn();
  RN.Linking.openURL = jest.fn();
  RN.Dimensions.get = jest.fn(() => ({ width: 375, height: 812 }));
  return RN;
});

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() }),
  useRoute: () => ({ params: {} }),
  useFocusEffect: jest.fn((cb) => { cb(); }),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('@nozbe/watermelondb', () => ({
  Q: {
    where: jest.fn(),
    gte: jest.fn(),
    sortBy: jest.fn(),
    desc: 'desc',
    take: jest.fn(),
    oneOf: jest.fn(),
  },
}));

jest.mock('react-native-linear-gradient', () => 'LinearGradient');
jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'MCIcon');
jest.mock('react-native-maps', () => 'MapView');
jest.mock('react-native-view-shot', () => ({ default: 'ViewShot' }));
jest.mock('react-native-image-picker', () => ({ launchCamera: jest.fn(), launchImageLibrary: jest.fn() }));
jest.mock('uuid', () => ({ v4: () => 'test-uuid-1234' }));
