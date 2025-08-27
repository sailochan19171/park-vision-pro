// User Dashboard JavaScript
document.addEventListener('DOMContentLoaded', function() {
    // Initialize tooltips
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
    
    // Auto-logout on token expiry
    const token = localStorage.getItem('userToken');
    if (token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const exp = payload.exp * 1000;
            const now = Date.now();
            
            if (now >= exp) {
                localStorage.removeItem('userToken');
                window.location.href = '/login';
            }
        } catch (error) {
            console.error('Token validation error:', error);
        }
    }
});

// Utility functions
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR'
    }).format(amount);
}

function formatDateTime(dateString) {
    return new Date(dateString).toLocaleString('en-IN');
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-IN');
}

function formatTime(dateString) {
    return new Date(dateString).toLocaleTimeString('en-IN', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; max-width: 350px;';
    notification.innerHTML = `
        <i class="bi bi-${getNotificationIcon(type)}"></i> ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);
}

function getNotificationIcon(type) {
    const icons = {
        'success': 'check-circle',
        'error': 'exclamation-triangle',
        'warning': 'exclamation-triangle',
        'info': 'info-circle',
        'danger': 'exclamation-triangle'
    };
    return icons[type] || 'info-circle';
}

// API helper functions
async function apiCall(endpoint, options = {}) {
    const token = localStorage.getItem('userToken');
    
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` })
        }
    };
    
    try {
        const response = await fetch(`http://localhost:3000${endpoint}`, {
            ...defaultOptions,
            ...options,
            headers: { ...defaultOptions.headers, ...options.headers }
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                // Token expired or invalid
                localStorage.removeItem('userToken');
                window.location.href = '/login';
                return;
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('API call failed:', error);
        throw error;
    }
}

// Form validation helpers
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function validatePhone(phone) {
    const re = /^[+]?[0-9]{10,15}$/;
    return re.test(phone.replace(/\s+/g, ''));
}

function validateLicensePlate(plate) {
    // Indian license plate formats
    const re = /^[A-Z]{2}[0-9]{2}[A-Z]{1,2}[0-9]{4}$/;
    return re.test(plate.replace(/\s+/g, ''));
}

// Loading states
function showLoading(element, text = 'Loading...') {
    if (typeof element === 'string') {
        element = document.getElementById(element);
    }
    
    if (element) {
        element.innerHTML = `
            <div class="d-flex justify-content-center align-items-center py-3">
                <div class="spinner-border spinner-border-sm text-primary me-2" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <span>${text}</span>
            </div>
        `;
    }
}

function hideLoading(element, content = '') {
    if (typeof element === 'string') {
        element = document.getElementById(element);
    }
    
    if (element) {
        element.innerHTML = content;
    }
}

// Location services
function getCurrentLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation is not supported'));
            return;
        }
        
        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy
                });
            },
            (error) => {
                reject(error);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 300000 // 5 minutes
            }
        );
    });
}

// Parking spot utilities
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

// Booking utilities
function getBookingStatusClass(status) {
    const classes = {
        'active': 'success',
        'pending': 'warning',
        'completed': 'info',
        'cancelled': 'secondary',
        'expired': 'danger'
    };
    return classes[status] || 'secondary';
}

function calculateDuration(startTime, endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const diff = Math.abs(end - start);
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}

// Payment utilities
function formatPaymentStatus(status) {
    const statuses = {
        'pending': 'Pending',
        'processing': 'Processing',
        'paid': 'Paid',
        'failed': 'Failed',
        'refunded': 'Refunded'
    };
    return statuses[status] || status;
}

function getPaymentStatusClass(status) {
    const classes = {
        'pending': 'warning',
        'processing': 'info',
        'paid': 'success',
        'failed': 'danger',
        'refunded': 'secondary'
    };
    return classes[status] || 'secondary';
}

// Vehicle utilities
function getVehicleTypeIcon(type) {
    const icons = {
        'car': 'bi-car-front',
        'suv': 'bi-truck',
        'motorcycle': 'bi-bicycle',
        'truck': 'bi-truck',
        'van': 'bi-truck'
    };
    return icons[type] || 'bi-car-front';
}

// Date/Time utilities
function isToday(date) {
    const today = new Date();
    const checkDate = new Date(date);
    return checkDate.toDateString() === today.toDateString();
}

function isThisWeek(date) {
    const today = new Date();
    const checkDate = new Date(date);
    const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
    const endOfWeek = new Date(today.setDate(today.getDate() - today.getDay() + 6));
    
    return checkDate >= startOfWeek && checkDate <= endOfWeek;
}

function timeAgo(date) {
    const now = new Date();
    const past = new Date(date);
    const diff = now - past;
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
}

// Error handling
window.onerror = function(msg, url, lineNo, columnNo, error) {
    console.error('JavaScript Error:', {
        message: msg,
        source: url,
        line: lineNo,
        column: columnNo,
        error: error
    });
    
    // Don't show error notification for minor issues
    if (msg.toLowerCase().includes('network')) {
        showNotification('Network error. Please check your connection.', 'warning');
    }
    
    return false;
};

// Initialize common functionality
document.addEventListener('DOMContentLoaded', function() {
    // Set up CSRF token if available
    const csrfToken = document.querySelector('meta[name="csrf-token"]');
    if (csrfToken) {
        window.csrfToken = csrfToken.getAttribute('content');
    }
    
    // Auto-save form data to localStorage (for better UX)
    const forms = document.querySelectorAll('form[data-autosave]');
    forms.forEach(form => {
        const inputs = form.querySelectorAll('input, textarea, select');
        inputs.forEach(input => {
            // Load saved data
            const saved = localStorage.getItem(`form_${form.id}_${input.name}`);
            if (saved && !input.value) {
                input.value = saved;
            }
            
            // Save on change
            input.addEventListener('change', () => {
                localStorage.setItem(`form_${form.id}_${input.name}`, input.value);
            });
        });
        
        // Clear saved data on successful submit
        form.addEventListener('submit', () => {
            setTimeout(() => {
                inputs.forEach(input => {
                    localStorage.removeItem(`form_${form.id}_${input.name}`);
                });
            }, 1000);
        });
    });
});