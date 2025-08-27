const mongoose = require('mongoose');

const parkingSpotSchema = new mongoose.Schema({
  spotNumber: {
    type: String,
    required: [true, 'Spot number is required'],
    unique: true,
    trim: true
  },
  location: {
    name: {
      type: String,
      required: [true, 'Location name is required']
    },
    address: {
      type: String,
      required: [true, 'Address is required']
    },
    coordinates: {
      latitude: {
        type: Number,
        required: true
      },
      longitude: {
        type: Number,
        required: true
      }
    },
    floor: {
      type: String,
      default: 'Ground'
    },
    section: {
      type: String,
      default: 'A'
    }
  },
  type: {
    type: String,
    enum: ['regular', 'disabled', 'electric', 'vip', 'motorcycle'],
    default: 'regular'
  },
  status: {
    type: String,
    enum: ['available', 'occupied', 'reserved', 'maintenance', 'out_of_service'],
    default: 'available'
  },
  dimensions: {
    length: {
      type: Number,
      required: true,
      min: [2, 'Length must be at least 2 meters']
    },
    width: {
      type: Number,
      required: true,
      min: [2, 'Width must be at least 2 meters']
    },
    height: {
      type: Number,
      default: 2.5
    }
  },
  pricing: {
    hourlyRate: {
      type: Number,
      required: [true, 'Hourly rate is required'],
      min: [0, 'Rate cannot be negative']
    },
    dailyRate: {
      type: Number,
      min: [0, 'Daily rate cannot be negative']
    },
    monthlyRate: {
      type: Number,
      min: [0, 'Monthly rate cannot be negative']
    }
  },
  features: {
    covered: {
      type: Boolean,
      default: false
    },
    secured: {
      type: Boolean,
      default: true
    },
    cctv: {
      type: Boolean,
      default: false
    },
    evCharging: {
      type: Boolean,
      default: false
    },
    carWash: {
      type: Boolean,
      default: false
    }
  },
  sensors: {
    occupancySensor: {
      id: String,
      status: {
        type: String,
        enum: ['active', 'inactive', 'faulty'],
        default: 'active'
      },
      lastReading: Date
    },
    cameras: [{
      id: String,
      type: {
        type: String,
        enum: ['entry', 'exit', 'monitoring']
      },
      status: {
        type: String,
        enum: ['active', 'inactive', 'faulty'],
        default: 'active'
      }
    }]
  },
  currentBooking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    default: null
  },
  currentVehicle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    default: null
  },
  maintenance: {
    lastMaintenance: Date,
    nextMaintenance: Date,
    maintenanceHistory: [{
      date: Date,
      type: String,
      description: String,
      technician: String,
      cost: Number
    }]
  },
  analytics: {
    totalBookings: {
      type: Number,
      default: 0
    },
    totalRevenue: {
      type: Number,
      default: 0
    },
    averageOccupancyTime: {
      type: Number,
      default: 0
    },
    lastOccupied: Date,
    occupancyRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
parkingSpotSchema.index({ spotNumber: 1 });
parkingSpotSchema.index({ status: 1 });
parkingSpotSchema.index({ type: 1, status: 1 });
parkingSpotSchema.index({ 'location.coordinates.latitude': 1, 'location.coordinates.longitude': 1 });

// Virtual for availability
parkingSpotSchema.virtual('isAvailable').get(function() {
  return this.status === 'available';
});

// Virtual for current rate based on time
parkingSpotSchema.virtual('currentRate').get(function() {
  const now = new Date();
  const hour = now.getHours();
  
  // Peak hours (7-9 AM, 5-7 PM) have 50% higher rates
  const isPeakHour = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19);
  const baseRate = this.pricing.hourlyRate;
  
  return isPeakHour ? baseRate * 1.5 : baseRate;
});

// Method to update occupancy status
parkingSpotSchema.methods.updateOccupancy = function(occupied, vehicleId = null, bookingId = null) {
  if (occupied) {
    this.status = 'occupied';
    this.currentVehicle = vehicleId;
    this.currentBooking = bookingId;
    this.analytics.lastOccupied = new Date();
  } else {
    this.status = 'available';
    this.currentVehicle = null;
    this.currentBooking = null;
  }
  
  return this.save();
};

// Method to calculate distance from coordinates
parkingSpotSchema.methods.distanceFrom = function(latitude, longitude) {
  const R = 6371; // Radius of the Earth in km
  const dLat = (latitude - this.location.coordinates.latitude) * Math.PI / 180;
  const dLon = (longitude - this.location.coordinates.longitude) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(this.location.coordinates.latitude * Math.PI / 180) * Math.cos(latitude * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c; // Distance in km
  
  return distance;
};

// Static method to find nearby spots
parkingSpotSchema.statics.findNearby = function(latitude, longitude, maxDistance = 5, filters = {}) {
  const query = {
    'location.coordinates.latitude': {
      $gte: latitude - (maxDistance / 111), // Rough conversion: 1 degree = 111 km
      $lte: latitude + (maxDistance / 111)
    },
    'location.coordinates.longitude': {
      $gte: longitude - (maxDistance / (111 * Math.cos(latitude * Math.PI / 180))),
      $lte: longitude + (maxDistance / (111 * Math.cos(latitude * Math.PI / 180)))
    },
    ...filters
  };
  
  return this.find(query);
};

module.exports = mongoose.model('ParkingSpot', parkingSpotSchema);