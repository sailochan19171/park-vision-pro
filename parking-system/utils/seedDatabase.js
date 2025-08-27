/**
 * Database Seeding Script
 * Run with: node utils/seedDatabase.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Import models
const User = require('../models/User');
const ParkingSpot = require('../models/ParkingSpot');
const Vehicle = require('../models/Vehicle');
const Booking = require('../models/Booking');

const seedDatabase = async () => {
  try {
    console.log('🚀 Starting database seeding...');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // Clear existing data
    const clearData = process.argv.includes('--clear');
    if (clearData) {
      console.log('🗑️ Clearing existing data...');
      await User.deleteMany({});
      await ParkingSpot.deleteMany({});
      await Vehicle.deleteMany({});
      await Booking.deleteMany({});
      console.log('✅ Existing data cleared');
    }

    // Create Super Admin
    const existingSuperAdmin = await User.findOne({ role: 'super_admin' });
    if (!existingSuperAdmin) {
      console.log('👤 Creating super admin...');
      const superAdmin = new User({
        name: 'Super Admin',
        email: 'admin@vayaccess.com',
        password: 'Admin@123',
        phone: '+919999999999',
        role: 'super_admin',
        status: 'active'
      });
      await superAdmin.save();
      console.log('✅ Super admin created');
    }

    // Create Admin Users
    const adminUsers = [
      {
        name: 'John Manager',
        email: 'john.manager@vayaccess.com',
        password: 'Manager@123',
        phone: '+919876543210',
        role: 'admin'
      },
      {
        name: 'Sarah Admin',
        email: 'sarah.admin@vayaccess.com',
        password: 'Admin@123',
        phone: '+919876543211',
        role: 'admin'
      }
    ];

    for (const adminData of adminUsers) {
      const existingAdmin = await User.findOne({ email: adminData.email });
      if (!existingAdmin) {
        const admin = new User(adminData);
        await admin.save();
        console.log(`✅ Admin user created: ${adminData.email}`);
      }
    }

    // Create Regular Users
    const regularUsers = [
      {
        name: 'Alice Johnson',
        email: 'alice@example.com',
        password: 'User@123',
        phone: '+919123456789',
        profile: {
          address: '123 Main St',
          city: 'Bangalore',
          state: 'Karnataka',
          pincode: '560001'
        }
      },
      {
        name: 'Bob Smith',
        email: 'bob@example.com',
        password: 'User@123',
        phone: '+919123456790',
        profile: {
          address: '456 Park Ave',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001'
        }
      },
      {
        name: 'Carol Wilson',
        email: 'carol@example.com',
        password: 'User@123',
        phone: '+919123456791',
        profile: {
          address: '789 Tech Lane',
          city: 'Hyderabad',
          state: 'Telangana',
          pincode: '500001'
        }
      }
    ];

    const createdUsers = [];
    for (const userData of regularUsers) {
      const existingUser = await User.findOne({ email: userData.email });
      if (!existingUser) {
        const user = new User(userData);
        await user.save();
        createdUsers.push(user);
        console.log(`✅ User created: ${userData.email}`);
      } else {
        createdUsers.push(existingUser);
      }
    }

    // Create Parking Spots
    const parkingSpots = [
      // Bangalore locations
      {
        spotNumber: 'BLR-001',
        location: {
          name: 'Forum Mall',
          address: 'Koramangala, Bangalore',
          coordinates: { latitude: 12.9352, longitude: 77.6245 },
          floor: 'B1',
          section: 'A'
        },
        type: 'regular',
        dimensions: { length: 5, width: 2.5, height: 2.5 },
        pricing: { hourlyRate: 20, dailyRate: 150, monthlyRate: 3000 },
        features: { covered: true, secured: true, cctv: true }
      },
      {
        spotNumber: 'BLR-002',
        location: {
          name: 'Forum Mall',
          address: 'Koramangala, Bangalore',
          coordinates: { latitude: 12.9352, longitude: 77.6245 },
          floor: 'B1',
          section: 'A'
        },
        type: 'disabled',
        dimensions: { length: 6, width: 3.5, height: 2.5 },
        pricing: { hourlyRate: 15, dailyRate: 100, monthlyRate: 2000 },
        features: { covered: true, secured: true, cctv: true }
      },
      {
        spotNumber: 'BLR-003',
        location: {
          name: 'UB City Mall',
          address: 'Vittal Mallya Road, Bangalore',
          coordinates: { latitude: 12.9716, longitude: 77.5946 },
          floor: 'Ground',
          section: 'B'
        },
        type: 'electric',
        dimensions: { length: 5, width: 2.5, height: 2.5 },
        pricing: { hourlyRate: 30, dailyRate: 200, monthlyRate: 4000 },
        features: { covered: false, secured: true, cctv: true, evCharging: true }
      },
      
      // Mumbai locations
      {
        spotNumber: 'MUM-001',
        location: {
          name: 'Phoenix Mills',
          address: 'Lower Parel, Mumbai',
          coordinates: { latitude: 19.0136, longitude: 72.8251 },
          floor: 'P1',
          section: 'C'
        },
        type: 'regular',
        dimensions: { length: 4.5, width: 2.3, height: 2.2 },
        pricing: { hourlyRate: 40, dailyRate: 300, monthlyRate: 6000 },
        features: { covered: true, secured: true, cctv: true }
      },
      {
        spotNumber: 'MUM-002',
        location: {
          name: 'Palladium Mall',
          address: 'High Street Phoenix, Mumbai',
          coordinates: { latitude: 19.0896, longitude: 72.8656 },
          floor: 'B2',
          section: 'A'
        },
        type: 'vip',
        dimensions: { length: 5.5, width: 3, height: 2.8 },
        pricing: { hourlyRate: 60, dailyRate: 400, monthlyRate: 8000 },
        features: { covered: true, secured: true, cctv: true, carWash: true }
      },

      // Hyderabad locations
      {
        spotNumber: 'HYD-001',
        location: {
          name: 'Inorbit Mall',
          address: 'HITEC City, Hyderabad',
          coordinates: { latitude: 17.4399, longitude: 78.3908 },
          floor: 'Ground',
          section: 'A'
        },
        type: 'regular',
        dimensions: { length: 5, width: 2.5, height: 2.5 },
        pricing: { hourlyRate: 25, dailyRate: 180, monthlyRate: 3500 },
        features: { covered: false, secured: true, cctv: false }
      },
      {
        spotNumber: 'HYD-002',
        location: {
          name: 'Forum Sujana Mall',
          address: 'Kukatpally, Hyderabad',
          coordinates: { latitude: 17.4845, longitude: 78.4076 },
          floor: 'B1',
          section: 'B'
        },
        type: 'motorcycle',
        dimensions: { length: 3, width: 2, height: 2 },
        pricing: { hourlyRate: 10, dailyRate: 50, monthlyRate: 1000 },
        features: { covered: true, secured: true, cctv: true }
      }
    ];

    const createdSpots = [];
    for (const spotData of parkingSpots) {
      const existingSpot = await ParkingSpot.findOne({ spotNumber: spotData.spotNumber });
      if (!existingSpot) {
        const spot = new ParkingSpot(spotData);
        await spot.save();
        createdSpots.push(spot);
        console.log(`✅ Parking spot created: ${spotData.spotNumber}`);
      } else {
        createdSpots.push(existingSpot);
      }
    }

    // Create Vehicles
    const vehicles = [
      {
        owner: createdUsers[0]._id,
        licensePlate: 'KA01AB1234',
        make: 'Maruti',
        model: 'Swift',
        year: 2020,
        color: 'White',
        type: 'car',
        specifications: {
          fuelType: 'petrol',
          engineCapacity: '1.2L',
          seatingCapacity: 5
        },
        registration: {
          registrationNumber: 'KA01AB1234',
          registrationDate: new Date('2020-01-15'),
          expiryDate: new Date('2035-01-15'),
          state: 'Karnataka',
          rto: 'KA01'
        },
        status: 'active',
        verificationStatus: 'verified'
      },
      {
        owner: createdUsers[1]._id,
        licensePlate: 'MH02CD5678',
        make: 'Honda',
        model: 'City',
        year: 2019,
        color: 'Silver',
        type: 'car',
        specifications: {
          fuelType: 'petrol',
          engineCapacity: '1.5L',
          seatingCapacity: 5
        },
        registration: {
          registrationNumber: 'MH02CD5678',
          registrationDate: new Date('2019-03-10'),
          expiryDate: new Date('2034-03-10'),
          state: 'Maharashtra',
          rto: 'MH02'
        },
        status: 'active',
        verificationStatus: 'verified'
      },
      {
        owner: createdUsers[2]._id,
        licensePlate: 'TS07EF9012',
        make: 'Hyundai',
        model: 'Creta',
        year: 2021,
        color: 'Blue',
        type: 'suv',
        specifications: {
          fuelType: 'diesel',
          engineCapacity: '1.5L',
          seatingCapacity: 5
        },
        registration: {
          registrationNumber: 'TS07EF9012',
          registrationDate: new Date('2021-06-20'),
          expiryDate: new Date('2036-06-20'),
          state: 'Telangana',
          rto: 'TS07'
        },
        status: 'active',
        verificationStatus: 'verified'
      }
    ];

    const createdVehicles = [];
    for (const vehicleData of vehicles) {
      const existingVehicle = await Vehicle.findOne({ licensePlate: vehicleData.licensePlate });
      if (!existingVehicle) {
        const vehicle = new Vehicle(vehicleData);
        await vehicle.save();
        createdVehicles.push(vehicle);
        
        // Add vehicle to user's vehicles array
        await User.findByIdAndUpdate(
          vehicleData.owner,
          { $push: { vehicles: vehicle._id } }
        );
        
        console.log(`✅ Vehicle created: ${vehicleData.licensePlate}`);
      } else {
        createdVehicles.push(existingVehicle);
      }
    }

    // Create Sample Bookings
    const sampleBookings = [
      {
        bookingId: 'BK001' + Date.now().toString().slice(-6),
        user: createdUsers[0]._id,
        vehicle: createdVehicles[0]._id,
        parkingSpot: createdSpots[0]._id,
        bookingType: 'hourly',
        status: 'completed',
        timeline: {
          startTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
          endTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000), // 3 hours later
          actualStartTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          actualEndTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000)
        },
        pricing: {
          baseAmount: 60,
          taxes: 6,
          totalAmount: 66
        },
        payment: {
          status: 'paid',
          method: 'upi',
          transactionId: 'TXN001234567890',
          paidAmount: 66
        }
      }
    ];

    for (const bookingData of sampleBookings) {
      const booking = new Booking(bookingData);
      await booking.save();
      
      // Add booking to user's bookings array
      await User.findByIdAndUpdate(
        bookingData.user,
        { $push: { bookings: booking._id } }
      );
      
      console.log(`✅ Sample booking created: ${booking.bookingId}`);
    }

    console.log('🎉 Database seeding completed successfully!');
    console.log('\n📋 Summary:');
    console.log('- Super Admin: admin@vayaccess.com (Admin@123)');
    console.log('- Admin Users: john.manager@vayaccess.com, sarah.admin@vayaccess.com');
    console.log('- Regular Users: alice@example.com, bob@example.com, carol@example.com');
    console.log('- All user passwords: User@123 (except admins)');
    console.log(`- Parking Spots: ${parkingSpots.length} spots created`);
    console.log(`- Vehicles: ${vehicles.length} vehicles created`);
    console.log('- Sample bookings and logs created');

  } catch (error) {
    console.error('❌ Database seeding failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('📦 Database connection closed');
    process.exit(0);
  }
};

// Check command line arguments
if (process.argv.includes('--help')) {
  console.log(`
🌱 Database Seeding Script

Usage: node utils/seedDatabase.js [options]

Options:
  --clear    Clear existing data before seeding
  --help     Show this help message

Examples:
  node utils/seedDatabase.js           # Seed database (keep existing data)
  node utils/seedDatabase.js --clear   # Clear and seed database
  `);
  process.exit(0);
}

// Run the seeding
seedDatabase();