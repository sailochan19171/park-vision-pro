/**
 * VayAccess Parking System Setup Script
 * Run this script to set up the complete parking management system
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
    console.log('\n' + '='.repeat(60));
    log(title, 'bold');
    console.log('='.repeat(60));
}

async function checkPrerequisites() {
    logSection('🔍 Checking Prerequisites');
    
    try {
        // Check Node.js version
        const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
        const majorVersion = parseInt(nodeVersion.substring(1).split('.')[0]);
        
        if (majorVersion < 16) {
            throw new Error(`Node.js v16 or higher required. Current: ${nodeVersion}`);
        }
        log(`✅ Node.js version: ${nodeVersion}`, 'green');
        
        // Check npm
        const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
        log(`✅ npm version: v${npmVersion}`, 'green');
        
        // Check if MongoDB is running
        try {
            const { MongoClient } = require('mongodb');
            const client = new MongoClient('mongodb://localhost:27017');
            await client.connect();
            await client.db('test').admin().ping();
            await client.close();
            log('✅ MongoDB connection successful', 'green');
        } catch (mongoError) {
            log('⚠️  MongoDB not accessible. Please ensure MongoDB is installed and running.', 'yellow');
            log('   Installation guide: https://docs.mongodb.com/manual/installation/', 'yellow');
        }
        
    } catch (error) {
        log(`❌ Prerequisite check failed: ${error.message}`, 'red');
        process.exit(1);
    }
}

function createDirectoryStructure() {
    logSection('📁 Creating Directory Structure');
    
    const directories = [
        'public',
        'public/css',
        'public/js',
        'public/images',
        'public/uploads',
        'views',
        'views/layouts',
        'views/admin',
        'views/user',
        'views/partials',
        'templates',
        'templates/emails',
        'logs'
    ];
    
    directories.forEach(dir => {
        const fullPath = path.join(process.cwd(), dir);
        if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
            log(`✅ Created directory: ${dir}`, 'green');
        } else {
            log(`✓ Directory exists: ${dir}`, 'cyan');
        }
    });
}

function createEnvironmentFile() {
    logSection('⚙️ Setting up Environment Configuration');
    
    const envPath = path.join(process.cwd(), '.env');
    
    if (fs.existsSync(envPath)) {
        log('✓ .env file already exists', 'cyan');
        return;
    }
    
    if (!fs.existsSync('.env.example')) {
        log('❌ .env.example file not found', 'red');
        return;
    }
    
    try {
        fs.copyFileSync('.env.example', '.env');
        log('✅ Created .env file from .env.example', 'green');
        log('📝 Please update the .env file with your configuration:', 'yellow');
        log('   - Database connection string', 'yellow');
        log('   - JWT secrets (use strong, unique values)', 'yellow');
        log('   - Email service credentials (optional)', 'yellow');
        log('   - LPR service configuration (optional)', 'yellow');
    } catch (error) {
        log(`❌ Failed to create .env file: ${error.message}`, 'red');
    }
}

function installDependencies() {
    logSection('📦 Installing Dependencies');
    
    try {
        log('Installing npm packages...', 'cyan');
        execSync('npm install', { stdio: 'inherit' });
        log('✅ Dependencies installed successfully', 'green');
    } catch (error) {
        log('❌ Failed to install dependencies', 'red');
        log('Please run: npm install', 'yellow');
        process.exit(1);
    }
}

function createStaticFiles() {
    logSection('🎨 Creating Static Files');
    
    // Create basic CSS file
    const adminCSS = `
/* Admin Dashboard Styles */
body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background-color: #f8f9fa;
}

.border-left-primary {
    border-left: 4px solid #2563eb !important;
}

.border-left-success {
    border-left: 4px solid #10b981 !important;
}

.border-left-info {
    border-left: 4px solid #0ea5e9 !important;
}

.border-left-warning {
    border-left: 4px solid #f59e0b !important;
}

.progress-sm {
    height: 0.5rem;
}

.chart-area {
    position: relative;
    height: 300px;
}

.navbar-brand i {
    margin-right: 8px;
}

.nav-link i {
    margin-right: 6px;
}

.card {
    box-shadow: 0 0.15rem 1.75rem 0 rgba(33, 40, 50, 0.15);
    border: none;
}

.text-xs {
    font-size: 0.7rem;
}

.font-weight-bold {
    font-weight: 700;
}

@media (max-width: 768px) {
    .navbar-nav .nav-link {
        padding: 0.5rem 1rem;
    }
}
`;
    
    fs.writeFileSync(path.join('public', 'css', 'admin.css'), adminCSS);
    log('✅ Created admin.css', 'green');
    
    // Create basic JavaScript file
    const adminJS = `
// Admin Dashboard JavaScript
document.addEventListener('DOMContentLoaded', function() {
    // Initialize tooltips
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
    
    // Auto-logout on token expiry
    const token = localStorage.getItem('adminToken');
    if (token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const exp = payload.exp * 1000;
            const now = Date.now();
            
            if (now >= exp) {
                localStorage.removeItem('adminToken');
                window.location.href = '/admin/login';
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

function showNotification(message, type = 'info') {
    // Simple notification system
    const notification = document.createElement('div');
    notification.className = \`alert alert-\${type} alert-dismissible fade show position-fixed\`;
    notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; max-width: 300px;';
    notification.innerHTML = \`
        \${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    \`;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);
}

// API helper functions
async function apiCall(endpoint, options = {}) {
    const token = localStorage.getItem('adminToken');
    
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': \`Bearer \${token}\` })
        }
    };
    
    try {
        const response = await fetch(\`http://localhost:3000\${endpoint}\`, {
            ...defaultOptions,
            ...options,
            headers: { ...defaultOptions.headers, ...options.headers }
        });
        
        if (!response.ok) {
            throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('API call failed:', error);
        throw error;
    }
}
`;
    
    fs.writeFileSync(path.join('public', 'js', 'admin.js'), adminJS);
    log('✅ Created admin.js', 'green');
}

async function seedDatabase() {
    logSection('🌱 Seeding Database');
    
    try {
        log('Creating sample data...', 'cyan');
        execSync('node utils/seedDatabase.js', { stdio: 'inherit' });
        log('✅ Database seeded successfully', 'green');
    } catch (error) {
        log('⚠️  Database seeding failed. You can run it manually later with:', 'yellow');
        log('   npm run seed', 'yellow');
    }
}

function displaySuccessMessage() {
    logSection('🎉 Setup Complete!');
    
    log('VayAccess Parking Management System is ready!', 'green');
    console.log('\n');
    
    log('🚀 To start the system:', 'blue');
    log('   npm run dev:all     # Start all services in development mode', 'cyan');
    log('   # OR start individually:', 'cyan');
    log('   npm run dev         # API Server (Port 3000)', 'cyan');
    log('   npm run dev:admin   # Admin Dashboard (Port 3001)', 'cyan');
    log('   npm run dev:user    # User Dashboard (Port 3002)', 'cyan');
    console.log('\n');
    
    log('🔗 Access URLs:', 'blue');
    log('   API Server:      http://localhost:3000', 'cyan');
    log('   Admin Dashboard: http://localhost:3001', 'cyan');
    log('   User Dashboard:  http://localhost:3002', 'cyan');
    console.log('\n');
    
    log('👤 Default Admin Credentials:', 'blue');
    log('   Email:    admin@vayaccess.com', 'cyan');
    log('   Password: Admin@123', 'cyan');
    console.log('\n');
    
    log('📚 Next Steps:', 'blue');
    log('   1. Update .env file with your configuration', 'yellow');
    log('   2. Configure MongoDB connection string', 'yellow');
    log('   3. Set up email service credentials (optional)', 'yellow');
    log('   4. Configure LPR service API (optional)', 'yellow');
    log('   5. Start the system with npm run dev:all', 'yellow');
    console.log('\n');
    
    log('📖 Documentation: Check README.md for detailed information', 'blue');
    log('❓ Support: support@vayaccess.com', 'blue');
}

async function main() {
    try {
        console.clear();
        log('🚗 VayAccess Smart Parking Management System Setup', 'bold');
        log('Setting up your complete parking management solution...', 'cyan');
        
        await checkPrerequisites();
        createDirectoryStructure();
        createEnvironmentFile();
        installDependencies();
        createStaticFiles();
        
        // Ask user if they want to seed the database
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        const seedAnswer = await new Promise((resolve) => {
            rl.question('\n🌱 Would you like to seed the database with sample data? (y/N): ', (answer) => {
                resolve(answer.toLowerCase().trim());
            });
        });
        
        rl.close();
        
        if (seedAnswer === 'y' || seedAnswer === 'yes') {
            await seedDatabase();
        } else {
            log('⏭️  Database seeding skipped. Run "npm run seed" later if needed.', 'yellow');
        }
        
        displaySuccessMessage();
        
    } catch (error) {
        log(`\n❌ Setup failed: ${error.message}`, 'red');
        process.exit(1);
    }
}

// Handle process interruption
process.on('SIGINT', () => {
    log('\n⚠️  Setup interrupted by user', 'yellow');
    process.exit(1);
});

process.on('uncaughtException', (error) => {
    log(`\n❌ Unexpected error: ${error.message}`, 'red');
    process.exit(1);
});

// Run setup
main();