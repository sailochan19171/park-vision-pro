/**
 * Seed Database with Sample Data
 * Run this script to populate the database with sample data for testing
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/parking_system';

// MongoDB Models
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  password: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const vehicleSchema = new mongoose.Schema({
  licensePlate: { type: String, required: true, unique: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, required: true },
  model: { type: String, required: true },
  color: { type: String, required: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  createdAt: { type: Date, default: Date.now }
});

const parkingSpotSchema = new mongoose.Schema({
  spotNumber: { type: String, required: true, unique: true },
  location: {
    name: { type: String, required: true },
    floor: { type: String, required: true },
    section: { type: String, required: true }
  },
  type: { type: String, enum: ['regular', 'premium', 'disabled'], default: 'regular' },
  status: { type: String, enum: ['available', 'occupied', 'maintenance'], default: 'available' },
  pricePerHour: { type: Number, required: true, default: 25 },
  createdAt: { type: Date, default: Date.now }
});

const bookingSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
  parkingSpot: { type: mongoose.Schema.Types.ObjectId, ref: 'ParkingSpot', required: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  duration: { type: Number, required: true }, // in minutes
  totalAmount: { type: Number, required: true },
  status: { type: String, enum: ['active', 'completed', 'cancelled'], default: 'active' },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

const paymentSchema = new mongoose.Schema({
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  method: { type: String, enum: ['card', 'upi', 'wallet', 'cash'], required: true },
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
  transactionId: { type: String, unique: true },
  description: { type: String },
  createdAt: { type: Date, default: Date.now }
});

// Create models
const User = mongoose.model('User', userSchema);
const Vehicle = mongoose.model('Vehicle', vehicleSchema);
const ParkingSpot = mongoose.model('ParkingSpot', parkingSpotSchema);
const Booking = mongoose.model('Booking', bookingSchema);
const Payment = mongoose.model('Payment', paymentSchema);

async function seedDatabase() {
  try {
    console.log('🌱 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing data
    console.log('🧹 Clearing existing data...');
    await mongoose.connection.db.dropDatabase();
    console.log('✅ Database cleared');

    // Create Users
    console.log('👥 Creating users...');
    const hashedPassword = await bcrypt.hash('User@123', 10);
    
    const users = await User.insertMany([
      {
        name: 'Alice Johnson',
        email: 'alice@example.com',
        phone: '+91 98765 43210',
        password: hashedPassword,
        isActive: true
      },
      {
        name: 'Bob Smith',
        email: 'bob@example.com',
        phone: '+91 87654 32109',
        password: hashedPassword,
        isActive: true
      },
      {
        name: 'John Doe',
        email: 'john@example.com',
        phone: '+91 76543 21098',
        password: hashedPassword,
        isActive: true
      }
    ]);

    console.log(`✅ Created ${users.length} users`);

    // Create Parking Spots
    console.log('🅿️ Creating parking spots...');
    const parkingSpots = await ParkingSpot.insertMany([
      {
        spotNumber: 'A001',
        location: { name: 'Mall Parking', floor: 'Ground', section: 'A' },
        type: 'regular',
        status: 'available',
        pricePerHour: 25
      },
      {
        spotNumber: 'A002',
        location: { name: 'Mall Parking', floor: 'Ground', section: 'A' },
        type: 'regular',
        status: 'occupied',
        pricePerHour: 25
      },
      {
        spotNumber: 'B001',
        location: { name: 'Office Complex', floor: 'B1', section: 'B' },
        type: 'premium',
        status: 'available',
        pricePerHour: 40
      },
      {
        spotNumber: 'B002',
        location: { name: 'Office Complex', floor: 'B1', section: 'B' },
        type: 'premium',
        status: 'available',
        pricePerHour: 40
      },
      {
        spotNumber: 'C001',
        location: { name: 'Hospital Parking', floor: 'Ground', section: 'C' },
        type: 'disabled',
        status: 'available',
        pricePerHour: 20
      }
    ]);

    console.log(`✅ Created ${parkingSpots.length} parking spots`);

    // Create Vehicles
    console.log('🚗 Creating vehicles...');
    const vehicles = await Vehicle.insertMany([
      {
        licensePlate: 'KA-01-AB-1234',
        owner: users[0]._id,
        type: 'Car',
        model: 'Honda Civic',
        color: 'Blue',
        status: 'active'
      },
      {
        licensePlate: 'KA-02-CD-5678',
        owner: users[1]._id,
        type: 'SUV',
        model: 'Toyota Fortuner',
        color: 'White',
        status: 'active'
      },
      {
        licensePlate: 'KA-03-EF-9012',
        owner: users[2]._id,
        type: 'Bike',
        model: 'Royal Enfield',
        color: 'Black',
        status: 'active'
      },
      {
        licensePlate: 'KA-04-GH-3456',
        owner: users[0]._id,
        type: 'Car',
        model: 'Maruti Swift',
        color: 'Red',
        status: 'active'
      }
    ]);

    console.log(`✅ Created ${vehicles.length} vehicles`);

    // Create Bookings
    console.log('📅 Creating bookings...');
    const now = new Date();
    const bookings = await Booking.insertMany([
      {
        user: users[0]._id,
        vehicle: vehicles[0]._id,
        parkingSpot: parkingSpots[1]._id, // occupied spot
        startTime: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
        endTime: new Date(now.getTime() + 2 * 60 * 60 * 1000), // 2 hours from now
        duration: 240, // 4 hours
        totalAmount: 100,
        status: 'active',
        paymentStatus: 'paid'
      },
      {
        user: users[1]._id,
        vehicle: vehicles[1]._id,
        parkingSpot: parkingSpots[0]._id,
        startTime: new Date(now.getTime() - 24 * 60 * 60 * 1000), // yesterday
        endTime: new Date(now.getTime() - 20 * 60 * 60 * 1000), // 20 hours ago
        duration: 240,
        totalAmount: 100,
        status: 'completed',
        paymentStatus: 'paid'
      },
      {
        user: users[2]._id,
        vehicle: vehicles[2]._id,
        parkingSpot: parkingSpots[2]._id,
        startTime: new Date(now.getTime() - 48 * 60 * 60 * 1000), // 2 days ago
        endTime: new Date(now.getTime() - 44 * 60 * 60 * 1000), // 44 hours ago
        duration: 240,
        totalAmount: 160,
        status: 'completed',
        paymentStatus: 'paid'
      }
    ]);

    console.log(`✅ Created ${bookings.length} bookings`);

    // Create Payments
    console.log('💳 Creating payments...');
    const payments = await Payment.insertMany([
      {
        bookingId: bookings[0]._id,
        userId: users[0]._id,
        amount: 100,
        method: 'upi',
        status: 'completed',
        transactionId: 'TXN001' + Date.now(),
        description: 'Parking payment for spot A002'
      },
      {
        bookingId: bookings[1]._id,
        userId: users[1]._id,
        amount: 100,
        method: 'card',
        status: 'completed',
        transactionId: 'TXN002' + Date.now(),
        description: 'Parking payment for spot A001'
      },
      {
        bookingId: bookings[2]._id,
        userId: users[2]._id,
        amount: 160,
        method: 'wallet',
        status: 'completed',
        transactionId: 'TXN003' + Date.now(),
        description: 'Parking payment for spot B001'
      }
    ]);

    console.log(`✅ Created ${payments.length} payments`);

    console.log('🎉 Database seeded successfully!');
    console.log('\n📊 Summary:');
    console.log(`👥 Users: ${users.length}`);
    console.log(`🚗 Vehicles: ${vehicles.length}`);
    console.log(`🅿️ Parking Spots: ${parkingSpots.length}`);
    console.log(`📅 Bookings: ${bookings.length}`);
    console.log(`💳 Payments: ${payments.length}`);

    console.log('\n🔐 Test Login Credentials:');
    console.log('Email: alice@example.com | Password: User@123');
    console.log('Email: bob@example.com | Password: User@123');
    console.log('Email: john@example.com | Password: User@123');

  } catch (error) {
    console.error('❌ Error seeding database:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run the seed function
seedDatabase();