const { validationResult } = require('express-validator');
const ParkingSpot = require('../models/ParkingSpot');
const Booking = require('../models/Booking');
const VehicleLog = require('../models/VehicleLog');

/**
 * Get all parking spots with filters
 */
const getParkingSpots = async (req, res) => {
  try {
    const {
      status,
      type,
      location,
      available,
      latitude,
      longitude,
      maxDistance,
      sortBy = 'spotNumber',
      sortOrder = 'asc',
      page = 1,
      limit = 20
    } = req.query;

    // Build query
    let query = {};
    
    if (status) query.status = status;
    if (type) query.type = type;
    if (location) {
      query.$or = [
        { 'location.name': new RegExp(location, 'i') },
        { 'location.address': new RegExp(location, 'i') }
      ];
    }
    if (available === 'true') query.status = 'available';

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    let spots;
    let total;

    if (latitude && longitude) {
      // Find nearby spots
      const maxDistanceKm = maxDistance ? parseFloat(maxDistance) : 5;
      spots = await ParkingSpot.findNearby(
        parseFloat(latitude),
        parseFloat(longitude),
        maxDistanceKm,
        query
      ).sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit))
        .populate('currentBooking', 'bookingId user timeline')
        .populate('currentVehicle', 'licensePlate make model');

      total = await ParkingSpot.findNearby(
        parseFloat(latitude),
        parseFloat(longitude),
        maxDistanceKm,
        query
      ).countDocuments();

      // Add distance to each spot
      spots = spots.map(spot => ({
        ...spot.toObject(),
        distance: spot.distanceFrom(parseFloat(latitude), parseFloat(longitude))
      }));

      // Sort by distance if requested
      if (sortBy === 'distance') {
        spots.sort((a, b) => sortOrder === 'desc' ? b.distance - a.distance : a.distance - b.distance);
      }
    } else {
      // Regular query
      spots = await ParkingSpot.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit))
        .populate('currentBooking', 'bookingId user timeline')
        .populate('currentVehicle', 'licensePlate make model');

      total = await ParkingSpot.countDocuments(query);
    }

    // Calculate summary statistics
    const summary = await ParkingSpot.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalSpots: { $sum: 1 },
          availableSpots: { $sum: { $cond: [{ $eq: ['$status', 'available'] }, 1, 0] } },
          occupiedSpots: { $sum: { $cond: [{ $eq: ['$status', 'occupied'] }, 1, 0] } },
          reservedSpots: { $sum: { $cond: [{ $eq: ['$status', 'reserved'] }, 1, 0] } },
          maintenanceSpots: { $sum: { $cond: [{ $eq: ['$status', 'maintenance'] }, 1, 0] } },
          avgOccupancyRate: { $avg: '$analytics.occupancyRate' },
          totalRevenue: { $sum: '$analytics.totalRevenue' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        spots,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        },
        summary: summary[0] || {
          totalSpots: 0,
          availableSpots: 0,
          occupiedSpots: 0,
          reservedSpots: 0,
          maintenanceSpots: 0,
          avgOccupancyRate: 0,
          totalRevenue: 0
        }
      }
    });

  } catch (error) {
    console.error('Get parking spots error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch parking spots',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get parking spot by ID
 */
const getParkingSpotById = async (req, res) => {
  try {
    const { id } = req.params;

    const spot = await ParkingSpot.findById(id)
      .populate('currentBooking')
      .populate('currentVehicle');

    if (!spot) {
      return res.status(404).json({
        success: false,
        message: 'Parking spot not found'
      });
    }

    // Get recent activity
    const recentLogs = await VehicleLog.find({
      parkingSpot: id
    })
    .sort({ timestamp: -1 })
    .limit(10)
    .populate('vehicle', 'licensePlate make model')
    .populate('user', 'name email');

    // Get occupancy analytics for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const analytics = await VehicleLog.getAnalytics(
      { 
        parkingSpot: id,
        timestamp: { $gte: thirtyDaysAgo }
      },
      'day'
    );

    res.json({
      success: true,
      data: {
        spot: spot.toObject(),
        recentActivity: recentLogs,
        analytics
      }
    });

  } catch (error) {
    console.error('Get parking spot by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch parking spot details',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Update parking spot status
 */
const updateParkingSpotStatus = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const { status, vehicleId, bookingId, reason } = req.body;

    const spot = await ParkingSpot.findById(id);
    if (!spot) {
      return res.status(404).json({
        success: false,
        message: 'Parking spot not found'
      });
    }

    // Update spot status
    if (status === 'occupied') {
      await spot.updateOccupancy(true, vehicleId, bookingId);
    } else if (status === 'available') {
      await spot.updateOccupancy(false);
    } else {
      spot.status = status;
      await spot.save();
    }

    // Create log entry for manual status change
    const log = new VehicleLog({
      parkingSpot: id,
      logType: status === 'occupied' ? 'entry' : 'exit',
      detectionMethod: 'manual',
      manualData: {
        operatorId: req.user.id,
        reason: reason || `Manual status change to ${status}`,
        notes: `Updated by ${req.user.role} user`
      },
      status: 'success',
      timestamp: new Date()
    });

    if (vehicleId) {
      log.vehicle = vehicleId;
    }

    await log.save();

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.emit('spot-status-updated', {
        spotId: id,
        status: spot.status,
        timestamp: new Date(),
        updatedBy: req.user.id
      });
    }

    res.json({
      success: true,
      message: 'Parking spot status updated successfully',
      data: {
        spot: spot.toObject(),
        log: log.toObject()
      }
    });

  } catch (error) {
    console.error('Update parking spot status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update parking spot status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Create new parking spot
 */
const createParkingSpot = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    // Check if spot number already exists
    const existingSpot = await ParkingSpot.findOne({
      spotNumber: req.body.spotNumber
    });

    if (existingSpot) {
      return res.status(409).json({
        success: false,
        message: 'Parking spot with this number already exists'
      });
    }

    const spot = new ParkingSpot(req.body);
    await spot.save();

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.to('admin-room').emit('spot-created', {
        spot: spot.toObject(),
        createdBy: req.user.id,
        timestamp: new Date()
      });
    }

    res.status(201).json({
      success: true,
      message: 'Parking spot created successfully',
      data: spot
    });

  } catch (error) {
    console.error('Create parking spot error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create parking spot',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Update parking spot details
 */
const updateParkingSpot = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const updateData = req.body;

    // Check if spot number conflicts with existing spot
    if (updateData.spotNumber) {
      const existingSpot = await ParkingSpot.findOne({
        spotNumber: updateData.spotNumber,
        _id: { $ne: id }
      });

      if (existingSpot) {
        return res.status(409).json({
          success: false,
          message: 'Another parking spot with this number already exists'
        });
      }
    }

    const spot = await ParkingSpot.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!spot) {
      return res.status(404).json({
        success: false,
        message: 'Parking spot not found'
      });
    }

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.to('admin-room').emit('spot-updated', {
        spot: spot.toObject(),
        updatedBy: req.user.id,
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      message: 'Parking spot updated successfully',
      data: spot
    });

  } catch (error) {
    console.error('Update parking spot error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update parking spot',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Delete parking spot
 */
const deleteParkingSpot = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if spot has active bookings
    const activeBookings = await Booking.find({
      parkingSpot: id,
      status: { $in: ['confirmed', 'active', 'ongoing'] }
    });

    if (activeBookings.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete parking spot with active bookings',
        data: { activeBookings: activeBookings.length }
      });
    }

    const spot = await ParkingSpot.findByIdAndDelete(id);
    if (!spot) {
      return res.status(404).json({
        success: false,
        message: 'Parking spot not found'
      });
    }

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.to('admin-room').emit('spot-deleted', {
        spotId: id,
        spotNumber: spot.spotNumber,
        deletedBy: req.user.id,
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      message: 'Parking spot deleted successfully'
    });

  } catch (error) {
    console.error('Delete parking spot error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete parking spot',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get parking analytics
 */
const getParkingAnalytics = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      spotId,
      groupBy = 'day'
    } = req.query;

    // Build date filter
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.timestamp = {};
      if (startDate) dateFilter.timestamp.$gte = new Date(startDate);
      if (endDate) dateFilter.timestamp.$lte = new Date(endDate);
    }

    // Build spot filter
    const spotFilter = spotId ? { parkingSpot: spotId } : {};

    // Combine filters
    const filters = { ...dateFilter, ...spotFilter };

    // Get analytics data
    const analytics = await VehicleLog.getAnalytics(filters, groupBy);

    // Get overall summary
    const summary = await VehicleLog.aggregate([
      { $match: filters },
      {
        $group: {
          _id: null,
          totalEntries: { $sum: { $cond: [{ $eq: ['$logType', 'entry'] }, 1, 0] } },
          totalExits: { $sum: { $cond: [{ $eq: ['$logType', 'exit'] }, 1, 0] } },
          totalRevenue: { $sum: '$payment.amount' },
          avgDuration: { $avg: '$duration' },
          suspiciousActivities: { $sum: { $cond: [{ $eq: ['$status', 'suspicious'] }, 1, 0] } }
        }
      }
    ]);

    // Get top performing spots
    const topSpots = await VehicleLog.aggregate([
      { $match: { ...filters, logType: 'entry' } },
      {
        $group: {
          _id: '$parkingSpot',
          totalBookings: { $sum: 1 },
          totalRevenue: { $sum: '$payment.amount' },
          avgDuration: { $avg: '$duration' }
        }
      },
      {
        $lookup: {
          from: 'parkingspots',
          localField: '_id',
          foreignField: '_id',
          as: 'spot'
        }
      },
      { $unwind: '$spot' },
      { $sort: { totalRevenue: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      success: true,
      data: {
        analytics,
        summary: summary[0] || {
          totalEntries: 0,
          totalExits: 0,
          totalRevenue: 0,
          avgDuration: 0,
          suspiciousActivities: 0
        },
        topSpots
      }
    });

  } catch (error) {
    console.error('Get parking analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch parking analytics',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

module.exports = {
  getParkingSpots,
  getParkingSpotById,
  updateParkingSpotStatus,
  createParkingSpot,
  updateParkingSpot,
  deleteParkingSpot,
  getParkingAnalytics
};