/**
 * BUG FIX #11: Photo watermark format + customer code/name on all screens
 * Verifies: Structured stamp format across PhotoPreviewModal, PhotoThumbnail, BurnWatermark
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const PREVIEW_MODAL = readFileSync(resolve(__dirname, '../../src/components/common/PhotoPreviewModal.tsx'), 'utf-8');
const THUMBNAIL = readFileSync(resolve(__dirname, '../../src/components/common/PhotoThumbnail.tsx'), 'utf-8');
const WATERMARK = readFileSync(resolve(__dirname, '../../src/services/watermarkService.tsx'), 'utf-8');
const VISIT = readFileSync(resolve(__dirname, '../../src/screens/CustomerVisitScreen.tsx'), 'utf-8');
const CUST_DASH = readFileSync(resolve(__dirname, '../../src/screens/CustomerDashboardScreen.tsx'), 'utf-8');
const PLANOGRAM = readFileSync(resolve(__dirname, '../../src/screens/PlanogramScreen.tsx'), 'utf-8');
const OSOI = readFileSync(resolve(__dirname, '../../src/screens/OSOIScreen.tsx'), 'utf-8');
const PO = readFileSync(resolve(__dirname, '../../src/screens/POCaptureScreen.tsx'), 'utf-8');
const COMPETITOR = readFileSync(resolve(__dirname, '../../src/screens/CompetitorScreen.tsx'), 'utf-8');

describe('BUG FIX #11: Photo Watermark Format', () => {
  describe('TC-11.1: PhotoPreviewModal structured stamp', () => {
    it('should accept customerCode prop', () => {
      expect(PREVIEW_MODAL).toContain('customerCode?: string');
    });

    it('should accept customerName prop', () => {
      expect(PREVIEW_MODAL).toContain('customerName?: string');
    });

    it('should render [customerCode]', () => {
      expect(PREVIEW_MODAL).toContain('[{customerCode}]');
    });

    it('should render customerName', () => {
      expect(PREVIEW_MODAL).toContain('{customerName}');
    });

    it('should render Date: prefix', () => {
      expect(PREVIEW_MODAL).toContain('Date: {stampDate}');
    });

    it('should render Latitude: and Longitude: separately', () => {
      expect(PREVIEW_MODAL).toContain('Latitude:');
      expect(PREVIEW_MODAL).toContain('Longitude:');
    });

    it('should use DD-MM-YYYY format (not DD/MM/YYYY)', () => {
      // Check formatStamp returns DD-MM-YYYY
      const format = PREVIEW_MODAL.match(/\$\{dd\}-\$\{mm\}-\$\{yy\}/);
      expect(format).not.toBeNull();
    });

    it('should use 7 decimal places for coordinates', () => {
      expect(PREVIEW_MODAL).toContain('toFixed(7)');
    });
  });

  describe('TC-11.2: PhotoThumbnail structured stamp', () => {
    it('should accept customerCode and customerName in PhotoMeta', () => {
      expect(THUMBNAIL).toContain('customerCode?: string');
      expect(THUMBNAIL).toContain('customerName?: string');
    });

    it('should render structured stamp in full-screen preview', () => {
      expect(THUMBNAIL).toContain('[{photo.customerCode}]');
      expect(THUMBNAIL).toContain('{photo.customerName}');
      expect(THUMBNAIL).toContain('Date: {stampDate}');
      expect(THUMBNAIL).toContain('Latitude: {stampLat}');
      expect(THUMBNAIL).toContain('Longitude: {stampLng}');
    });
  });

  describe('TC-11.3: BurnWatermark uses same format', () => {
    it('should accept customerCode in WatermarkInfo', () => {
      expect(WATERMARK).toContain('customerCode?: string');
    });

    it('should render [customerCode] in burned image', () => {
      expect(WATERMARK).toContain('[{info.customerCode}]');
    });

    it('should use DD-MM-YYYY format', () => {
      const format = WATERMARK.match(/\$\{dd\}-\$\{mm\}-\$\{yy\}/);
      expect(format).not.toBeNull();
    });

    it('should use 7 decimal places for coordinates', () => {
      expect(WATERMARK).toContain('toFixed(7)');
    });
  });

  describe('TC-11.4: All call sites pass customerCode/customerName', () => {
    it('CustomerVisitScreen check-in passes customerCode + customerName', () => {
      const match = VISIT.match(/PhotoPreviewModal[\s\S]*?customerCode=\{customerCode\}[\s\S]*?customerName=\{customerName\}/);
      expect(match).not.toBeNull();
    });

    it('CustomerDashboardScreen checkout passes customerCode + customerName', () => {
      const match = CUST_DASH.match(/PhotoPreviewModal[\s\S]*?customerCode=\{customerCode\}[\s\S]*?customerName=\{customerName\}/);
      expect(match).not.toBeNull();
    });

    it('PlanogramScreen passes customerCode + customerName to PhotoThumbnail', () => {
      expect(PLANOGRAM).toContain('customerCode, customerName }');
    });

    it('OSOIScreen passes customerCode + customerName to PhotoThumbnail', () => {
      expect(OSOI).toContain('customerCode, customerName }');
    });

    it('POCaptureScreen passes customerCode + customerName to PhotoThumbnail', () => {
      expect(PO).toContain('customerCode, customerName }');
    });

    it('CompetitorScreen includes customerCode + customerName in photoData', () => {
      expect(COMPETITOR).toContain('customerCode, customerName }');
    });
  });
});
