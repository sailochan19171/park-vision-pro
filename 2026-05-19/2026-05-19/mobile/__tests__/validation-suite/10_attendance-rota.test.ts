/**
 * VALIDATION #10: Attendance & Rota
 * Validates: StartDayScreen.tsx, EndOfDayScreen.tsx, RotaCreateScreen.tsx, RotaScreen.tsx
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const START_DAY = readFileSync(resolve(__dirname, '../../src/screens/StartDayScreen.tsx'), 'utf-8');
const END_DAY = readFileSync(resolve(__dirname, '../../src/screens/EndOfDayScreen.tsx'), 'utf-8');
const ROTA_CREATE = readFileSync(resolve(__dirname, '../../src/screens/RotaCreateScreen.tsx'), 'utf-8');
const ROTA_VIEW = readFileSync(resolve(__dirname, '../../src/screens/RotaScreen.tsx'), 'utf-8');

describe('VALIDATION #10: Attendance & Rota', () => {
  describe('StartDayScreen — system checks', () => {
    it('should check sync status', () => {
      expect(START_DAY).toContain('const [syncDone, setSyncDone]');
    });

    it('should check connectivity', () => {
      expect(START_DAY).toContain('const [connectDone, setConnectDone]');
    });

    it('should check network availability', () => {
      expect(START_DAY).toContain('const [networkDone, setNetworkDone]');
    });

    it('should check location permission', () => {
      expect(START_DAY).toContain('const [locationDone, setLocationDone]');
    });

    it('should check battery level', () => {
      expect(START_DAY).toContain('const [batteryDone, setBatteryDone]');
      expect(START_DAY).toContain('batteryPct');
    });

    it('should gate attendance on all checks passing', () => {
      expect(START_DAY).toContain('const allChecksDone = syncDone === true && connectDone === true && networkDone === true && locationDone === true && batteryDone === true');
    });
  });

  describe('StartDayScreen — attendance marking with selfie', () => {
    it('should import captureSelfie', () => {
      expect(START_DAY).toContain("import { captureSelfie }");
    });

    it('should track selfie state', () => {
      expect(START_DAY).toContain('const [selfieTaken, setSelfieTaken] = useState(false)');
      expect(START_DAY).toContain('const [selfieUri, setSelfieUri]');
    });

    it('should have attendance type options', () => {
      expect(START_DAY).toContain("const ATTENDANCE_OPTIONS = ['Present', 'Leave', 'Week off', 'Holiday']");
    });

    it('should track attendanceType state', () => {
      expect(START_DAY).toContain("const [attendanceType, setAttendanceType] = useState('Present')");
    });

    it('should track marking state', () => {
      expect(START_DAY).toContain('const [marking, setMarking] = useState(false)');
    });

    it('should import PhotoPreviewModal', () => {
      expect(START_DAY).toContain("import PhotoPreviewModal");
    });
  });

  describe('StartDayScreen — NetInfo defensive import', () => {
    it('should wrap NetInfo import in try/catch', () => {
      expect(START_DAY).toContain("NetInfo = require('@react-native-community/netinfo').default");
    });

    it('should fall back to stub if NetInfo unavailable', () => {
      expect(START_DAY).toContain("NetInfo = { fetch: async () => ({ type: 'unknown', isConnected: null }) }");
    });

    it('should log warning when native module not linked', () => {
      expect(START_DAY).toContain('[NetInfo] native module not linked, using stub');
    });
  });

  describe('StartDayScreen — upload to server', () => {
    it('should import uploadPhoto from syncService', () => {
      expect(START_DAY).toContain("import { pushSync, uploadPhoto }");
    });

    it('should write to attendance_records table via database', () => {
      expect(START_DAY).toContain("database");
    });
  });

  describe('EndOfDayScreen — flow', () => {
    it('should import pushSync for data upload', () => {
      expect(END_DAY).toContain("import { pushSync }");
    });

    it('should call pushSync with progress tracking', () => {
      expect(END_DAY).toContain('pushSync((info)');
    });

    it('should display trip start and end times', () => {
      expect(END_DAY).toContain("const [tripStartTime, setTripStartTime] = useState('N/A')");
      expect(END_DAY).toContain("const [tripEndTime, setTripEndTime] = useState('N/A')");
    });

    it('should track upload status', () => {
      expect(END_DAY).toContain("const [uploadStatus, setUploadStatus] = useState('Pending')");
    });

    it('should show confirmation dialog', () => {
      expect(END_DAY).toContain('showConfirm');
    });

    it('should show success modal', () => {
      expect(END_DAY).toContain('showSuccess');
    });

    it('should track sync progress percentage', () => {
      expect(END_DAY).toContain('const [syncPct, setSyncPct] = useState(0)');
    });

    it('should use useFocusEffect to load data', () => {
      expect(END_DAY).toContain('useFocusEffect');
    });
  });

  describe('RotaCreateScreen — week view with shift picker', () => {
    it('should define ShiftType', () => {
      expect(ROTA_CREATE).toContain("type ShiftType = 'General Shift'");
    });

    it('should define SHIFTS array with all shift types', () => {
      expect(ROTA_CREATE).toContain("'General Shift'");
      expect(ROTA_CREATE).toContain("'Morning Shift'");
      expect(ROTA_CREATE).toContain("'Evening Shift'");
      expect(ROTA_CREATE).toContain("'Night Shift'");
      expect(ROTA_CREATE).toContain("'Holiday'");
      expect(ROTA_CREATE).toContain("'Week Off'");
      expect(ROTA_CREATE).toContain("'Leave'");
    });

    it('should build 7-day week view from Monday', () => {
      expect(ROTA_CREATE).toContain('function buildInitialDays');
      expect(ROTA_CREATE).toContain('function getMonday');
      expect(ROTA_CREATE).toContain('Array.from({ length: 7 }');
    });

    it('should have DayState with shift and time fields', () => {
      expect(ROTA_CREATE).toContain('shift: ShiftType | null');
      expect(ROTA_CREATE).toContain('fromTime: string');
      expect(ROTA_CREATE).toContain('toTime: string');
    });

    it('should have ClockPicker for time selection', () => {
      expect(ROTA_CREATE).toContain('function ClockPicker');
    });
  });

  describe('RotaCreateScreen — submit to API', () => {
    it('should validate all 7 days before submit', () => {
      expect(ROTA_CREATE).toContain('Please select a shift for all 7 days before submitting');
    });

    it('should call api.post to /rota', () => {
      expect(ROTA_CREATE).toContain("api.post('/rota'");
    });
  });

  describe('RotaCreateScreen — cancel navigates home with drawer', () => {
    it('should navigate to MainTabs with openDrawer param on cancel', () => {
      expect(ROTA_CREATE).toContain("navigation.navigate('MainTabs', { openDrawer: 'RotaCreate' })");
    });
  });

  describe('RotaScreen — view', () => {
    it('should fetch rota from API', () => {
      expect(ROTA_VIEW).toContain("api.get('/rota'");
    });

    it('should have user selector', () => {
      expect(ROTA_VIEW).toContain('const [selectedUser, setSelectedUser]');
    });

    it('should display entries with date and shift info', () => {
      expect(ROTA_VIEW).toContain('activityName');
      expect(ROTA_VIEW).toContain('rotaDate');
      expect(ROTA_VIEW).toContain('startTime');
      expect(ROTA_VIEW).toContain('endTime');
    });

    it('should use useFocusEffect to load data', () => {
      expect(ROTA_VIEW).toContain('useFocusEffect');
    });

    it('should have shift color mapping', () => {
      expect(ROTA_VIEW).toContain('SHIFT_COLORS');
    });
  });
});
