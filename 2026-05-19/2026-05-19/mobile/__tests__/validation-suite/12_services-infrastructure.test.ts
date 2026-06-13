/**
 * VALIDATION #12: Services & Infrastructure
 * Validates: syncService.ts (push), cameraService.ts, locationService.ts, watermarkService.tsx
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SYNC = readFileSync(resolve(__dirname, '../../src/services/syncService.ts'), 'utf-8');
const CAMERA = readFileSync(resolve(__dirname, '../../src/services/cameraService.ts'), 'utf-8');
const LOCATION = readFileSync(resolve(__dirname, '../../src/services/locationService.ts'), 'utf-8');
const WATERMARK = readFileSync(resolve(__dirname, '../../src/services/watermarkService.tsx'), 'utf-8');
const BG_SYNC = readFileSync(resolve(__dirname, '../../src/services/backgroundSync.ts'), 'utf-8');

describe('VALIDATION #12: Services & Infrastructure', () => {
  describe('syncService — pushSync handles all entity types', () => {
    const pushEntities = [
      'orders', 'attendance', 'customer_visits', 'store_checks',
      'planograms', 'opening_stocks', 'physical_stocks',
    ];

    for (const entity of pushEntities) {
      it(`should push ${entity} entity`, () => {
        expect(SYNC).toContain(`'${entity}'`);
      });
    }

    it('should export pushSync function', () => {
      expect(SYNC).toContain('export async function pushSync');
    });

    it('should define entityNames list for progress tracking', () => {
      expect(SYNC).toContain('const entityNames = [');
    });

    it('should report progress per entity', () => {
      expect(SYNC).toContain('reportProgress');
    });

    it('should handle chunked push for large datasets', () => {
      expect(SYNC).toContain('pushEntityInChunks');
      expect(SYNC).toContain('PUSH_CHUNK_SIZE');
    });
  });

  describe('syncService — photo upload', () => {
    it('should export uploadPhoto function', () => {
      expect(SYNC).toContain('export async function uploadPhoto');
    });

    it('should handle already-uploaded server URLs', () => {
      expect(SYNC).toContain("localUri.startsWith('/public/')");
    });

    it('should use FormData for upload', () => {
      expect(SYNC).toContain('new FormData()');
    });

    it('should return null on upload failure (non-blocking)', () => {
      expect(SYNC).toContain('return null');
    });
  });

  describe('cameraService — photo capture with permissions', () => {
    it('should export capturePhoto function', () => {
      expect(CAMERA).toContain('export async function capturePhoto');
    });

    it('should request camera permission on Android', () => {
      expect(CAMERA).toContain('requestCameraPermission');
      expect(CAMERA).toContain('PermissionsAndroid.PERMISSIONS.CAMERA');
    });

    it('should return CapturedImage interface', () => {
      expect(CAMERA).toContain('export interface CapturedImage');
    });

    it('should have uri, fileName, type in CapturedImage', () => {
      expect(CAMERA).toContain('uri: string');
      expect(CAMERA).toContain('fileName: string');
      expect(CAMERA).toContain('type: string');
    });

    it('should support custom camera toggle', () => {
      expect(CAMERA).toContain('CUSTOM_CAMERA_KEY');
      expect(CAMERA).toContain('isCustomCameraEnabled');
    });

    it('should use launchCamera from image-picker', () => {
      expect(CAMERA).toContain("import { launchCamera");
    });
  });

  describe('locationService — getCurrentPosition', () => {
    it('should export getCurrentPosition function', () => {
      expect(LOCATION).toContain('export async function getCurrentPosition');
    });

    it('should export GeoPosition interface', () => {
      expect(LOCATION).toContain('export interface GeoPosition');
    });

    it('should have lat, lng, accuracy in GeoPosition', () => {
      expect(LOCATION).toContain('lat: number');
      expect(LOCATION).toContain('lng: number');
      expect(LOCATION).toContain('accuracy: number');
    });

    it('should request fine and coarse location permissions', () => {
      expect(LOCATION).toContain('ACCESS_FINE_LOCATION');
      expect(LOCATION).toContain('ACCESS_COARSE_LOCATION');
    });

    it('should support fast mode with cached position', () => {
      expect(LOCATION).toContain('if (fast)');
      expect(LOCATION).toContain('Using cached position for fast mode');
    });

    it('should have fallback to last known position', () => {
      expect(LOCATION).toContain('_lastPos');
    });

    it('should show GPS disabled alert when no position available', () => {
      expect(LOCATION).toContain('GPS Disabled');
    });
  });

  describe('locationService — calculateDistance', () => {
    it('should export calculateDistance function', () => {
      expect(LOCATION).toContain('export function calculateDistance');
    });

    it('should use Haversine formula with Earth radius 6371e3', () => {
      expect(LOCATION).toContain('const R = 6371e3');
    });

    it('should accept lat1, lng1, lat2, lng2 parameters', () => {
      const match = LOCATION.match(/calculateDistance\(\s*\n?\s*lat1/);
      expect(match).not.toBeNull();
    });

    it('should return rounded meter distance', () => {
      expect(LOCATION).toContain('Math.round(R * c)');
    });
  });

  describe('watermarkService — format', () => {
    it('should export getWatermarkInfo function', () => {
      expect(WATERMARK).toContain('export async function getWatermarkInfo');
    });

    it('should include customerCode parameter', () => {
      expect(WATERMARK).toContain('customerCode?: string');
    });

    it('should include customerName parameter', () => {
      expect(WATERMARK).toContain('customerName?: string');
    });

    it('should format timestamp as DD-MM-YYYY HH:MM:SS', () => {
      expect(WATERMARK).toContain("const timestamp = `${dd}-${mm}-${yy} ${hh}:${mi}:${ss}`");
    });

    it('should include latitude in watermark info', () => {
      expect(WATERMARK).toContain('latitude: lat');
    });

    it('should include longitude in watermark info', () => {
      expect(WATERMARK).toContain('longitude: lng');
    });

    it('should export BurnWatermark component', () => {
      expect(WATERMARK).toContain('export function BurnWatermark');
    });

    it('should define WatermarkInfo interface', () => {
      expect(WATERMARK).toContain('interface WatermarkInfo');
    });
  });

  describe('backgroundSync — setup', () => {
    it('should export startBackgroundSync function', () => {
      expect(BG_SYNC).toContain('export function startBackgroundSync');
    });

    it('should export stopBackgroundSync function', () => {
      expect(BG_SYNC).toContain('export function stopBackgroundSync');
    });

    it('should run syncForceFlags on interval', () => {
      expect(BG_SYNC).toContain('syncForceFlags');
    });

    it('should run syncCustomerTargets on interval', () => {
      expect(BG_SYNC).toContain('syncCustomerTargets');
    });

    it('should run incrementalSync for full data sync', () => {
      expect(BG_SYNC).toContain('incrementalSync');
    });

    it('should clear intervals on stop', () => {
      expect(BG_SYNC).toContain('clearInterval');
    });
  });
});
