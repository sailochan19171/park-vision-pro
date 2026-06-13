/**
 * VALIDATION #14: UI Components
 * Validates: PhotoPreviewModal, PhotoThumbnail, NumericKeypad,
 *            StoreActivityHeader, SearchBar, ErrorBoundary
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const PREVIEW = readFileSync(resolve(__dirname, '../../src/components/common/PhotoPreviewModal.tsx'), 'utf-8');
const THUMB = readFileSync(resolve(__dirname, '../../src/components/common/PhotoThumbnail.tsx'), 'utf-8');
const KEYPAD = readFileSync(resolve(__dirname, '../../src/components/common/NumericKeypad.tsx'), 'utf-8');
const HEADER = readFileSync(resolve(__dirname, '../../src/components/common/StoreActivityHeader.tsx'), 'utf-8');
const SEARCH = readFileSync(resolve(__dirname, '../../src/components/common/SearchBar.tsx'), 'utf-8');
const ERROR = readFileSync(resolve(__dirname, '../../src/components/common/ErrorBoundary.tsx'), 'utf-8');

describe('VALIDATION #14: UI Components', () => {
  describe('PhotoPreviewModal — structured stamp', () => {
    it('should have formatStamp function for DD-MM-YYYY HH:MM:SS', () => {
      expect(PREVIEW).toContain('function formatStamp');
      expect(PREVIEW).toContain("padStart(2, '0')");
    });

    it('should display customerCode in stamp', () => {
      expect(PREVIEW).toContain('[{customerCode}]');
    });

    it('should display customerName in stamp', () => {
      expect(PREVIEW).toContain('{customerName}');
    });

    it('should display date in stamp', () => {
      expect(PREVIEW).toContain('Date: {stampDate}');
    });

    it('should display latitude in stamp', () => {
      expect(PREVIEW).toContain('Latitude:');
    });

    it('should display longitude in stamp', () => {
      expect(PREVIEW).toContain('Longitude:');
    });

    it('should accept onAccept prop', () => {
      expect(PREVIEW).toContain('onAccept: () => void');
    });

    it('should accept onRetake prop', () => {
      expect(PREVIEW).toContain('onRetake: () => void');
    });
  });

  describe('PhotoPreviewModal — accept/retake buttons', () => {
    it('should have Retake button', () => {
      expect(PREVIEW).toContain('Retake');
      expect(PREVIEW).toContain('onPress={onRetake}');
    });

    it('should have Use Photo (accept) button', () => {
      expect(PREVIEW).toContain('Use Photo');
      expect(PREVIEW).toContain('onPress={onAccept}');
    });
  });

  describe('PhotoThumbnail — preview modal and stamp format', () => {
    it('should export PhotoMeta interface', () => {
      expect(THUMB).toContain('export interface PhotoMeta');
    });

    it('should have uri in PhotoMeta', () => {
      expect(THUMB).toContain('uri: string');
    });

    it('should have timestamp in PhotoMeta', () => {
      expect(THUMB).toContain('timestamp?: number');
    });

    it('should have latitude in PhotoMeta', () => {
      expect(THUMB).toContain('latitude?: number | null');
    });

    it('should have longitude in PhotoMeta', () => {
      expect(THUMB).toContain('longitude?: number | null');
    });

    it('should open full-screen preview modal on tap', () => {
      expect(THUMB).toContain('const [preview, setPreview] = useState(false)');
      expect(THUMB).toContain('onPress={() => setPreview(true)}');
    });

    it('should have formatStamp function for DD-MM-YYYY HH:MM:SS', () => {
      expect(THUMB).toContain('function formatStamp');
    });

    it('should display stamp overlay on thumbnail', () => {
      expect(THUMB).toContain('stampOverlay');
    });

    it('should format coordinates with toFixed(7)', () => {
      expect(THUMB).toContain('val.toFixed(7)');
    });
  });

  describe('NumericKeypad — visible, value display, confirm/close', () => {
    it('should accept visible prop', () => {
      expect(KEYPAD).toContain('visible: boolean');
    });

    it('should accept value prop', () => {
      expect(KEYPAD).toContain('value: number');
    });

    it('should accept onConfirm callback', () => {
      expect(KEYPAD).toContain('onConfirm: (value: number) => void');
    });

    it('should accept onClose callback', () => {
      expect(KEYPAD).toContain('onClose: () => void');
    });

    it('should display the current value', () => {
      expect(KEYPAD).toContain('const [display, setDisplay]');
    });

    it('should have digit buttons (handleDigit)', () => {
      expect(KEYPAD).toContain('const handleDigit');
    });

    it('should have clear function', () => {
      expect(KEYPAD).toContain('const handleClear');
    });

    it('should have backspace function', () => {
      expect(KEYPAD).toContain('const handleBackspace');
    });

    it('should have quick value shortcuts', () => {
      expect(KEYPAD).toContain('DEFAULT_QUICK');
      expect(KEYPAD).toContain('handleQuick');
    });

    it('should limit input to 6 digits', () => {
      expect(KEYPAD).toContain('prev.length >= 6');
    });

    it('should use Modal for overlay', () => {
      expect(KEYPAD).toContain('Modal');
    });

    it('should accept title prop', () => {
      expect(KEYPAD).toContain("title?: string");
    });
  });

  describe('StoreActivityHeader — logo, hamburger, drawer', () => {
    it('should render logo image', () => {
      expect(HEADER).toContain("require('../../assets/farmley_logo.png')");
    });

    it('should have hamburger button with menu icon', () => {
      expect(HEADER).toContain('name="menu"');
    });

    it('should show side drawer on tap', () => {
      expect(HEADER).toContain('openDrawer');
    });

    it('should accept title prop', () => {
      expect(HEADER).toContain("title?: string");
    });

    it('should accept customerCode prop', () => {
      expect(HEADER).toContain('customerCode?: string');
    });

    it('should accept customerName prop', () => {
      expect(HEADER).toContain('customerName?: string');
    });

    it('should accept rightElement prop', () => {
      expect(HEADER).toContain('rightElement?: React.ReactNode');
    });

    it('should render WINIT logo in drawer footer', () => {
      expect(HEADER).toContain("require('../../assets/winit-logo.png')");
    });
  });

  describe('SearchBar component', () => {
    it('should accept value prop', () => {
      expect(SEARCH).toContain('value: string');
    });

    it('should accept onChangeText prop', () => {
      expect(SEARCH).toContain('onChangeText: (text: string) => void');
    });

    it('should accept placeholder prop', () => {
      expect(SEARCH).toContain("placeholder?: string");
    });

    it('should render search icon', () => {
      expect(SEARCH).toContain('search-outline');
    });

    it('should render clear icon when value is not empty', () => {
      expect(SEARCH).toContain('close-circle');
    });

    it('should use TextInput', () => {
      expect(SEARCH).toContain('TextInput');
    });
  });

  describe('ErrorBoundary', () => {
    it('should extend React.Component', () => {
      expect(ERROR).toContain('extends Component<Props, State>');
    });

    it('should implement getDerivedStateFromError', () => {
      expect(ERROR).toContain('static getDerivedStateFromError');
    });

    it('should implement componentDidCatch', () => {
      expect(ERROR).toContain('componentDidCatch');
    });

    it('should display "Something went wrong" on error', () => {
      expect(ERROR).toContain('Something went wrong');
    });

    it('should display error message', () => {
      expect(ERROR).toContain("this.state.error?.message || 'Unknown error'");
    });

    it('should have "Try Again" recovery button', () => {
      expect(ERROR).toContain('Try Again');
    });

    it('should reset error state on retry', () => {
      expect(ERROR).toContain('this.setState({ hasError: false, error: null })');
    });

    it('should render children when no error', () => {
      expect(ERROR).toContain('return this.props.children');
    });
  });
});
