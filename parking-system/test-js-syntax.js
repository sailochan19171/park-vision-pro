// Test JavaScript syntax from vehicles.handlebars

document.addEventListener('DOMContentLoaded', function() {
    loadVehiclesData();
    
    // Add event listener for the add vehicle button
    const addVehicleBtn = document.getElementById('addVehicleBtn');
    if (addVehicleBtn) {
        addVehicleBtn.addEventListener('click', addVehicle);
    }
    
    // Accessibility/focus management for the modal
    const modalEl = document.getElementById('addVehicleModal');
    const triggerBtn = document.querySelector('[data-bs-target="#addVehicleModal"]');
    if (modalEl) {
        modalEl.addEventListener('show.bs.modal', () => {
            setTimeout(() => document.getElementById('plateNumber')?.focus(), 0);
        });
        modalEl.addEventListener('hide.bs.modal', () => {
            if (modalEl.contains(document.activeElement)) {
                document.activeElement.blur();
            }
        });
        modalEl.addEventListener('hidden.bs.modal', () => {
            triggerBtn?.focus();
        });
    }
    
    // Ensure addVehicle function is globally available
    window.addVehicle = addVehicle;
});

async function loadVehiclesData() {
    try {
        const response = await fetch('/api/admin/vehicles', {
            credentials: 'same-origin'
        });
        const result = await response.json();
        
        if (result.success) {
            const vehicles = result.vehicles || [];
            
            // Calculate stats from vehicles data
            const totalVehicles = vehicles.length;
            const cars = vehicles.filter(v => v.type && v.type.toLowerCase() === 'car').length;
            const bikes = vehicles.filter(v => v.type && v.type.toLowerCase() === 'bike').length;
            const suvs = vehicles.filter(v => v.type && v.type.toLowerCase() === 'suv').length;
            
            // Update stats cards
            document.getElementById('totalVehicles').textContent = totalVehicles.toLocaleString();
            document.getElementById('totalCars').textContent = cars.toLocaleString();
            document.getElementById('totalBikes').textContent = bikes.toLocaleString();
            document.getElementById('totalSuvs').textContent = suvs.toLocaleString();
            
            // Update vehicles table
            const tableBody = document.getElementById('vehiclesTableBody');
            if (tableBody) {
                const vehiclesHtml = vehicles.map(vehicle => {
                    return (
                        `<tr>
                            <td>${vehicle.id.substring(0, 8)}...</td>
                            <td><strong>${vehicle.licensePlate}</strong></td>
                            <td>${vehicle.owner ? vehicle.owner.name : 'Unknown'}</td>
                            <td>
                                <span class="badge bg-secondary">${vehicle.type || 'Unknown'}</span>
                            </td>
                            <td>${vehicle.model || 'N/A'}</td>
                            <td>${vehicle.color || 'N/A'}</td>
                            <td>${new Date(vehicle.createdAt).toLocaleDateString()}</td>
                            <td>
                                <span class="badge bg-${vehicle.status === 'active' ? 'success' : 'danger'}">
                                    ${vehicle.status || 'unknown'}
                                </span>
                            </td>
                            <td>
                                <div class="btn-group" role="group">
                                    <button type="button" class="btn btn-sm btn-outline-primary">
                                        <i class="bi bi-eye"></i>
                                    </button>
                                    <button type="button" class="btn btn-sm btn-outline-warning">
                                        <i class="bi bi-pencil"></i>
                                    </button>
                                    <button type="button" class="btn btn-sm btn-outline-danger">
                                        <i class="bi bi-trash"></i>
                                    </button>
                                </div>
                            </td>
                        </tr>`
                    );
                }).join('');
                
                tableBody.innerHTML = vehiclesHtml;
            }
            
        } else {
            console.error('Failed to load vehicles data');
        }
        
    } catch (error) {
        console.error('Error loading vehicles data:', error);
    }
}

async function exportVehicles() {
    try {
        const response = await fetch('/api/admin/vehicles', {
            credentials: 'same-origin'
        });
        const result = await response.json();
        
        if (result.success) {
            const vehicles = result.vehicles;
            
            // Create CSV content
            const headers = ['ID', 'Plate Number', 'Owner', 'Type', 'Model', 'Color', 'Registered', 'Status'];
            const csvContent = [
                headers.join(','),
                ...vehicles.map(vehicle => [
                    vehicle.id.substring(0, 8),
                    vehicle.licensePlate || 'N/A',
                    vehicle.owner ? vehicle.owner.name : 'Unknown',
                    vehicle.type || 'Unknown',
                    vehicle.model || 'N/A',
                    vehicle.color || 'N/A',
                    new Date(vehicle.createdAt).toLocaleDateString(),
                    vehicle.status || 'unknown'
                ].join(','))
            ].join('\n');
            
            // Download CSV file
            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `vehicles_export_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            showNotification('Vehicles exported successfully!', 'success');
        }
    } catch (error) {
        console.error('Error exporting vehicles:', error);
        showError('Failed to export vehicles');
    }
}

async function addVehicle() {
    const form = document.getElementById('addVehicleForm');
    
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    try {
        const plateNumber = document.getElementById('plateNumber').value.trim();
        const ownerName = document.getElementById('owner').value.trim();
        const type = document.getElementById('type').value;
        const model = document.getElementById('model').value.trim();
        const color = document.getElementById('color').value.trim();
        
        // First, find or create the owner user
        let ownerId = await findOrCreateOwner(ownerName);
        
        const vehicleData = {
            licensePlate: plateNumber,
            make: model.split(' ')[0] || 'Unknown',
            model: model,
            color,
            type: type.toLowerCase(),
            ownerId
        };
        
        const response = await fetch('/api/admin/vehicles', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(vehicleData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(result.message || 'Vehicle added successfully!', 'success');
            
            // Close modal (blur focus first to avoid aria-hidden focus warning)
            const modalEl = document.getElementById('addVehicleModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) {
                if (modalEl.contains(document.activeElement)) {
                    document.activeElement.blur();
                }
                modal.hide();
            }
            
            // Reset form
            form.reset();
            
            // Refresh vehicles list
            loadVehiclesData();
        } else {
            throw new Error(result.message || 'Failed to add vehicle');
        }
    } catch (error) {
        console.error('Error adding vehicle:', error);
        showError('Error adding vehicle: ' + error.message);
    }
}

async function findOrCreateOwner(ownerName) {
    try {
        // Try to find existing user by name
        const usersResponse = await fetch('/api/admin/users', {
            credentials: 'same-origin'
        });
        const usersResult = await usersResponse.json();
        
        if (usersResult.success) {
            const existingUser = usersResult.users.find(user => 
                user.name.toLowerCase() === ownerName.toLowerCase()
            );
            
            if (existingUser) {
                return existingUser.id;
            } else {
                // Create new user if not found
                const newUserResponse = await fetch('/api/admin/users', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: ownerName,
                        email: `${ownerName.toLowerCase().replace(/\s+/g, '.')}@example.com`,
                        phone: '0000000000',
                        role: 'user',
                        password: 'DefaultPass123',
                        status: 'active'
                    })
                });
                
                const newUserResult = await newUserResponse.json();
                if (newUserResult.success) {
                    return newUserResult.user.id;
                } else {
                    throw new Error('Failed to create owner user');
                }
            }
        }
        throw new Error('Failed to fetch users');
    } catch (userError) {
        throw new Error('Failed to process owner information: ' + userError.message);
    }
}

function showNotification(message, type = 'info') {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    alert.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
    alert.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.appendChild(alert);
    
    setTimeout(() => {
        if (alert.parentElement) {
            alert.remove();
        }
    }, 5000);
}

function showError(message) {
    showNotification(message, 'danger');
}