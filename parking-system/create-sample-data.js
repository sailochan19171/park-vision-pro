// Create sample parking spots and test data
const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Import models
const ParkingSpot = require('./models/ParkingSpot');
const User = require('./models/User');
const Vehicle = require('./models/Vehicle');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/parking_system';

async function createSampleData() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log(' Connected to MongoDB');
    
    // Create sample parking spots if they don't exist
    const existingSpots = await ParkingSpot.countDocuments();
    
    if (existingSpots < 10) {
      console.log(' Creating sample parking spots...');
      
      const sampleSpots = [];
      for (let i = 1; i <= 20; i++) {
        sampleSpots.push({
          spotNumber: `A${i.toString().padStart(2, '0')}`,
          location: {
            name: 'Main Parking Area',
            floor: Math.floor((i - 1) / 10) + 1,
            zone: 'A'
          },
          type: 'standard',
          status: 'available',
          pricing: {
            hourlyRate: 50,
            dailyRate: 400
          }
        });
      }
      
      await ParkingSpot.insertMany(sampleSpots);
      console.log(` Created ${sampleSpots.length} parking spots`);
    } else {
      console.log(` Found ${existingSpots} existing parking spots`);
    }
    
    // List available data
    const users = await User.find({}, 'name email').limit(5);
    const vehicles = await Vehicle.find({}, 'licensePlate owner').populate('owner', 'name').limit(5);
    const spots = await ParkingSpot.find({}, 'spotNumber status').limit(5);
    
    console.log('\n Available Data:');
    console.log('Users:', users.map(u => `${u.name} (${u.email})`));
    console.log('Vehicles:', vehicles.map(v => `${v.licensePlate} - ${v.owner?.name || 'No owner'}`));
    console.log('Parking Spots:', spots.map(s => `${s.spotNumber} (${s.status})`));
    
    console.log('\n Sample data ready!');
    
  } catch (error) {
    console.error(' Error creating sample data:', error);
  } finally {
    mongoose.disconnect();
  }
}

createSampleData();
