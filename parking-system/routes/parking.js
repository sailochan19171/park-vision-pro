const express = require('express');
const { body, query, param } = require('express-validator');
const router = express.Router();

const {
  getParkingSpots,
  getParkingSpotById,
  updateParkingSpotStatus,
  createParkingSpot,
  updateParkingSpot,
  deleteParkingSpot,
  getParkingAnalytics
} = require('../controllers/parkingController');

const { verifyToken, requireAdmin, optionalAuth } = require('../middlewares/auth');

/**
 * @route   GET /api/parking/spots
 * @desc    Get all parking spots with filters
 * @access  Public (with optional auth for personalized results)
 */
router.get('/spots', [
  optionalAuth,
  query('status')
    .optional()
    .isIn(['available', 'occupied', 'reserved', 'maintenance', 'out_of_service'])
    .withMessage('Invalid status filter'),
  query('type')
    .optional()
    .isIn(['regular', 'disabled', 'electric', 'vip', 'motorcycle'])
    .withMessage('Invalid type filter'),
  query('available')
    .optional()
    .isBoolean()
    .withMessage('Available filter must be boolean'),
  query('latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Invalid latitude'),
  query('longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Invalid longitude'),
  query('maxDistance')
    .optional()
    .isFloat({ min: 0.1, max: 100 })
    .withMessage('Max distance must be between 0.1 and 100 km'),
  query('sortBy')
    .optional()
    .isIn(['spotNumber', 'distance', 'pricing.hourlyRate', 'createdAt'])
    .withMessage('Invalid sort field'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
], getParkingSpots);

/**
 * @route   GET /api/parking/spot/:id
 * @desc    Get parking spot by ID
 * @access  Public
 */
router.get('/spot/:id', [
  param('id')
    .isMongoId()
    .withMessage('Invalid parking spot ID')
], getParkingSpotById);

/**
 * @route   PUT /api/parking/spot/:id/status
 * @desc    Update parking spot status
 * @access  Private (Admin)
 */
router.put('/spot/:id/status', [
  verifyToken,
  requireAdmin,
  param('id')
    .isMongoId()
    .withMessage('Invalid parking spot ID'),
  body('status')
    .isIn(['available', 'occupied', 'reserved', 'maintenance', 'out_of_service'])
    .withMessage('Invalid status'),
  body('vehicleId')
    .optional()
    .isMongoId()
    .withMessage('Invalid vehicle ID'),
  body('bookingId')
    .optional()
    .isMongoId()
    .withMessage('Invalid booking ID'),
  body('reason')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Reason cannot exceed 500 characters')
    .trim()
], updateParkingSpotStatus);

/**
 * @route   POST /api/parking/spots
 * @desc    Create new parking spot
 * @access  Private (Admin)
 */
router.post('/spots', [
  verifyToken,
  requireAdmin,
  body('spotNumber')
    .notEmpty()
    .withMessage('Spot number is required')
    .isLength({ max: 20 })
    .withMessage('Spot number cannot exceed 20 characters')
    .trim(),
  body('location.name')
    .notEmpty()
    .withMessage('Location name is required')
    .isLength({ max: 200 })
    .withMessage('Location name cannot exceed 200 characters')
    .trim(),
  body('location.address')
    .notEmpty()
    .withMessage('Address is required')
    .isLength({ max: 500 })
    .withMessage('Address cannot exceed 500 characters')
    .trim(),
  body('location.coordinates.latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Invalid latitude'),
  body('location.coordinates.longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Invalid longitude'),
  body('location.floor')
    .optional()
    .isLength({ max: 20 })
    .withMessage('Floor cannot exceed 20 characters')
    .trim(),
  body('location.section')
    .optional()
    .isLength({ max: 10 })
    .withMessage('Section cannot exceed 10 characters')
    .trim(),
  body('type')
    .optional()
    .isIn(['regular', 'disabled', 'electric', 'vip', 'motorcycle'])
    .withMessage('Invalid parking spot type'),
  body('dimensions.length')
    .isFloat({ min: 2, max: 20 })
    .withMessage('Length must be between 2 and 20 meters'),
  body('dimensions.width')
    .isFloat({ min: 2, max: 10 })
    .withMessage('Width must be between 2 and 10 meters'),
  body('dimensions.height')
    .optional()
    .isFloat({ min: 1.5, max: 5 })
    .withMessage('Height must be between 1.5 and 5 meters'),
  body('pricing.hourlyRate')
    .isFloat({ min: 0 })
    .withMessage('Hourly rate must be a positive number'),
  body('pricing.dailyRate')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Daily rate must be a positive number'),
  body('pricing.monthlyRate')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Monthly rate must be a positive number')
], createParkingSpot);

/**
 * @route   PUT /api/parking/spot/:id
 * @desc    Update parking spot details
 * @access  Private (Admin)
 */
router.put('/spot/:id', [
  verifyToken,
  requireAdmin,
  param('id')
    .isMongoId()
    .withMessage('Invalid parking spot ID'),
  body('spotNumber')
    .optional()
    .isLength({ max: 20 })
    .withMessage('Spot number cannot exceed 20 characters')
    .trim(),
  body('location.name')
    .optional()
    .isLength({ max: 200 })
    .withMessage('Location name cannot exceed 200 characters')
    .trim(),
  body('location.address')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Address cannot exceed 500 characters')
    .trim(),
  body('location.coordinates.latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Invalid latitude'),
  body('location.coordinates.longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Invalid longitude'),
  body('type')
    .optional()
    .isIn(['regular', 'disabled', 'electric', 'vip', 'motorcycle'])
    .withMessage('Invalid parking spot type'),
  body('pricing.hourlyRate')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Hourly rate must be a positive number'),
  body('pricing.dailyRate')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Daily rate must be a positive number'),
  body('pricing.monthlyRate')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Monthly rate must be a positive number')
], updateParkingSpot);

/**
 * @route   DELETE /api/parking/spot/:id
 * @desc    Delete parking spot
 * @access  Private (Admin)
 */
router.delete('/spot/:id', [
  verifyToken,
  requireAdmin,
  param('id')
    .isMongoId()
    .withMessage('Invalid parking spot ID')
], deleteParkingSpot);

/**
 * @route   GET /api/parking/analytics
 * @desc    Get parking analytics
 * @access  Private (Admin)
 */
router.get('/analytics', [
  verifyToken,
  requireAdmin,
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid start date format'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid end date format'),
  query('spotId')
    .optional()
    .isMongoId()
    .withMessage('Invalid spot ID'),
  query('groupBy')
    .optional()
    .isIn(['hour', 'day', 'week', 'month'])
    .withMessage('Group by must be hour, day, week, or month')
], getParkingAnalytics);

/**
 * @route   GET /api/parking/nearby
 * @desc    Find nearby parking spots
 * @access  Public
 */
router.get('/nearby', [
  query('latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Valid latitude is required'),
  query('longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Valid longitude is required'),
  query('radius')
    .optional()
    .isFloat({ min: 0.1, max: 50 })
    .withMessage('Radius must be between 0.1 and 50 km'),
  query('type')
    .optional()
    .isIn(['regular', 'disabled', 'electric', 'vip', 'motorcycle'])
    .withMessage('Invalid type filter'),
  query('maxPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Max price must be a positive number'),
  query('features')
    .optional()
    .custom((value) => {
      const validFeatures = ['covered', 'secured', 'cctv', 'evCharging', 'carWash'];
      const features = Array.isArray(value) ? value : [value];
      const isValid = features.every(feature => validFeatures.includes(feature));
      if (!isValid) {
        throw new Error('Invalid features');
      }
      return true;
    })
], async (req, res) => {
  // This will use the same controller as getParkingSpots but with location filters
  req.query.available = 'true';
  await getParkingSpots(req, res);
});

/**
 * @route   POST /api/parking/reserve
 * @desc    Reserve a parking spot
 * @access  Private
 */
router.post('/reserve', [
  verifyToken,
  body('spotId')
    .isMongoId()
    .withMessage('Invalid spot ID'),
  body('vehicleId')
    .isMongoId()
    .withMessage('Invalid vehicle ID'),
  body('startTime')
    .isISO8601()
    .withMessage('Invalid start time format'),
  body('endTime')
    .isISO8601()
    .withMessage('Invalid end time format')
    .custom((value, { req }) => {
      if (new Date(value) <= new Date(req.body.startTime)) {
        throw new Error('End time must be after start time');
      }
      return true;
    }),
  body('bookingType')
    .optional()
    .isIn(['hourly', 'daily', 'monthly'])
    .withMessage('Invalid booking type')
], async (req, res) => {
  // TODO: Implement reservation functionality
  res.status(501).json({
    success: false,
    message: 'Reservation functionality not implemented yet'
  });
});

module.exports = router;