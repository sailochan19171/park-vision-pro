/**
 * Complete Database Seeding Script
 * This script populates the database with comprehensive sample data
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/parking_system';

// Define schemas (same as in user-server.js)
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
    console.log(' Starting database seeding...');
    
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log(' Connected to MongoDB');

    // Clear existing data
    await Promise.all([
      User.deleteMany({}),
      Vehicle.deleteMany({}),
      ParkingSpot.deleteMany({}),
      Booking.deleteMany({}),
      Payment.deleteMany({})
    ]);
    console.log(' Cleared existing data');

    // Create Users
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
      },
      {
        name: 'Sarah Wilson',
        email: 'sarah@example.com',
        phone: '+91 65432 10987',
        password: hashedPassword,
        isActive: true
      },
      {
        name: 'Mike Davis',
        email: 'mike@example.com',
        phone: '+91 54321 09876',
        password: hashedPassword,
        isActive: true
      }
    ]);
    console.log(` Created ${users.length} users`);

    // Create Vehicles
    const vehicles = await Vehicle.insertMany([
      // Alice's vehicles
      {
        licensePlate: 'DL01AB1234',
        owner: users[0]._id,
        type: 'car',
        model: 'Honda City',
        color: 'White',
        status: 'active'
      },
      {
        licensePlate: 'DL02CD5678',
        owner: users[0]._id,
        type: 'suv',
        model: 'Toyota Fortuner',
        color: 'Black',
        status: 'active'
      },
      // Bob's vehicles
      {
        licensePlate: 'DL03EF9012',
        owner: users[1]._id,
        type: 'car',
        model: 'Maruti Swift',
        color: 'Red',
        status: 'active'
      },
      // John's vehicles
      {
        licensePlate: 'DL04GH3456',
        owner: users[2]._id,
        type: 'car',
        model: 'Hyundai Creta',
        color: 'Blue',
        status: 'active'
      },
      {
        licensePlate: 'DL05IJ7890',
        owner: users[2]._id,
        type: 'motorcycle',
        model: 'Royal Enfield',
        color: 'Black',
        status: 'active'
      },
      // Sarah's vehicles
      {
        licensePlate: 'DL06KL1234',
        owner: users[3]._id,
        type: 'car',
        model: 'BMW X3',
        color: 'Silver',
        status: 'active'
      },
      // Mike's vehicles
      {
        licensePlate: 'DL07MN5678',
        owner: users[4]._id,
        type: 'car',
        model: 'Audi A4',
        color: 'White',
        status: 'active'
      }
    ]);
    console.log(` Created ${vehicles.length} vehicles`);

    // Create Parking Spots
    const locations = [
      { name: 'City Mall', floors: ['Ground Floor', 'First Floor', 'Second Floor'] },
      { name: 'Tech Park', floors: ['Basement 1', 'Basement 2', 'Ground Floor'] },
      { name: 'Shopping Center', floors: ['Ground Floor', 'First Floor'] },
      { name: 'Airport', floors: ['Terminal 1', 'Terminal 2', 'Terminal 3'] },
      { name: 'Hospital', floors: ['Ground Floor', 'First Floor'] }
    ];

    const sections = ['A', 'B', 'C', 'D', 'E'];
    const spotTypes = ['regular', 'premium', 'disabled'];
    const priceRanges = { regular: [25, 50], premium: [75, 120], disabled: [20, 30] };

    const parkingSpots = [];
    let spotCounter = 1;

    locations.forEach((location, locationIndex) => {
      location.floors.forEach((floor, floorIndex) => {
        sections.forEach((section, sectionIndex) => {
          for (let i = 1; i <= 20; i++) {
            const spotType = spotTypes[Math.floor(Math.random() * spotTypes.length)];
            const priceRange = priceRanges[spotType];
            const price = Math.floor(Math.random() * (priceRange[1] - priceRange[0] + 1)) + priceRange[0];
            
            // Create unique spot number using location prefix
            const locationPrefix = location.name.substring(0, 2).toUpperCase();
            const uniqueSpotNumber = `${locationPrefix}${section}-${String(i).padStart(2, '0')}`;
            
            parkingSpots.push({
              spotNumber: uniqueSpotNumber,
              location: {
                name: location.name,
                floor: floor,
                section: section
              },
              type: spotType,
              status: Math.random() > 0.3 ? 'available' : 'occupied', // 70% available
              pricePerHour: price
            });
          }
        });
      });
    });

    const createdSpots = await ParkingSpot.insertMany(parkingSpots);
    console.log(` Created ${createdSpots.length} parking spots`);

    // Create Bookings
    const now = new Date();
    const bookings = [];

    // Active bookings
    for (let i = 0; i < 15; i++) {
      const user = users[Math.floor(Math.random() * users.length)];
      const userVehicles = vehicles.filter(v => v.owner.toString() === user._id.toString());
      const vehicle = userVehicles[Math.floor(Math.random() * userVehicles.length)];
      const occupiedSpots = createdSpots.filter(s => s.status === 'occupied');
      const spot = occupiedSpots[Math.floor(Math.random() * occupiedSpots.length)];

      if (vehicle && spot) {
        const startTime = new Date(now.getTime() - Math.random() * 4 * 60 * 60 * 1000); // Started 0-4 hours ago
        const duration = Math.floor(Math.random() * 480) + 60; // 1-8 hours in minutes
        const endTime = new Date(startTime.getTime() + duration * 60 * 1000);
        const totalAmount = Math.ceil(duration / 60) * spot.pricePerHour;

        bookings.push({
          user: user._id,
          vehicle: vehicle._id,
          parkingSpot: spot._id,
          startTime,
          endTime,
          duration,
          totalAmount,
          status: 'active',
          paymentStatus: 'paid'
        });
      }
    }

    // Completed bookings
    for (let i = 0; i < 25; i++) {
      const user = users[Math.floor(Math.random() * users.length)];
      const userVehicles = vehicles.filter(v => v.owner.toString() === user._id.toString());
      const vehicle = userVehicles[Math.floor(Math.random() * userVehicles.length)];
      const spot = createdSpots[Math.floor(Math.random() * createdSpots.length)];

      if (vehicle && spot) {
        const daysAgo = Math.floor(Math.random() * 30) + 1; // 1-30 days ago
        const startTime = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
        const duration = Math.floor(Math.random() * 480) + 60; // 1-8 hours in minutes
        const endTime = new Date(startTime.getTime() + duration * 60 * 1000);
        const totalAmount = Math.ceil(duration / 60) * spot.pricePerHour;

        bookings.push({
          user: user._id,
          vehicle: vehicle._id,
          parkingSpot: spot._id,
          startTime,
          endTime,
          duration,
          totalAmount,
          status: 'completed',
          paymentStatus: 'paid'
        });
      }
    }

    // Cancelled bookings
    for (let i = 0; i < 8; i++) {
      const user = users[Math.floor(Math.random() * users.length)];
      const userVehicles = vehicles.filter(v => v.owner.toString() === user._id.toString());
      const vehicle = userVehicles[Math.floor(Math.random() * userVehicles.length)];
      const spot = createdSpots[Math.floor(Math.random() * createdSpots.length)];

      if (vehicle && spot) {
        const daysAgo = Math.floor(Math.random() * 15) + 1; // 1-15 days ago
        const startTime = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
        const duration = Math.floor(Math.random() * 480) + 60; // 1-8 hours in minutes
        const endTime = new Date(startTime.getTime() + duration * 60 * 1000);
        const totalAmount = Math.ceil(duration / 60) * spot.pricePerHour;

        bookings.push({
          user: user._id,
          vehicle: vehicle._id,
          parkingSpot: spot._id,
          startTime,
          endTime,
          duration,
          totalAmount,
          status: 'cancelled',
          paymentStatus: 'paid'
        });
      }
    }

    const createdBookings = await Booking.insertMany(bookings);
    console.log(` Created ${createdBookings.length} bookings`);

    // Create Payments
    const payments = [];

    createdBookings.forEach(booking => {
      // Main payment
      payments.push({
        bookingId: booking._id,
        userId: booking.user,
        amount: booking.totalAmount,
        method: ['card', 'upi', 'wallet'][Math.floor(Math.random() * 3)],
        status: 'completed',
        transactionId: `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        description: `Payment for booking ${booking._id}`
      });

      // Add refund for cancelled bookings
      if (booking.status === 'cancelled') {
        const refundAmount = booking.totalAmount * 0.9; // 10% cancellation fee
        payments.push({
          bookingId: booking._id,
          userId: booking.user,
          amount: -refundAmount,
          method: 'refund',
          status: 'completed',
          transactionId: `REF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          description: `Refund for cancelled booking ${booking._id}`
        });
      }
    });

    const createdPayments = await Payment.insertMany(payments);
    console.log(` Created ${createdPayments.length} payments`);

    console.log('\n Database seeding completed successfully!');
    console.log('\n Summary:');
    console.log(`   Users: ${users.length}`);
    console.log(`   Vehicles: ${vehicles.length}`);
    console.log(`   Parking Spots: ${createdSpots.length}`);
    console.log(`   Bookings: ${createdBookings.length}`);
    console.log(`   Payments: ${createdPayments.length}`);
    
    console.log('\n Test Login Credentials:');
    console.log('   Email: alice@example.com | Password: User@123');
    console.log('   Email: bob@example.com | Password: User@123');
    console.log('   Email: john@example.com | Password: User@123');
    console.log('   Email: sarah@example.com | Password: User@123');
    console.log('   Email: mike@example.com | Password: User@123');

  } catch (error) {
    console.error(' Error seeding database:', error);
  } finally {
    await mongoose.disconnect();
    console.log(' Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run the seeding
seedDatabase();
