const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const vehicleController = require('../controllers/vehicleController');
const { verifyToken, requireAdmin } = require('../middlewares/auth');

// @route   POST /api/vehicle/register
// @desc    Register a new vehicle
// @access  Private
router.post('/register', [
  verifyToken,
  body('licensePlate')
    .notEmpty()
    .withMessage('License plate is required')
    .isLength({ min: 3, max: 15 })
    .withMessage('License plate must be between 3 and 15 characters')
    .trim(),
  body('make')
    .notEmpty()
    .withMessage('Vehicle make is required')
    .isLength({ max: 50 })
    .withMessage('Make cannot exceed 50 characters')
    .trim(),
  body('model')
    .notEmpty()
    .withMessage('Vehicle model is required')
    .isLength({ max: 50 })
    .withMessage('Model cannot exceed 50 characters')
    .trim(),
  body('year')
    .isInt({ min: 1900, max: new Date().getFullYear() + 1 })
    .withMessage('Please provide a valid year'),
  body('color')
    .notEmpty()
    .withMessage('Vehicle color is required')
    .isLength({ max: 30 })
    .withMessage('Color cannot exceed 30 characters')
    .trim(),
  body('type')
    .optional()
    .isIn(['car', 'motorcycle', 'truck', 'van', 'suv', 'electric'])
    .withMessage('Invalid vehicle type'),
  body('fuelType')
    .optional()
    .isIn(['petrol', 'diesel', 'electric', 'hybrid', 'cng', 'lpg'])
    .withMessage('Invalid fuel type'),
  body('rfidTag')
    .optional()
    .isLength({ max: 50 })
    .withMessage('RFID tag cannot exceed 50 characters')
    .trim()
], vehicleController.registerVehicle);

// @route   POST /api/vehicle/entry
// @desc    Record vehicle entry (LPR or manual)
// @access  Private
router.post('/entry', verifyToken, vehicleController.logVehicleEntry);

// @route   POST /api/vehicle/exit
// @desc    Record vehicle exit (LPR or manual)
// @access  Private
router.post('/exit', verifyToken, vehicleController.logVehicleExit);

// @route   GET /api/vehicle/logs
// @desc    Get vehicle entry/exit logs
// @access  Private (Admin)
router.get('/logs', verifyToken, requireAdmin, vehicleController.getVehicleLogs);

// @route   POST /api/vehicle/lpr
// @desc    License Plate Recognition webhook
// @access  Public (from LPR system)
router.post('/lpr', vehicleController.processLPRDetection);

// @route   GET /api/vehicle/logs/:id
// @desc    Get specific vehicle log by ID
// @access  Private (Admin)
router.get('/logs/:id', verifyToken, requireAdmin, vehicleController.getVehicleLogById);

// @route   PUT /api/vehicle/logs/:id/suspicious
// @desc    Mark vehicle log as suspicious
// @access  Private (Admin)
router.put('/logs/:id/suspicious', verifyToken, requireAdmin, vehicleController.markLogSuspicious);

// @route   GET /api/vehicle/analytics
// @desc    Get vehicle analytics
// @access  Private (Admin)
router.get('/analytics', verifyToken, requireAdmin, vehicleController.getVehicleAnalytics);

module.exports = router;