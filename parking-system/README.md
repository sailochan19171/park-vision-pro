# VayAccess Smart Parking Management System

A comprehensive parking management system with separate admin and user dashboards, built with Node.js, Express.js, and MongoDB.

## 🏗️ Project Structure

```
parking-system/
├── controllers/         # Business logic for routes
├── middlewares/         # Custom middleware (auth, logging, etc.)
├── routes/              # API endpoint definitions
├── models/              # MongoDB/Mongoose models
├── services/            # Helper services (JWT, LPR, Email)
├── utils/               # Utility functions
├── views/               # Admin and User dashboard templates
├── public/              # Static files (CSS, JS, images)
├── templates/           # Email templates
├── logs/                # Application logs
├── server.js            # Main API server (Port 3000)
├── admin-server.js      # Admin dashboard server (Port 3001)
├── user-server.js       # User dashboard server (Port 3002)
└── package.json         # Dependencies and scripts
```

## 🚀 Quick Start

### Prerequisites

- Node.js (v16 or higher)
- MongoDB (v4.4 or higher)
- npm or yarn

### Installation

1. **Clone or create the project directory:**
   ```bash
   cd /path/to/park-vision-pro
   mkdir parking-system
   cd parking-system
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Setup:**
   ```bash
   cp .env.example .env
   # Edit .env file with your configuration
   ```

4. **Environment Variables:**
   ```env
   # Database
   MONGODB_URI=mongodb://localhost:27017/vay_parking_system
   
   # Server Ports
   API_PORT=3000
   ADMIN_PORT=3001
   USER_PORT=3002
   
   # JWT Configuration
   JWT_SECRET=your_super_secret_jwt_key_here
   JWT_REFRESH_SECRET=your_refresh_secret_here
   JWT_EXPIRES_IN=1h
   JWT_REFRESH_EXPIRES_IN=7d
   
   # Email Configuration (Optional)
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your_email@gmail.com
   SMTP_PASS=your_app_password
   ```

5. **Seed Database:**
   ```bash
   npm run seed
   ```

6. **Start All Services:**
   ```bash
   # Development mode (all services with auto-reload)
   npm run dev:all
   
   # Or start individually:
   npm run dev          # API Server (Port 3000)
   npm run dev:admin    # Admin Dashboard (Port 3001)
   npm run dev:user     # User Dashboard (Port 3002)
   ```

## 🎯 Access Points

After starting the servers, access:

- **API Server**: http://localhost:3000
- **Admin Dashboard**: http://localhost:3001
- **User Dashboard**: http://localhost:3002

### Default Login Credentials

**Super Admin:**
- Email: admin@vayaccess.com
- Password: Admin@123

**Admin Users:**
- Email: john.manager@vayaccess.com
- Password: Manager@123

**Regular Users:**
- Email: alice@example.com, bob@example.com, carol@example.com
- Password: User@123

## 📋 Core Features

### Authentication & Authorization
- JWT-based authentication
- Role-based access control (User, Admin, Super Admin)
- Refresh token mechanism
- Session management

### Parking Space Management
- Real-time parking spot status
- Location-based spot discovery
- Multi-level parking support
- Dynamic pricing

### Vehicle Entry & Exit Management
- License Plate Recognition (LPR) integration
- RFID tag support
- Manual entry/exit logging
- Automated billing

### User Features
- Vehicle registration and management
- Parking spot booking
- Payment integration
- Booking history
- Real-time notifications

### Admin Features
- Dashboard with analytics
- User management
- Parking spot management
- Vehicle log monitoring
- Revenue reporting
- System configuration

## 🛠️ API Endpoints

### Authentication
```
POST /api/auth/register        # User registration
POST /api/auth/login           # User login
POST /api/auth/admin/login     # Admin login
POST /api/auth/logout          # Logout
POST /api/auth/refresh-token   # Refresh access token
GET  /api/auth/profile         # Get user profile
PUT  /api/auth/profile         # Update user profile
PUT  /api/auth/change-password # Change password
```

### Parking Management
```
GET    /api/parking/spots              # List parking spots
GET    /api/parking/spot/:id           # Get spot details
PUT    /api/parking/spot/:id/status    # Update spot status
POST   /api/parking/spots              # Create new spot (Admin)
PUT    /api/parking/spot/:id           # Update spot (Admin)
DELETE /api/parking/spot/:id           # Delete spot (Admin)
GET    /api/parking/analytics          # Parking analytics (Admin)
```

### Vehicle Logging
```
POST /api/vehicle/entry       # Log vehicle entry
POST /api/vehicle/exit        # Log vehicle exit
GET  /api/vehicle/logs        # Get vehicle logs
GET  /api/vehicle/log/:id     # Get specific log
PUT  /api/vehicle/log/:id/suspicious  # Mark as suspicious
POST /api/vehicle/lpr         # Process LPR detection
GET  /api/vehicle/analytics   # Vehicle analytics
```

## 🏢 Dashboard Features

### Admin Dashboard
- **Overview**: Real-time statistics and charts
- **Parking Management**: Spot status, configuration
- **Vehicle Logs**: Entry/exit monitoring
- **User Management**: User accounts, roles
- **Reports**: Revenue, occupancy, analytics
- **Settings**: System configuration

### User Dashboard
- **Overview**: Active bookings, quick actions
- **Find Parking**: Location-based spot search
- **My Bookings**: Current and past bookings
- **My Vehicles**: Vehicle management
- **Payments**: Payment history, wallet
- **Profile**: Account settings, preferences

## 🔧 Development

### Available Scripts
```bash
npm start           # Production mode
npm run dev         # Development mode (API only)
npm run dev:all     # All services in development mode
npm run seed        # Seed database with sample data
npm run seed --clear # Clear and seed database
```

### Database Schema

**Key Models:**
- `User`: User accounts with roles and preferences
- `ParkingSpot`: Parking space information and status
- `Vehicle`: Vehicle registration and details
- `VehicleLog`: Entry/exit logging with LPR data
- `Booking`: Parking reservations and payments

### Adding New Features

1. **Create Model** (if needed): `models/NewModel.js`
2. **Create Controller**: `controllers/newController.js`
3. **Create Routes**: `routes/new.js`
4. **Add Validation**: Use express-validator
5. **Add to Main Server**: Import routes in `server.js`
6. **Update Documentation**: Update this README

### Testing

```bash
# Run tests (when implemented)
npm test

# Run specific test file
npm test tests/auth.test.js
```

## 🔐 Security Features

- Password hashing with bcrypt
- JWT token authentication
- Rate limiting on sensitive endpoints
- Input validation and sanitization
- CORS configuration
- Security headers with Helmet
- SQL injection protection (via Mongoose)
- XSS protection

## 📊 Monitoring & Logging

- Request/response logging
- Error tracking and logging
- Performance monitoring
- Security event logging
- Real-time updates via Socket.IO

## 🚦 License Plate Recognition (LPR)

The system supports LPR integration:

- **Mock Mode**: For development/testing
- **API Integration**: Connect to external LPR services
- **Confidence Scoring**: Automatic entry based on confidence
- **Fallback Options**: Manual entry when LPR fails

## 📧 Email Integration

- Welcome emails for new users
- Booking confirmations
- Payment receipts
- Notification system
- Template-based emails

## 🔄 Real-time Updates

Using Socket.IO for real-time features:
- Live parking spot status
- Admin notifications
- User booking updates
- System alerts

## 📈 Analytics & Reporting

- Occupancy rates and trends
- Revenue analytics
- User behavior insights
- Popular parking spots
- Peak time analysis
- Vehicle detection accuracy

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests (if applicable)
5. Submit a pull request

## 📞 Support

For support and questions:
- Email: support@vayaccess.com
- Documentation: [Project Wiki]
- Issues: [GitHub Issues]

## 🎉 Deployment

### Production Deployment

1. **Environment Setup:**
   ```bash
   NODE_ENV=production
   # Configure production database
   # Set up email service
   # Configure LPR service
   ```

2. **Process Management:**
   ```bash
   # Using PM2
   npm install -g pm2
   pm2 start ecosystem.config.js
   ```

3. **Reverse Proxy:**
   Configure Nginx or Apache to proxy requests to the three services.

### Docker Deployment

```dockerfile
# Dockerfile example
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000 3001 3002
CMD ["npm", "start"]
```

---

**VayAccess Smart Parking Management System** - Transforming parking through technology! 🚗🅿️