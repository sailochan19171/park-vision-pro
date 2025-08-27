const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/auth');
const User = require('../models/User');
const Booking = require('../models/Booking');
const Vehicle = require('../models/Vehicle');
const ParkingSpot = require('../models/ParkingSpot');

// @route   GET /api/user/profile
// @desc    Get user profile
// @access  Private
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile'
    });
  }
});

// @route   GET /api/user/stats
// @desc    Get user statistics
// @access  Private
router.get('/stats', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user's bookings
    const activeBookings = await Booking.countDocuments({
      user: userId,
      status: { $in: ['active', 'ongoing'] }
    });
    
    // Get user's vehicles
    const totalVehicles = await Vehicle.countDocuments({
      owner: userId,
      status: 'active'
    });
    
    // Get monthly spending
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const monthlyBookings = await Booking.find({
      user: userId,
      'timeline.bookedAt': { $gte: startOfMonth },
      'payment.status': 'paid'
    });
    
    const monthlySpending = monthlyBookings.reduce((sum, booking) => {
      return sum + (booking.payment.paidAmount || 0);
    }, 0);
    
    // Get total parking hours this month
    const totalHours = monthlyBookings.reduce((sum, booking) => {
      if (booking.timeline.actualEndTime && booking.timeline.actualStartTime) {
        const duration = new Date(booking.timeline.actualEndTime) - new Date(booking.timeline.actualStartTime);
        return sum + (duration / (1000 * 60 * 60)); // Convert to hours
      }
      return sum;
    }, 0);
    
    res.json({
      success: true,
      data: {
        activeBookings,
        totalVehicles,
        monthlySpending,
        totalHours: Math.round(totalHours * 10) / 10 // Round to 1 decimal
      }
    });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics'
    });
  }
});

// @route   GET /api/user/bookings
// @desc    Get user's bookings
// @access  Private
router.get('/bookings', verifyToken, async (req, res) => {
  try {
    const { status, limit = 10, page = 1 } = req.query;
    const query = { user: req.user.id };
    
    if (status) {
      query.status = status;
    }
    
    const skip = (page - 1) * limit;
    
    const bookings = await Booking.find(query)
      .populate('vehicle', 'licensePlate make model')
      .populate('parkingSpot', 'spotNumber location')
      .sort({ 'timeline.bookedAt': -1 })
      .limit(parseInt(limit))
      .skip(skip);
    
    const total = await Booking.countDocuments(query);
    
    res.json({
      success: true,
      data: bookings,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bookings'
    });
  }
});

// @route   GET /api/user/vehicles
// @desc    Get user's vehicles
// @access  Private
router.get('/vehicles', verifyToken, async (req, res) => {
  try {
    const vehicles = await Vehicle.find({
      owner: req.user.id,
      status: 'active'
    }).sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: vehicles
    });
  } catch (error) {
    console.error('Error fetching vehicles:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vehicles'
    });
  }
});

// @route   POST /api/user/vehicles
// @desc    Add new vehicle
// @access  Private
router.post('/vehicles', verifyToken, async (req, res) => {
  try {
    const { licensePlate, make, model, color, type } = req.body;
    
    if (!licensePlate || !model || !color || !type) {
      return res.status(400).json({
        success: false,
        message: 'License plate, model, color, and type are required'
      });
    }
    
    // Check if vehicle already exists
    const existingVehicle = await Vehicle.findOne({ 
      licensePlate: licensePlate.toUpperCase() 
    });
    if (existingVehicle) {
      return res.status(400).json({
        success: false,
        message: 'Vehicle with this license plate already exists'
      });
    }
    
    // Extract make from model if not provided
    const vehicleMake = make || model.split(' ')[0] || 'Unknown';
    
    const vehicle = new Vehicle({
      licensePlate: licensePlate.toUpperCase(),
      make: vehicleMake,
      model,
      year: new Date().getFullYear(), // Default to current year
      color,
      type: type.toLowerCase(),
      owner: req.user.id,
      status: 'active',
      specifications: {
        fuelType: 'petrol' // Default fuel type
      },
      registration: {
        registrationNumber: licensePlate.toUpperCase() // Use license plate as registration number
      }
    });
    
    await vehicle.save();
    
    // Add vehicle to user's vehicles array
    await User.findByIdAndUpdate(req.user.id, {
      $push: { vehicles: vehicle._id }
    });
    
    res.status(201).json({
      success: true,
      data: vehicle,
      message: 'Vehicle added successfully'
    });
  } catch (error) {
    console.error('Error adding vehicle:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add vehicle',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @route   PUT /api/user/vehicles/:id
// @desc    Update user's vehicle
// @access  Private
router.put('/vehicles/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { licensePlate, make, model, color, type } = req.body;
    
    const vehicle = await Vehicle.findOne({
      _id: id,
      owner: req.user.id
    });
    
    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found'
      });
    }
    
    // Check if license plate is being changed and if it already exists
    if (licensePlate && licensePlate.toUpperCase() !== vehicle.licensePlate) {
      const existingVehicle = await Vehicle.findOne({ 
        licensePlate: licensePlate.toUpperCase(),
        _id: { $ne: id }
      });
      
      if (existingVehicle) {
        return res.status(400).json({
          success: false,
          message: 'Vehicle with this license plate already exists'
        });
      }
    }
    
    // Update vehicle fields
    if (licensePlate) vehicle.licensePlate = licensePlate.toUpperCase();
    if (make) vehicle.make = make;
    if (model) vehicle.model = model;
    if (color) vehicle.color = color;
    if (type) vehicle.type = type.toLowerCase();
    
    await vehicle.save();
    
    res.json({
      success: true,
      data: vehicle,
      message: 'Vehicle updated successfully'
    });
    
  } catch (error) {
    console.error('Error updating vehicle:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update vehicle',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @route   DELETE /api/user/vehicles/:id
// @desc    Delete user's vehicle
// @access  Private
router.delete('/vehicles/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const vehicle = await Vehicle.findOne({
      _id: id,
      owner: req.user.id
    });
    
    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found'
      });
    }
    
    // Remove from user's vehicles array
    await User.findByIdAndUpdate(req.user.id, {
      $pull: { vehicles: vehicle._id }
    });
    
    await Vehicle.findByIdAndDelete(id);
    
    res.json({
      success: true,
      message: 'Vehicle deleted successfully'
    });
    
  } catch (error) {
    console.error('Error deleting vehicle:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete vehicle',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @route   GET /api/user/activity
// @desc    Get user's recent activity
// @access  Private
router.get('/activity', verifyToken, async (req, res) => {
  try {
    const { limit = 5 } = req.query;
    
    // Get recent bookings as activities
    const recentBookings = await Booking.find({ user: req.user.id })
      .populate('parkingSpot', 'spotNumber location.name')
      .sort({ 'timeline.bookedAt': -1 })
      .limit(parseInt(limit));
    
    const activities = recentBookings.map(booking => {
      let description = '';
      let type = 'booking';
      
      switch (booking.status) {
        case 'completed':
          description = `Completed parking at ${booking.parkingSpot.location.name}`;
          type = 'completion';
          break;
        case 'active':
          description = `Currently parked at ${booking.parkingSpot.spotNumber}`;
          type = 'active';
          break;
        case 'cancelled':
          description = `Cancelled booking at ${booking.parkingSpot.location.name}`;
          type = 'cancellation';
          break;
        default:
          description = `Booked ${booking.parkingSpot.spotNumber} at ${booking.parkingSpot.location.name}`;
      }
      
      return {
        type,
        description,
        timestamp: booking.timeline.bookedAt,
        booking: booking._id
      };
    });
    
    res.json({
      success: true,
      data: activities
    });
  } catch (error) {
    console.error('Error fetching user activity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activity'
    });
  }
});

// @route   GET /api/user/nearby-parking
// @desc    Find nearby parking spots
// @access  Private
router.get('/nearby-parking', verifyToken, async (req, res) => {
  try {
    const { latitude, longitude, radius = 5000 } = req.query; // radius in meters
    
    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }
    
    const spots = await ParkingSpot.find({
      status: 'available',
      'location.coordinates': {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
          },
          $maxDistance: parseInt(radius)
        }
      }
    }).limit(20);
    
    res.json({
      success: true,
      data: spots
    });
  } catch (error) {
    console.error('Error finding nearby parking:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to find nearby parking'
    });
  }
});

module.exports = router;