# 🔧 Troubleshooting 500 Internal Server Error

## 🎯 Current Issue
**Error**: `Failed to load resource: the server responded with a status of 500 (Internal Server Error)`
**Location**: User creation in admin dashboard

## 🔍 Debugging Steps

### Step 1: Check Server Console
**Most Important**: Look at your admin server console for detailed error logs.

1. **Start the admin server** with detailed logging:
   ```bash
   node admin-server.js
   ```

2. **Try to create a user** in the browser

3. **Check the server console** for error messages like:
   ```
   API Create user error - Full error: [ERROR DETAILS]
   Error name: [ERROR TYPE]
   Error message: [SPECIFIC ERROR]
   ```

### Step 2: Run Diagnostic Tests

#### Test A: Database Connection
```bash
node debug-user-creation.js
```
**Expected**: All tests should pass ✅

#### Test B: Server Connection  
```bash
node test-server-connection.js
```
**Expected**: Should identify the exact failure point

#### Test C: API Endpoint Test
```bash
# Start server first: node admin-server.js
# Then run: node test-api-user-creation.js
```

### Step 3: Common Causes & Solutions

#### 🔴 Cause 1: Session/Authentication Issue
**Symptoms**: 
- Server logs show "Admin not authenticated"
- 401 errors in network tab

**Solution**:
1. Clear browser cookies
2. Login again to admin dashboard
3. Try creating user immediately after login

#### 🔴 Cause 2: MongoDB Connection Issue
**Symptoms**:
- Server logs show MongoDB connection errors
- "Connection state: 0" in logs

**Solution**:
1. Check MongoDB is running
2. Verify MONGODB_URI in .env file
3. Test connection: `node debug-user-creation.js`

#### 🔴 Cause 3: Validation Error
**Symptoms**:
- Server logs show "ValidationError"
- Specific field validation messages

**Solution**:
1. Check all required fields are filled
2. Verify email format is correct
3. Ensure phone number format is valid

#### 🔴 Cause 4: bcrypt/Password Hashing Issue
**Symptoms**:
- Error during password hashing
- bcrypt-related error messages

**Solution**:
```bash
npm uninstall bcrypt bcryptjs
npm install bcryptjs@2.4.3
```

#### 🔴 Cause 5: Duplicate Email Error
**Symptoms**:
- "User with this email already exists"
- Duplicate key error (code: 11000)

**Solution**:
1. Use a different email address
2. Check existing users in database
3. Delete test users if needed

### Step 4: Browser Debugging

#### Open Browser Developer Tools (F12):

1. **Console Tab**: Look for JavaScript errors
2. **Network Tab**: 
   - Find the POST request to `/api/admin/users`
   - Check request payload
   - Check response details
3. **Application Tab**: Check cookies are present

### Step 5: Manual Testing Steps

1. **Clear Browser Data**:
   - Clear cookies and cache
   - Try in incognito/private mode

2. **Login Fresh**:
   - Go to http://localhost:8081/admin/login
   - Login with: admin@vayaccess.com / admin123
   - Immediately go to users page

3. **Create User with Simple Data**:
   ```
   Name: Test User
   Email: test@example.com
   Phone: +1234567890
   Role: Regular User (not Premium)
   Password: testpass123
   Status: Active
   ```

### Step 6: Server-Side Fixes Applied

✅ **Enhanced Error Handling**: Detailed error logging
✅ **Role Validation**: Added 'premium' role support  
✅ **Profile Schema**: Fixed invalid profile fields
✅ **Authentication Debug**: Added session debugging
✅ **Validation**: Improved field validation

## 🚨 Quick Fix Commands

### If you're getting the error right now:

1. **Stop the admin server** (Ctrl+C)

2. **Restart with debugging**:
   ```bash
   node admin-server.js
   ```

3. **In browser**:
   - Clear cookies (F12 > Application > Cookies > Delete all)
   - Go to: http://localhost:8081/admin/login
   - Login fresh
   - Try creating user

4. **Watch server console** for detailed error messages

## 📊 Expected Server Console Output

When working correctly, you should see:
```
Auth check - Session ID: [SESSION_ID]
Auth check - Path: /api/admin/users
Auth check - Method: POST
✅ Admin authenticated
✅ User info added to request: admin@vayaccess.com
Creating user with data: { name: '...', email: '...', ... }
User model available: true
MongoDB connection state: 1
Creating User instance with data: { ... }
User instance created, attempting to save...
User saved successfully with ID: [USER_ID]
```

## 🎯 Most Likely Solutions

### Solution 1: Session Issue (90% of cases)
```bash
# Clear browser cookies and login fresh
```

### Solution 2: Server Restart
```bash
# Stop server (Ctrl+C) and restart
node admin-server.js
```

### Solution 3: Use Different Email
```bash
# Try with: test.premium.123@example.com
```

## 📞 If Still Not Working

1. **Share server console output** - The exact error messages
2. **Share browser console errors** - Any JavaScript errors
3. **Share network request details** - Request/response from Network tab

The detailed logging will now show exactly where the error occurs!