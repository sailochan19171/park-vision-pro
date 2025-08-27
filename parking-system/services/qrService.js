/**
 * QR Code Service
 * Handles QR code generation for parking tickets and access tokens
 */

class QRService {
  constructor() {
    this.baseUrl = process.env.APP_URL || 'http://localhost:3002';
  }

  /**
   * Generate QR code data for parking ticket
   */
  generateParkingTicketQR(bookingId, spotNumber, vehiclePlate) {
    const qrData = {
      type: 'parking_ticket',
      bookingId,
      spotNumber,
      vehiclePlate,
      timestamp: new Date().toISOString(),
      url: `${this.baseUrl}/ticket/${bookingId}`
    };
    
    return JSON.stringify(qrData);
  }

  /**
   * Generate QR code data for vehicle entry
   */
  generateVehicleEntryQR(vehicleId, licensePlate) {
    const qrData = {
      type: 'vehicle_entry',
      vehicleId,
      licensePlate,
      timestamp: new Date().toISOString(),
      url: `${this.baseUrl}/entry/${vehicleId}`
    };
    
    return JSON.stringify(qrData);
  }

  /**
   * Generate QR code data for spot access
   */
  generateSpotAccessQR(spotId, spotNumber) {
    const qrData = {
      type: 'spot_access',
      spotId,
      spotNumber,
      timestamp: new Date().toISOString(),
      url: `${this.baseUrl}/spot/${spotId}`
    };
    
    return JSON.stringify(qrData);
  }

  /**
   * Generate QR code data for payment
   */
  generatePaymentQR(bookingId, amount, currency = 'INR') {
    const qrData = {
      type: 'payment',
      bookingId,
      amount,
      currency,
      timestamp: new Date().toISOString(),
      url: `${this.baseUrl}/payment/${bookingId}`
    };
    
    return JSON.stringify(qrData);
  }

  /**
   * Verify QR code data
   */
  verifyQRData(qrString) {
    try {
      const qrData = JSON.parse(qrString);
      
      // Basic validation
      if (!qrData.type || !qrData.timestamp) {
        return { valid: false, error: 'Invalid QR code format' };
      }
      
      // Check if QR code is not too old (24 hours)
      const qrTime = new Date(qrData.timestamp);
      const now = new Date();
      const hoursDiff = (now - qrTime) / (1000 * 60 * 60);
      
      if (hoursDiff > 24) {
        return { valid: false, error: 'QR code has expired' };
      }
      
      return { valid: true, data: qrData };
    } catch (error) {
      return { valid: false, error: 'Invalid QR code data' };
    }
  }

  /**
   * Generate access token for temporary access
   */
  generateAccessToken(userId, duration = 3600) { // 1 hour default
    const tokenData = {
      type: 'access_token',
      userId,
      expiresAt: new Date(Date.now() + duration * 1000).toISOString(),
      timestamp: new Date().toISOString()
    };
    
    return JSON.stringify(tokenData);
  }

  /**
   * Mock QR code generation URL (would use actual QR library in production)
   */
  generateQRCodeUrl(data, size = 200) {
    // In production, you would use a library like 'qrcode' to generate actual QR codes
    // For now, we'll return a mock URL that could be used with online QR generators
    const encodedData = encodeURIComponent(data);
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodedData}`;
  }

  /**
   * Generate vehicle exit QR
   */
  generateVehicleExitQR(vehicleLogId, licensePlate, parkingSpot) {
    const qrData = {
      type: 'vehicle_exit',
      vehicleLogId,
      licensePlate,
      parkingSpot,
      timestamp: new Date().toISOString(),
      url: `${this.baseUrl}/exit/${vehicleLogId}`
    };
    
    return JSON.stringify(qrData);
  }
}

// Export singleton instance
module.exports = new QRService();