// Complete Admin Dashboard JavaScript
// Fixed for localhost:8080 with session-based authentication

console.log(' Admin Dashboard JavaScript Loading...');

// Removed duplicate DOMContentLoaded - using the one at the bottom of the file

// Dashboard initialization
function initializeDashboard() {
    console.log(' Initializing dashboard...');
    
    // Load initial data
    refreshDashboard();
    
    // Set up auto-refresh every 30 seconds
    setInterval(refreshDashboard, 30000);
}

// Main dashboard refresh function
async function refreshDashboard() {
    console.log(' Refreshing dashboard data...');
    
    try {
        // Load dashboard stats
        await loadDashboardStats();
        
        // Load AI call recordings
        await loadAICallRecordings();
        
        // Load recent activity
        await loadRecentActivity();
        
        console.log(' Dashboard refresh completed');
    } catch (error) {
        console.error(' Dashboard refresh error:', error);
        showError('Failed to refresh dashboard data');
    }
}

// Load dashboard statistics
async function loadDashboardStats() {
    try {
        console.log(' Loading dashboard stats...');
        
        const response = await fetch('/api/admin/dashboard', {
            method: 'GET',
            credentials: 'same-origin', // Use session cookies
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log(' Dashboard stats loaded:', result);
        
        // Support both old and new response shapes
        const stats = result.data?.stats || result.stats;
        const recentActivity = result.data?.recentActivity || result.recentActivity || [];
        
        if (result.success && stats) {
            updateDashboardStats(stats);
            updateRecentActivity(recentActivity);
        } else {
            throw new Error('Invalid dashboard data format');
        }
        
    } catch (error) {
        console.error(' Error loading dashboard stats:', error);
        showError('Failed to load dashboard statistics');
        
        // Show fallback data
        updateDashboardStats({
            totalUsers: 0,
            totalBookings: 0,
            totalRevenue: 0,
            occupancyRate: 0
        });
    }
}

// Update dashboard stats in UI
function updateDashboardStats(stats) {
    console.log(' Updating dashboard stats UI:', stats);
    
    try {
        // Update total users
        const totalUsersEl = document.getElementById('totalUsers');
        if (totalUsersEl && stats.totalUsers !== undefined) {
            totalUsersEl.textContent = stats.totalUsers.toLocaleString();
        }
        
        // Update active bookings
        const activeBookingsEl = document.getElementById('activeBookings');
        if (activeBookingsEl && stats.totalBookings !== undefined) {
            activeBookingsEl.textContent = stats.totalBookings.toLocaleString();
        }
        
        // Update total revenue
        const totalRevenueEl = document.getElementById('totalRevenue');
        if (totalRevenueEl && stats.totalRevenue !== undefined) {
            totalRevenueEl.textContent = formatCurrency(stats.totalRevenue);
        }
        
        // Update occupancy rate
        const occupancyRateEl = document.getElementById('occupancyRate');
        if (occupancyRateEl && stats.occupiedSpots !== undefined && stats.totalSpots !== undefined) {
            const occupancy = stats.totalSpots > 0 ? 
                Math.round((stats.occupiedSpots / stats.totalSpots) * 100) : 0;
            occupancyRateEl.textContent = occupancy + '%';
        }
        
        // Update quick stats
        updateQuickStats(stats);
        
    } catch (error) {
        console.error(' Error updating dashboard stats UI:', error);
    }
}

// Update quick stats section
function updateQuickStats(stats) {
    try {
        // Today's bookings
        const todayBookingsEl = document.getElementById('todayBookings');
        if (todayBookingsEl && stats.todayBookings !== undefined) {
            todayBookingsEl.textContent = stats.todayBookings.toLocaleString();
        }
        
        // Pending payments (calculated from available spots for demo)
        const pendingPaymentsEl = document.getElementById('pendingPayments');
        if (pendingPaymentsEl && stats.availableSpots !== undefined) {
            pendingPaymentsEl.textContent = Math.floor(stats.availableSpots * 0.1);
        }
        
        // Total vehicles (calculated from total users for demo)
        const totalVehiclesEl = document.getElementById('totalVehicles');
        if (totalVehiclesEl && stats.totalUsers !== undefined) {
            totalVehiclesEl.textContent = Math.floor(stats.totalUsers * 1.3).toLocaleString();
        }
        
        // System alerts (always 0 for demo)
        const systemAlertsEl = document.getElementById('systemAlerts');
        if (systemAlertsEl) {
            systemAlertsEl.textContent = '0';
        }
        
    } catch (error) {
        console.error(' Error updating quick stats:', error);
    }
}

// Load AI call recordings
async function loadAICallRecordings() {
    try {
        console.log(' Loading AI call recordings...');
        
        const response = await fetch('/api/admin/ai-call-recordings', {
            method: 'GET',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log(' AI call recordings loaded:', result);
        
        if (result.success && result.data) {
            updateAICallAnalytics(result.data);
        } else {
            throw new Error('Invalid AI call data format');
        }
        
    } catch (error) {
        console.error(' Failed to load AI call recordings:', error);
        // Don't show error for AI calls as it's optional
    }
}

// Update AI call analytics
function updateAICallAnalytics(data) {
    try {
        console.log(' Updating AI call analytics:', data);
        
        // Update AI call stats if elements exist
        const aiCallStatsEl = document.getElementById('aiCallStats');
        if (aiCallStatsEl && data.totalCalls !== undefined) {
            aiCallStatsEl.innerHTML = `
                <div class="row">
                    <div class="col-4 text-center">
                        <div class="h6 mb-0">${data.totalCalls}</div>
                        <small class="text-muted">Total Calls</small>
                    </div>
                    <div class="col-4 text-center">
                        <div class="h6 mb-0">${data.todayCalls || 0}</div>
                        <small class="text-muted">Today</small>
                    </div>
                    <div class="col-4 text-center">
                        <div class="h6 mb-0">${Math.floor((data.avgDuration || 0) / 60)}m</div>
                        <small class="text-muted">Avg Duration</small>
                    </div>
                </div>
            `;
        }
        
    } catch (error) {
        console.error(' Error updating AI call analytics:', error);
    }
}

// Load recent activity
async function loadRecentActivity() {
    // Recent activity is part of dashboard stats, so it's already loaded
    console.log(' Recent activity loaded via dashboard stats');
}

// Update recent activity UI
function updateRecentActivity(activities) {
    try {
        console.log(' Updating recent activity:', activities);
        
        const recentActivityEl = document.getElementById('recentActivity');
        if (!recentActivityEl || !Array.isArray(activities)) {
            return;
        }
        
        if (activities.length === 0) {
            recentActivityEl.innerHTML = '<div class="text-center text-muted">No recent activity</div>';
            return;
        }
        
        const activityHtml = activities.map(activity => {
            const statusClass = getActivityStatusClass(activity.status);
            const time = formatTime(activity.time);
            
            return `
                <div class="d-flex align-items-center py-2 border-bottom">
                    <div class="flex-shrink-0">
                        <span class="badge bg-${statusClass} rounded-pill">${activity.type}</span>
                    </div>
                    <div class="flex-grow-1 ms-3">
                        <div class="small">${activity.message}</div>
                        <div class="text-muted small">${time}</div>
                    </div>
                </div>
            `;
        }).join('');
        
        recentActivityEl.innerHTML = activityHtml;
        
    } catch (error) {
        console.error(' Error updating recent activity:', error);
        const recentActivityEl = document.getElementById('recentActivity');
        if (recentActivityEl) {
            recentActivityEl.innerHTML = '<div class="text-center text-danger">Error loading activity</div>';
        }
    }
}

// Initialize users page
function initializeUsersPage() {
    console.log(' Initializing users page...');
    loadUsers();
}

// Load users data
async function loadUsers() {
    try {
        console.log(' Loading users...');
        
        const response = await fetch('/api/admin/users', {
            method: 'GET',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log(' Users loaded:', result);
        
        if (result.success && result.data) {
            updateUsersTable(result.data.users || []);
        }
        
    } catch (error) {
        console.error(' Error loading users:', error);
        showError('Failed to load users data');
    }
}

// Update users table
function updateUsersTable(users) {
    const usersTableEl = document.getElementById('usersTable');
    if (!usersTableEl || !Array.isArray(users)) {
        return;
    }
    
    if (users.length === 0) {
        usersTableEl.innerHTML = '<tr><td colspan="6" class="text-center">No users found</td></tr>';
        return;
    }
    
    const usersHtml = users.map(user => `
        <tr>
            <td>${user.name || 'N/A'}</td>
            <td>${user.email || 'N/A'}</td>
            <td>${user.phone || 'N/A'}</td>
            <td>${formatDate(user.joinDate)}</td>
            <td>
                <span class="badge bg-${user.status === 'active' ? 'success' : 'secondary'}">
                    ${user.status || 'unknown'}
                </span>
            </td>
            <td>${user.totalBookings || 0}</td>
        </tr>
    `).join('');
    
    usersTableEl.innerHTML = usersHtml;
}

// Utility functions
function formatCurrency(amount) {
    try {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR'
        }).format(amount || 0);
    } catch (error) {
        return '₹' + (amount || 0).toLocaleString();
    }
}

function formatDateTime(dateString) {
    try {
        return new Date(dateString).toLocaleString('en-IN');
    } catch (error) {
        return dateString || 'N/A';
    }
}

function formatDate(dateString) {
    try {
        return new Date(dateString).toLocaleDateString('en-IN');
    } catch (error) {
        return dateString || 'N/A';
    }
}

function formatTime(dateString) {
    try {
        return new Date(dateString).toLocaleTimeString('en-IN', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    } catch (error) {
        return dateString || 'N/A';
    }
}

function getActivityStatusClass(status) {
    const classes = {
        'success': 'success',
        'error': 'danger',
        'warning': 'warning',
        'info': 'info',
        'primary': 'primary'
    };
    return classes[status] || 'secondary';
}

function showError(message) {
    console.error(' Error:', message);
    
    // Create error notification
    const notification = document.createElement('div');
    notification.className = 'alert alert-danger alert-dismissible fade show position-fixed';
    notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; max-width: 350px;';
    notification.innerHTML = `
        <strong>Error:</strong> ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);
}

function showSuccess(message) {
    console.log(' Success:', message);
    
    // Create success notification
    const notification = document.createElement('div');
    notification.className = 'alert alert-success alert-dismissible fade show position-fixed';
    notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; max-width: 350px;';
    notification.innerHTML = `
        <strong>Success:</strong> ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 3000);
}

// Parking page functions
function initializeParkingPage() {
    console.log(' Initializing parking page...');
    loadParkingData();
    loadParkingSpots();
}

async function loadParkingData() {
    try {
        console.log(' Loading parking data...');
        
        const response = await fetch('/api/admin/parking', {
            method: 'GET',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log(' Parking data loaded:', result);
        
        if (result.success) {
            // Handle the actual API response format
            const data = result.data || result;
            updateParkingStats(data);
        }
        
    } catch (error) {
        console.error(' Error loading parking data:', error);
        showError('Failed to load parking data');
    }
}

async function loadParkingSpots() {
    try {
        console.log(' Loading parking spots...');
        
        const response = await fetch('/api/admin/parking/spots', {
            method: 'GET',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log(' Parking spots loaded:', result);
        
        if (result.success && result.data) {
            updateParkingSpots(result.data.spots || []);
            updateParkingStats(result.data.summary || {});
        }
        
    } catch (error) {
        console.error(' Error loading parking spots:', error);
        showError('Failed to load parking spots data');
    }
}

function updateParkingStats(data) {
    try {
        console.log(' Updating parking stats:', data);
        
        // Update total spots
        const totalSpotsEl = document.getElementById('totalSpots');
        if (totalSpotsEl && (data.totalSpots !== undefined || data.total !== undefined)) {
            totalSpotsEl.textContent = (data.totalSpots || data.total || 0).toLocaleString();
        }
        
        // Update available spots
        const availableSpotsEl = document.getElementById('availableSpots');
        if (availableSpotsEl && (data.availableSpots !== undefined || data.available !== undefined)) {
            availableSpotsEl.textContent = (data.availableSpots || data.available || 0).toLocaleString();
        }
        
        // Update occupied spots
        const occupiedSpotsEl = document.getElementById('occupiedSpots');
        if (occupiedSpotsEl && (data.occupiedSpots !== undefined || data.occupied !== undefined)) {
            occupiedSpotsEl.textContent = (data.occupiedSpots || data.occupied || 0).toLocaleString();
        }
        
        // Update reserved spots
        const reservedSpotsEl = document.getElementById('reservedSpots');
        if (reservedSpotsEl && (data.reservedSpots !== undefined || data.reserved !== undefined)) {
            reservedSpotsEl.textContent = (data.reservedSpots || data.reserved || 0).toLocaleString();
        }
        
    } catch (error) {
        console.error(' Error updating parking stats:', error);
    }
}

function updateParkingSpots(spots) {
    try {
        console.log(' Updating parking spots table:', spots);
        
        const spotsTableEl = document.getElementById('spotsTable');
        if (!spotsTableEl || !Array.isArray(spots)) {
            return;
        }
        
        if (spots.length === 0) {
            spotsTableEl.innerHTML = '<tr><td colspan="7" class="text-center">No parking spots found</td></tr>';
            return;
        }
        
        const spotsHtml = spots.map(spot => {
            const statusClass = getSpotStatusClass(spot.status);
            const statusIcon = getSpotStatusIcon(spot.status);
            
            return `
                <tr>
                    <td>${spot.id}</td>
                    <td>${spot.level}</td>
                    <td>${spot.section}</td>
                    <td>${spot.number}</td>
                    <td>
                        <span class="badge bg-${statusClass}">
                            <i class="bi ${statusIcon}"></i> ${spot.status}
                        </span>
                    </td>
                    <td>${spot.vehicle || '-'}</td>
                    <td>${spot.customer || '-'}</td>
                </tr>
            `;
        }).join('');
        
        spotsTableEl.innerHTML = spotsHtml;
        
    } catch (error) {
        console.error(' Error updating parking spots table:', error);
    }
}

function getSpotStatusClass(status) {
    const classes = {
        'available': 'success',
        'occupied': 'danger',
        'reserved': 'warning',
        'maintenance': 'secondary'
    };
    return classes[status] || 'secondary';
}

function getSpotStatusIcon(status) {
    const icons = {
        'available': 'bi-check-circle',
        'occupied': 'bi-x-circle',
        'reserved': 'bi-clock',
        'maintenance': 'bi-tools'
    };
    return icons[status] || 'bi-info-circle';
}

async function refreshParkingData() {
    console.log(' Refreshing parking data...');
    await loadParkingData();
    await loadParkingSpots();
    showSuccess('Parking data refreshed successfully');
}

// Initialize specific pages based on URL
function initializePage() {
    const path = window.location.pathname;
    
    if (path.includes('/admin/dashboard')) {
        initializeDashboard();
    } else if (path.includes('/admin/users')) {
        initializeUsersPage();
    } else if (path.includes('/admin/parking')) {
        initializeParkingPage();
    }
}

// Global functions that templates can call
window.refreshDashboard = refreshDashboard;
window.refreshParkingData = refreshParkingData;
window.loadUsers = loadUsers;
window.loadParkingData = loadParkingData;
window.loadParkingSpots = loadParkingSpots;
window.showError = showError;
window.showSuccess = showSuccess;
window.initializePage = initializePage;

// Update the DOMContentLoaded to use the new initializePage function
document.addEventListener('DOMContentLoaded', function() {
    console.log(' Admin Dashboard DOM loaded, initializing page...');
    initializePage();
});

console.log(' Admin Dashboard JavaScript Loaded Successfully');
