const express = require('express');
const router = express.Router();
const parkingController = require('../controllers/parkingController');
const authController = require('../controllers/authController');
const vehicleController = require('../controllers/vehicleController');
const { verifyToken, requireAdmin } = require('../middlewares/auth');

// Admin authentication
router.post('/login', authController.adminLogin);
router.post('/logout', verifyToken, authController.logout);
router.post('/refresh-token', authController.refreshToken);

// Dashboard stats
router.get('/stats', verifyToken, requireAdmin, async (req, res) => {
  try {
    const ParkingSpot = require('../models/ParkingSpot');
    const User = require('../models/User');
    const Booking = require('../models/Booking');
    
    // Get parking statistics
    const totalSpots = await ParkingSpot.countDocuments();
    const occupiedSpots = await ParkingSpot.countDocuments({ status: 'occupied' });
    const availableSpots = await ParkingSpot.countDocuments({ status: 'available' });
    const reservedSpots = await ParkingSpot.countDocuments({ status: 'reserved' });
    
    // Get user statistics
    const totalUsers = await User.countDocuments({ role: 'user' });
    const activeUsers = await User.countDocuments({ 
      role: 'user', 
      lastLogin: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });
    
    // Get today's revenue
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    const todayBookings = await Booking.find({
      'timeline.bookedAt': { $gte: today, $lt: tomorrow },
      'payment.status': 'paid'
    });
    
    const todayRevenue = todayBookings.reduce((sum, booking) => {
      return sum + (booking.payment.paidAmount || 0);
    }, 0);
    
    res.json({
      success: true,
      data: {
        totalSpots,
        occupiedSpots,
        availableSpots,
        reservedSpots,
        totalUsers,
        activeUsers,
        todayRevenue,
        occupancyRate: totalSpots > 0 ? Math.round((occupiedSpots / totalSpots) * 100) : 0
      }
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics'
    });
  }
});

// Parking spots management
router.get('/parking-spots', verifyToken, requireAdmin, parkingController.getParkingSpots);
router.post('/parking-spots', verifyToken, requireAdmin, parkingController.createParkingSpot);
router.put('/parking-spots/:id', verifyToken, requireAdmin, parkingController.updateParkingSpot);
router.delete('/parking-spots/:id', verifyToken, requireAdmin, parkingController.deleteParkingSpot);
router.put('/parking-spots/:id/status', verifyToken, requireAdmin, parkingController.updateParkingSpotStatus);

// Bookings management
router.get('/bookings', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { date, status, limit = 50, page = 1 } = req.query;
    const query = {};
    
    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 1);
      query['timeline.bookedAt'] = { $gte: startDate, $lt: endDate };
    }
    
    if (status) {
      query.status = status;
    }
    
    const skip = (page - 1) * limit;
    
    const bookings = await Booking.find(query)
      .populate('user', 'name email phone')
      .populate('vehicle', 'licensePlate make model')
      .populate('parkingSpot', 'spotNumber location.name')
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

// Users management
router.get('/users', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { role, status, limit = 50, page = 1 } = req.query;
    const query = {};
    
    if (role) query.role = role;
    if (status) query.status = status;
    
    const skip = (page - 1) * limit;
    
    const users = await User.find(query, '-password')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);
    
    const total = await User.countDocuments(query);
    
    res.json({
      success: true,
      users: users, // Changed from 'data' to 'users' to match frontend expectation
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
});

router.post('/users', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { name, email, phone, role, password, status } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required'
      });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { phone }] 
    });
    
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User with this email or phone already exists'
      });
    }
    
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 12);
    
    const user = new User({
      name,
      email,
      phone: phone || '0000000000',
      role: role || 'user',
      password: hashedPassword,
      status: status || 'active',
      vehicles: []
    });
    
    await user.save();
    
    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;
    
    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: userResponse
    });
    
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create user',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

router.put('/users/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, role, status } = req.body;
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Check if email/phone is being changed and if it already exists
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ 
        email,
        _id: { $ne: id }
      });
      
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'User with this email already exists'
        });
      }
    }
    
    // Update user fields
    if (name) user.name = name;
    if (email) user.email = email;
    if (phone) user.phone = phone;
    if (role) user.role = role;
    if (status) user.status = status;
    
    await user.save();
    
    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;
    
    res.json({
      success: true,
      message: 'User updated successfully',
      user: userResponse
    });
    
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

router.delete('/users/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Don't allow deleting admin users
    if (user.role === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete admin users'
      });
    }
    
    // Remove user's vehicles
    const Vehicle = require('../models/Vehicle');
    await Vehicle.updateMany(
      { owner: id },
      { $unset: { owner: 1 } }
    );
    
    await User.findByIdAndDelete(id);
    
    res.json({
      success: true,
      message: 'User deleted successfully'
    });
    
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Vehicle logs
router.get('/vehicle-logs', verifyToken, requireAdmin, vehicleController.getVehicleLogs);

// Vehicles management
router.get('/vehicles', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { limit = 50, page = 1, status, type } = req.query;
    const query = {};
    
    if (status) query.status = status;
    if (type) query.type = type;
    
    const skip = (page - 1) * limit;
    
    const Vehicle = require('../models/Vehicle');
    const vehicles = await Vehicle.find(query)
      .populate('owner', 'name email phone')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);
    
    const total = await Vehicle.countDocuments(query);
    
    res.json({
      success: true,
      vehicles: vehicles,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching vehicles:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vehicles'
    });
  }
});

router.post('/vehicles', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { licensePlate, make, model, color, type, ownerId } = req.body;
    
    if (!licensePlate || !make || !model || !color || !type) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    const Vehicle = require('../models/Vehicle');
    const User = require('../models/User');
    
    // Check if vehicle already exists
    const existingVehicle = await Vehicle.findOne({ 
      licensePlate: licensePlate.toUpperCase() 
    });
    
    if (existingVehicle) {
      return res.status(409).json({
        success: false,
        message: 'Vehicle with this license plate already exists'
      });
    }
    
    // Verify owner exists
    let owner = null;
    if (ownerId) {
      owner = await User.findById(ownerId);
      if (!owner) {
        return res.status(404).json({
          success: false,
          message: 'Owner not found'
        });
      }
    }
    
    // Create vehicle
    const vehicle = new Vehicle({
      licensePlate: licensePlate.toUpperCase(),
      make,
      model,
      year: new Date().getFullYear(),
      color,
      type: type.toLowerCase(),
      owner: ownerId || null,
      status: 'active'
    });
    
    await vehicle.save();
    
    // Add vehicle to user's vehicles array if owner exists
    if (owner) {
      await User.findByIdAndUpdate(ownerId, {
        $push: { vehicles: vehicle._id }
      });
    }
    
    // Populate owner for response
    await vehicle.populate('owner', 'name email phone');
    
    res.status(201).json({
      success: true,
      message: 'Vehicle added successfully',
      vehicle: vehicle
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

router.put('/vehicles/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { licensePlate, make, model, color, type, ownerId, status } = req.body;
    
    const Vehicle = require('../models/Vehicle');
    const User = require('../models/User');
    
    const vehicle = await Vehicle.findById(id);
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
        return res.status(409).json({
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
    if (status) vehicle.status = status;
    
    // Handle owner change
    if (ownerId !== undefined) {
      const oldOwnerId = vehicle.owner;
      
      // Remove from old owner's vehicles array
      if (oldOwnerId) {
        await User.findByIdAndUpdate(oldOwnerId, {
          $pull: { vehicles: vehicle._id }
        });
      }
      
      // Add to new owner's vehicles array
      if (ownerId) {
        const newOwner = await User.findById(ownerId);
        if (!newOwner) {
          return res.status(404).json({
            success: false,
            message: 'New owner not found'
          });
        }
        
        await User.findByIdAndUpdate(ownerId, {
          $push: { vehicles: vehicle._id }
        });
      }
      
      vehicle.owner = ownerId || null;
    }
    
    await vehicle.save();
    await vehicle.populate('owner', 'name email phone');
    
    res.json({
      success: true,
      message: 'Vehicle updated successfully',
      vehicle: vehicle
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

router.delete('/vehicles/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const Vehicle = require('../models/Vehicle');
    const User = require('../models/User');
    
    const vehicle = await Vehicle.findById(id);
    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found'
      });
    }
    
    // Remove from owner's vehicles array
    if (vehicle.owner) {
      await User.findByIdAndUpdate(vehicle.owner, {
        $pull: { vehicles: vehicle._id }
      });
    }
    
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

// Recent activity
router.get('/activity', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    // This is a simplified implementation
    // In a real system, you'd have a dedicated Activity/Log model
    const VehicleLog = require('../models/VehicleLog');
    
    const activities = await VehicleLog.find()
      .populate('user', 'name')
      .populate('vehicle', 'licensePlate')
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));
    
    const formattedActivities = activities.map(log => ({
      type: log.type,
      description: `Vehicle ${log.vehicle.licensePlate} ${log.type === 'entry' ? 'entered' : 'exited'}`,
      timestamp: log.timestamp,
      user: log.user
    }));
    
    res.json({
      success: true,
      data: formattedActivities
    });
  } catch (error) {
    console.error('Error fetching activity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activity'
    });
  }
});

// Search functionality
router.get('/search', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.json({
        success: true,
        data: {
          users: [],
          vehicles: [],
          spots: []
        }
      });
    }
    
    const searchRegex = new RegExp(q, 'i');
    
    // Search users
    const users = await User.find({
      $or: [
        { name: searchRegex },
        { email: searchRegex },
        { phone: searchRegex }
      ]
    }, '-password').limit(5);
    
    // Search vehicles
    const Vehicle = require('../models/Vehicle');
    const vehicles = await Vehicle.find({
      $or: [
        { licensePlate: searchRegex },
        { make: searchRegex },
        { model: searchRegex }
      ]
    }).populate('owner', 'name email').limit(5);
    
    // Search parking spots
    const ParkingSpot = require('../models/ParkingSpot');
    const spots = await ParkingSpot.find({
      $or: [
        { spotNumber: searchRegex },
        { 'location.name': searchRegex },
        { 'location.address': searchRegex }
      ]
    }).limit(5);
    
    res.json({
      success: true,
      data: {
        users,
        vehicles,
        spots
      }
    });
  } catch (error) {
    console.error('Error in search:', error);
    res.status(500).json({
      success: false,
      message: 'Search failed'
    });
  }
});

module.exports = router;