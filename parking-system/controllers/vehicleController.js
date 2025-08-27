const { validationResult } = require('express-validator');
const Vehicle = require('../models/Vehicle');
const VehicleLog = require('../models/VehicleLog');
const ParkingSpot = require('../models/ParkingSpot');
const Booking = require('../models/Booking');
const User = require('../models/User');
const { processLPR } = require('../services/lprService');
const qrService = require('../services/qrService');

/**
 * Register Vehicle
 */
const registerVehicle = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { licensePlate, make, model, year, color, type, rfidTag, fuelType } = req.body;
    const userId = req.user.id;

    // Check if vehicle with this license plate already exists
    const existingVehicle = await Vehicle.findOne({ 
      licensePlate: licensePlate.toUpperCase() 
    });

    if (existingVehicle) {
      return res.status(409).json({
        success: false,
        message: 'Vehicle with this license plate already exists'
      });
    }

    // Check if RFID tag is already in use
    if (rfidTag) {
      const existingRFID = await Vehicle.findOne({ 'tags.rfid.tagId': rfidTag });
      if (existingRFID) {
        return res.status(409).json({
          success: false,
          message: 'RFID tag is already in use'
        });
      }
    }

    // Create new vehicle
    const vehicle = new Vehicle({
      licensePlate: licensePlate.toUpperCase(),
      make,
      model,
      year,
      color,
      type: type || 'car',
      owner: userId,
      status: 'active',
      specifications: {
        fuelType: fuelType || 'petrol'
      },
      registration: {
        registrationNumber: licensePlate.toUpperCase() // Use license plate as registration number for simplicity
      },
      tags: rfidTag ? {
        rfid: {
          tagId: rfidTag,
          status: 'active',
          assignedDate: new Date()
        }
      } : undefined
    });

    await vehicle.save();

    // Add vehicle to user's vehicles array
    await User.findByIdAndUpdate(userId, {
      $push: { vehicles: vehicle._id }
    });

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.to('admin-room').emit('vehicle-registered', {
        vehicle: vehicle.toObject(),
        owner: req.user.name,
        timestamp: new Date()
      });
    }

    res.status(201).json({
      success: true,
      message: 'Vehicle registered successfully',
      data: vehicle.toObject()
    });

  } catch (error) {
    console.error('Register vehicle error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register vehicle',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Vehicle Entry Log
 */
const logVehicleEntry = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      licensePlate,
      spotId,
      detectionMethod,
      cameraId,
      imageUrl,
      rfidTagId,
      bookingId,
      operatorId,
      confidence,
      alternateReadings
    } = req.body;

    // Find or create vehicle
    let vehicle = await Vehicle.findByLicensePlate(licensePlate, 0.8);
    
    if (!vehicle && detectionMethod === 'lpr') {
      // Create temporary vehicle record for LPR detection
      vehicle = new Vehicle({
        licensePlate: licensePlate.toUpperCase(),
        make: 'Unknown',
        model: 'Unknown',
        year: new Date().getFullYear(),
        color: 'Unknown',
        type: 'car',
        owner: null, // Will be linked later
        status: 'under_verification',
        lprData: {
          confidence: confidence || 0,
          lastDetection: new Date(),
          detectionCount: 1,
          alternateReadings: alternateReadings || []
        }
      });
      await vehicle.save();
    }

    // Find parking spot
    const parkingSpot = await ParkingSpot.findById(spotId);
    if (!parkingSpot) {
      return res.status(404).json({
        success: false,
        message: 'Parking spot not found'
      });
    }

    // Check if spot is available
    if (parkingSpot.status !== 'available' && parkingSpot.status !== 'reserved') {
      return res.status(400).json({
        success: false,
        message: `Parking spot is currently ${parkingSpot.status}`
      });
    }

    // Find booking if provided
    let booking = null;
    if (bookingId) {
      booking = await Booking.findById(bookingId);
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
      }

      // Validate booking
      if (booking.parkingSpot.toString() !== spotId) {
        return res.status(400).json({
          success: false,
          message: 'Booking is not for this parking spot'
        });
      }

      if (booking.status !== 'confirmed' && booking.status !== 'active') {
        return res.status(400).json({
          success: false,
          message: 'Booking is not valid for entry'
        });
      }
    }

    // Create vehicle log
    const logData = {
      vehicle: vehicle ? vehicle._id : null,
      user: booking ? booking.user : null,
      parkingSpot: spotId,
      booking: bookingId,
      logType: 'entry',
      detectionMethod,
      timestamp: new Date(),
      vehicleDetails: {
        licensePlate: licensePlate.toUpperCase(),
        make: vehicle ? vehicle.make : 'Unknown',
        model: vehicle ? vehicle.model : 'Unknown',
        color: vehicle ? vehicle.color : 'Unknown',
        type: vehicle ? vehicle.type : 'car'
      },
      status: 'success'
    };

    // Add detection method specific data
    switch (detectionMethod) {
      case 'lpr':
        logData.lprData = {
          licensePlate: {
            detected: licensePlate.toUpperCase(),
            confidence: confidence || 0
          },
          imageUrl,
          cameraId,
          alternateReadings: alternateReadings || []
        };
        break;
      
      case 'rfid':
        logData.rfidData = {
          tagId: rfidTagId,
          readerId: cameraId // Reusing field for reader ID
        };
        break;
      
      case 'manual':
        logData.manualData = {
          operatorId,
          reason: 'Manual entry',
          notes: 'Manually logged by operator'
        };
        break;
    }

    const vehicleLog = new VehicleLog(logData);
    await vehicleLog.save();

    // Update parking spot status
    await parkingSpot.updateOccupancy(true, vehicle ? vehicle._id : null, bookingId);

    // Update booking status if exists
    if (booking) {
      booking.status = 'ongoing';
      booking.timeline.actualStartTime = new Date();
      await booking.save();
    }

    // Update vehicle LPR data
    if (vehicle && detectionMethod === 'lpr') {
      vehicle.lprData.lastDetection = new Date();
      vehicle.lprData.detectionCount += 1;
      vehicle.lprData.confidence = Math.max(vehicle.lprData.confidence, confidence || 0);
      await vehicle.save();
    }

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.emit('vehicle-entry', {
        vehicleLog: vehicleLog.toObject(),
        parkingSpot: parkingSpot.toObject(),
        timestamp: new Date()
      });

      // Notify admin
      io.to('admin-room').emit('new-entry-log', {
        log: vehicleLog.toObject(),
        spot: parkingSpot.toObject()
      });
    }

    res.status(201).json({
      success: true,
      message: 'Vehicle entry logged successfully',
      data: {
        log: vehicleLog.toObject(),
        spot: parkingSpot.toObject(),
        vehicle: vehicle ? vehicle.toObject() : null,
        booking: booking ? booking.toObject() : null
      }
    });

  } catch (error) {
    console.error('Log vehicle entry error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to log vehicle entry',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Vehicle Exit Log
 */
const logVehicleExit = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      licensePlate,
      spotId,
      detectionMethod,
      cameraId,
      imageUrl,
      rfidTagId,
      operatorId,
      paymentAmount,
      paymentMethod,
      transactionId
    } = req.body;

    // Find vehicle
    const vehicle = await Vehicle.findByLicensePlate(licensePlate, 0.8);
    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found'
      });
    }

    // Find parking spot
    const parkingSpot = await ParkingSpot.findById(spotId);
    if (!parkingSpot) {
      return res.status(404).json({
        success: false,
        message: 'Parking spot not found'
      });
    }

    // Check if vehicle is currently at this spot
    if (parkingSpot.currentVehicle?.toString() !== vehicle._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Vehicle is not currently parked at this spot'
      });
    }

    // Find entry log
    const entryLog = await VehicleLog.findOne({
      vehicle: vehicle._id,
      parkingSpot: spotId,
      logType: 'entry',
      relatedLogs: { $size: 0 } // Not yet linked to exit log
    }).sort({ timestamp: -1 });

    if (!entryLog) {
      return res.status(400).json({
        success: false,
        message: 'No entry log found for this vehicle at this spot'
      });
    }

    // Calculate duration and charges
    const entryTime = entryLog.timestamp;
    const exitTime = new Date();
    const duration = Math.round((exitTime - entryTime) / (1000 * 60)); // in minutes
    
    let calculatedAmount = 0;
    if (!paymentAmount) {
      // Calculate amount based on parking spot rates and duration
      const hours = Math.ceil(duration / 60);
      calculatedAmount = parkingSpot.pricing.hourlyRate * hours;
    }

    const finalAmount = paymentAmount || calculatedAmount;

    // Create exit log
    const logData = {
      vehicle: vehicle._id,
      user: entryLog.user,
      parkingSpot: spotId,
      booking: entryLog.booking,
      logType: 'exit',
      detectionMethod,
      timestamp: exitTime,
      duration,
      vehicleDetails: {
        licensePlate: licensePlate.toUpperCase(),
        make: vehicle.make,
        model: vehicle.model,
        color: vehicle.color,
        type: vehicle.type
      },
      payment: {
        amount: finalAmount,
        method: paymentMethod || 'cash',
        transactionId,
        status: 'completed'
      },
      relatedLogs: [entryLog._id],
      status: 'success'
    };

    // Add detection method specific data
    switch (detectionMethod) {
      case 'lpr':
        logData.lprData = {
          licensePlate: {
            detected: licensePlate.toUpperCase(),
            confidence: 0.9
          },
          imageUrl,
          cameraId
        };
        break;
      
      case 'rfid':
        logData.rfidData = {
          tagId: rfidTagId,
          readerId: cameraId
        };
        break;
      
      case 'manual':
        logData.manualData = {
          operatorId,
          reason: 'Manual exit',
          notes: 'Manually logged by operator'
        };
        break;
    }

    const vehicleLog = new VehicleLog(logData);
    await vehicleLog.save();

    // Update entry log with duration and link
    entryLog.duration = duration;
    entryLog.relatedLogs.push(vehicleLog._id);
    entryLog.payment = logData.payment;
    await entryLog.save();

    // Update parking spot status
    await parkingSpot.updateOccupancy(false);

    // Update booking if exists
    if (entryLog.booking) {
      const booking = await Booking.findById(entryLog.booking);
      if (booking) {
        booking.status = 'completed';
        booking.timeline.actualEndTime = exitTime;
        await booking.save();
      }
    }

    // Update vehicle parking history and analytics
    if (entryLog.booking) {
      await vehicle.addParkingHistory(
        spotId,
        entryTime,
        exitTime,
        finalAmount,
        entryLog.booking
      );
    }

    // Update parking spot analytics
    parkingSpot.analytics.totalBookings += 1;
    parkingSpot.analytics.totalRevenue += finalAmount;
    parkingSpot.analytics.averageOccupancyTime = 
      ((parkingSpot.analytics.averageOccupancyTime * (parkingSpot.analytics.totalBookings - 1)) + duration) 
      / parkingSpot.analytics.totalBookings;
    await parkingSpot.save();

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.emit('vehicle-exit', {
        vehicleLog: vehicleLog.toObject(),
        parkingSpot: parkingSpot.toObject(),
        duration,
        amount: finalAmount,
        timestamp: exitTime
      });

      // Notify admin
      io.to('admin-room').emit('new-exit-log', {
        log: vehicleLog.toObject(),
        spot: parkingSpot.toObject(),
        revenue: finalAmount
      });
    }

    res.status(201).json({
      success: true,
      message: 'Vehicle exit logged successfully',
      data: {
        log: vehicleLog.toObject(),
        entryLog: entryLog.toObject(),
        spot: parkingSpot.toObject(),
        vehicle: vehicle.toObject(),
        session: {
          duration,
          amount: finalAmount,
          entryTime,
          exitTime
        }
      }
    });

  } catch (error) {
    console.error('Log vehicle exit error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to log vehicle exit',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get vehicle logs with filters
 */
const getVehicleLogs = async (req, res) => {
  try {
    const {
      vehicleId,
      spotId,
      userId,
      logType,
      status,
      detectionMethod,
      startDate,
      endDate,
      sortBy = 'timestamp',
      sortOrder = 'desc',
      page = 1,
      limit = 20
    } = req.query;

    // Build query
    let query = {};
    
    if (vehicleId) query.vehicle = vehicleId;
    if (spotId) query.parkingSpot = spotId;
    if (userId) query.user = userId;
    if (logType) query.logType = logType;
    if (status) query.status = status;
    if (detectionMethod) query.detectionMethod = detectionMethod;

    // Date range filter
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const logs = await VehicleLog.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('vehicle', 'licensePlate make model color type')
      .populate('user', 'name email phone')
      .populate('parkingSpot', 'spotNumber location.name location.address')
      .populate('booking', 'bookingId timeline.startTime timeline.endTime')
      .populate('manualData.operatorId', 'name email');

    const total = await VehicleLog.countDocuments(query);

    // Get summary statistics
    const summary = await VehicleLog.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalLogs: { $sum: 1 },
          totalEntries: { $sum: { $cond: [{ $eq: ['$logType', 'entry'] }, 1, 0] } },
          totalExits: { $sum: { $cond: [{ $eq: ['$logType', 'exit'] }, 1, 0] } },
          totalRevenue: { $sum: '$payment.amount' },
          avgDuration: { $avg: '$duration' },
          suspiciousCount: { $sum: { $cond: [{ $eq: ['$status', 'suspicious'] }, 1, 0] } }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        },
        summary: summary[0] || {
          totalLogs: 0,
          totalEntries: 0,
          totalExits: 0,
          totalRevenue: 0,
          avgDuration: 0,
          suspiciousCount: 0
        }
      }
    });

  } catch (error) {
    console.error('Get vehicle logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vehicle logs',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get vehicle log by ID
 */
const getVehicleLogById = async (req, res) => {
  try {
    const { id } = req.params;

    const log = await VehicleLog.findById(id)
      .populate('vehicle')
      .populate('user', 'name email phone')
      .populate('parkingSpot')
      .populate('booking')
      .populate('manualData.operatorId', 'name email')
      .populate('relatedLogs');

    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle log not found'
      });
    }

    res.json({
      success: true,
      data: log
    });

  } catch (error) {
    console.error('Get vehicle log by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vehicle log details',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Mark log as suspicious
 */
const markLogSuspicious = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, severity } = req.body;

    const log = await VehicleLog.findById(id);
    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle log not found'
      });
    }

    await log.markSuspicious(reason, severity);

    // Emit real-time alert
    const io = req.app.get('io');
    if (io) {
      io.to('admin-room').emit('suspicious-activity', {
        logId: id,
        reason,
        severity,
        timestamp: new Date(),
        flaggedBy: req.user.id
      });
    }

    res.json({
      success: true,
      message: 'Log marked as suspicious',
      data: log.toObject()
    });

  } catch (error) {
    console.error('Mark log suspicious error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark log as suspicious',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Process LPR Detection
 */
const processLPRDetection = async (req, res) => {
  try {
    const { imageUrl, cameraId, spotId } = req.body;

    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        message: 'Image URL is required'
      });
    }

    // Process image with LPR service
    const lprResult = await processLPR(imageUrl);
    
    if (!lprResult.success) {
      return res.status(400).json({
        success: false,
        message: 'License plate detection failed',
        error: lprResult.error
      });
    }

    const { licensePlate, confidence, alternateReadings } = lprResult.data;

    // Return LPR result for manual processing
    // Note: Auto-entry disabled to prevent circular function calls

    res.json({
      success: true,
      message: 'LPR processing completed',
      data: lprResult.data
    });

  } catch (error) {
    console.error('Process LPR detection error:', error);
    res.status(500).json({
      success: false,
      message: 'LPR processing failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get vehicle analytics
 */
const getVehicleAnalytics = async (req, res) => {
  try {
    const {
      vehicleId,
      startDate,
      endDate,
      groupBy = 'day'
    } = req.query;

    // Build filters
    const filters = {};
    if (vehicleId) filters.vehicle = vehicleId;
    if (startDate || endDate) {
      filters.timestamp = {};
      if (startDate) filters.timestamp.$gte = new Date(startDate);
      if (endDate) filters.timestamp.$lte = new Date(endDate);
    }

    // Get analytics
    const analytics = await VehicleLog.getAnalytics(filters, groupBy);

    // Get anomalies
    const anomalies = await VehicleLog.detectAnomalies(24);

    // Get detection method distribution
    const detectionMethods = await VehicleLog.aggregate([
      { $match: filters },
      {
        $group: {
          _id: '$detectionMethod',
          count: { $sum: 1 },
          avgConfidence: { $avg: '$lprData.licensePlate.confidence' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      data: {
        analytics,
        anomalies,
        detectionMethods
      }
    });

  } catch (error) {
    console.error('Get vehicle analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vehicle analytics',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

module.exports = {
  registerVehicle,
  logVehicleEntry,
  logVehicleExit,
  getVehicleLogs,
  getVehicleLogById,
  markLogSuspicious,
  processLPRDetection,
  getVehicleAnalytics
};