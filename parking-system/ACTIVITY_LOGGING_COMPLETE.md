# Complete Activity Logging System for MongoDB

## Overview
This document describes the comprehensive activity logging system implemented for the VayAccess Parking Management System. **ALL admin dashboard operations and user dashboard operations are now logged to MongoDB** with detailed tracking of PUT, POST, GET, and DELETE operations.

## 🗄️ MongoDB Collections

Your MongoDB `vay_parking_system` database now includes:

### Existing Collections:
- `bookings` - Parking booking records
- `parkingspots` - Parking spot information
- `payments` - Payment transactions
- `reports` - Generated reports
- `settings` - System settings
- `users` - User accounts
- `vehiclelogs` - Vehicle entry/exit logs
- `vehicles` - Vehicle registrations

### New Collection:
- **`activitylogs`** - **Complete activity tracking for all operations**

## 📊 ActivityLog Schema

```javascript
{
  userId: ObjectId,           // User performing the action
  userEmail: String,          // User's email
  userRole: String,           // 'admin' or 'user'
  action: String,             // Specific action performed
  method: String,             // HTTP method (GET, POST, PUT, DELETE)
  endpoint: String,           // API endpoint called
  requestData: Object,        // Request parameters and body
  responseStatus: Number,     // HTTP response status
  responseMessage: String,    // Response message
  resourceType: String,       // Type of resource affected
  resourceId: String,         // ID of affected resource
  ipAddress: String,          // User's IP address
  userAgent: String,          // Browser/client info
  sessionId: String,          // Session identifier
  duration: Number,           // Response time in milliseconds
  success: Boolean,           // Operation success status
  errorDetails: String,       // Error information if failed
  timestamp: Date,            // When the action occurred
  metadata: Object            // Additional context data
}
```

## 🔍 Tracked Actions

### Admin Dashboard Operations:
- **Authentication**: `ADMIN_LOGIN`, `ADMIN_LOGOUT`
- **Dashboard**: `ADMIN_VIEW_DASHBOARD`
- **User Management**: `ADMIN_CREATE_USER`, `ADMIN_UPDATE_USER`, `ADMIN_DELETE_USER`, `ADMIN_VIEW_USERS`
- **Vehicle Management**: `ADMIN_CREATE_VEHICLE`, `ADMIN_UPDATE_VEHICLE`, `ADMIN_DELETE_VEHICLE`, `ADMIN_VIEW_VEHICLES`
- **Parking Management**: `ADMIN_CREATE_PARKING_SPOT`, `ADMIN_UPDATE_PARKING_SPOT`, `ADMIN_DELETE_PARKING_SPOT`, `ADMIN_VIEW_PARKING_SPOTS`
- **Booking Management**: `ADMIN_VIEW_BOOKINGS`, `ADMIN_UPDATE_BOOKING`, `ADMIN_DELETE_BOOKING`
- **Payment Management**: `ADMIN_VIEW_PAYMENTS`, `ADMIN_PROCESS_PAYMENT`, `ADMIN_REFUND_PAYMENT`
- **Reports & Analytics**: `ADMIN_VIEW_REPORTS`, `ADMIN_GENERATE_REPORT`, `ADMIN_VIEW_ANALYTICS`
- **System Management**: `ADMIN_UPDATE_SETTINGS`, `ADMIN_VIEW_LOGS`, `ADMIN_EXPORT_DATA`

### User Dashboard Operations:
- **Authentication**: `USER_LOGIN`, `USER_LOGOUT`, `USER_REGISTER`
- **Dashboard**: `USER_VIEW_DASHBOARD`
- **Booking Management**: `USER_CREATE_BOOKING`, `USER_UPDATE_BOOKING`, `USER_CANCEL_BOOKING`, `USER_VIEW_BOOKINGS`
- **Vehicle Management**: `USER_ADD_VEHICLE`, `USER_UPDATE_VEHICLE`, `USER_DELETE_VEHICLE`, `USER_VIEW_VEHICLES`
- **Payment Management**: `USER_MAKE_PAYMENT`, `USER_VIEW_PAYMENTS`, `USER_VIEW_PAYMENT_HISTORY`
- **Profile Management**: `USER_UPDATE_PROFILE`, `USER_VIEW_PROFILE`, `USER_CHANGE_PASSWORD`
- **Other Actions**: `USER_VIEW_NOTIFICATIONS`, `USER_UPDATE_SETTINGS`, `USER_SEARCH_PARKING`

## 🛠️ Implementation Files

### 1. ActivityLog Model
**File**: `models/ActivityLog.js`
- Complete MongoDB schema for activity logging
- Indexes for performance optimization
- Static methods for common queries
- Instance methods for data sanitization

### 2. Activity Logger Middleware
**File**: `middlewares/activityLogger.js`
- Automatic activity logging for all API routes
- Request/response data capture
- Action mapping based on routes
- Data sanitization for security

### 3. Updated Servers
**Files**: `admin-server.js`, `user-server.js`
- Activity logging middleware integration
- User context injection for logging
- API endpoints for activity log management

### 4. Admin Dashboard Page
**File**: `views/admin/activity-logs.handlebars`
- Complete activity logs viewing interface
- Filtering and search capabilities
- Export functionality
- Real-time statistics

## 🚀 How to Use

### 1. Start the Servers
```bash
# Terminal 1 - Admin Server (Port 8081)
node admin-server.js

# Terminal 2 - User Server (Port 3002)
node user-server.js
```

### 2. Access Activity Logs
- **Admin Dashboard**: http://localhost:8081/admin/activity-logs
- **API Endpoint**: http://localhost:8081/api/admin/activity-logs

### 3. View in MongoDB
```javascript
// Connect to MongoDB
use vay_parking_system

// View all activity logs
db.activitylogs.find().sort({timestamp: -1}).limit(10)

// View admin activities only
db.activitylogs.find({userRole: "admin"}).sort({timestamp: -1})

// View user activities only
db.activitylogs.find({userRole: "user"}).sort({timestamp: -1})

// View specific actions
db.activitylogs.find({action: "ADMIN_CREATE_USER"})

// View failed operations
db.activitylogs.find({success: false})
```

## 📈 API Endpoints

### Get Activity Logs
```
GET /api/admin/activity-logs
Query Parameters:
- page: Page number (default: 1)
- limit: Records per page (default: 50)
- userRole: Filter by role (admin/user)
- action: Filter by specific action
- startDate: Filter from date
- endDate: Filter to date
- resourceType: Filter by resource type
```

### Get Activity Statistics
```
GET /api/admin/activity-stats
Returns:
- Total activities count
- Admin vs User activity breakdown
- Success/failure rates
- Detailed statistics by action type
```

### Export Activity Logs
```
GET /api/admin/export-activity-logs
Query Parameters:
- format: Export format (json/csv)
- All filtering parameters from activity-logs endpoint
```

### Get User Activity History
```
GET /api/admin/user-activity/:userId
Returns specific user's activity history
```

## 🔒 Security Features

### Data Sanitization
- Passwords and sensitive data are automatically redacted
- Credit card information is masked
- API keys and tokens are hidden

### Access Control
- Only authenticated users can generate logs
- Only admins can view activity logs
- IP address and session tracking

### Performance Optimization
- Database indexes for fast queries
- Pagination for large datasets
- Configurable log retention

## 📊 Monitoring Dashboard

The admin dashboard provides:
- **Real-time Statistics**: Total activities, success rates
- **User Activity Breakdown**: Admin vs User operations
- **Action Analysis**: Most common operations
- **Error Tracking**: Failed operations and reasons
- **Performance Metrics**: Response times and trends

## 🧪 Testing

### Manual Testing
1. Perform any admin operation (create user, view dashboard, etc.)
2. Check MongoDB: `db.activitylogs.find().sort({timestamp: -1}).limit(5)`
3. Verify the operation is logged with correct details

### Automated Testing
```bash
# Run comprehensive test (requires servers to be running)
node test-activity-logging.js
```

## 📋 What Gets Logged

### For Every Operation:
✅ **User Information**: Who performed the action
✅ **Action Details**: What was done
✅ **Request Data**: Parameters and payload
✅ **Response Information**: Status codes and messages
✅ **Performance Data**: Response times
✅ **Security Data**: IP addresses, user agents
✅ **Resource Information**: What was affected
✅ **Success/Failure Status**: Operation outcome

### HTTP Methods Tracked:
✅ **GET**: All view operations (dashboards, lists, details)
✅ **POST**: All create operations (new users, vehicles, bookings)
✅ **PUT**: All update operations (edit profiles, modify settings)
✅ **DELETE**: All delete operations (remove users, cancel bookings)

## 🎯 Benefits

1. **Complete Audit Trail**: Every action is recorded
2. **Security Monitoring**: Track suspicious activities
3. **Performance Analysis**: Identify slow operations
4. **User Behavior**: Understand usage patterns
5. **Compliance**: Meet audit requirements
6. **Debugging**: Trace issues and errors
7. **Analytics**: Generate usage reports

## 🔧 Configuration

### Environment Variables
```env
NODE_ENV=production          # Enable file logging
MONGODB_URI=your_mongo_uri   # Database connection
```

### Customization
- Modify `ACTION_MAPPING` in `activityLogger.js` to add new actions
- Adjust `sensitiveFields` array to protect additional data
- Configure log retention policies as needed

## ✅ Verification Checklist

- [ ] MongoDB `activitylogs` collection exists
- [ ] Admin operations are logged (login, create user, view dashboard)
- [ ] User operations are logged (register, login, add vehicle)
- [ ] All HTTP methods (GET, POST, PUT, DELETE) are tracked
- [ ] Sensitive data is properly sanitized
- [ ] Activity logs dashboard is accessible
- [ ] Export functionality works
- [ ] Performance metrics are captured
- [ ] Error details are logged for failed operations

## 🎉 Result

**Your MongoDB `vay_parking_system` database now captures EVERY admin and user dashboard operation with complete details. All PUT, POST, GET, and DELETE operations are automatically logged with user context, performance metrics, and security information.**

Access the activity logs at: http://localhost:8081/admin/activity-logs