import api from '../../api/client';

/**
 * Service for Notification-related API calls.
 * Mirrors the 'notifications' microservice on the backend.
 */
export const notificationService = {
  async getNotifications() {
    return api.get('/notifications');
  },

  async markAsRead(id: string) {
    return api.post(`/notifications/${id}/read`);
  },

  async registerDeviceToken(token: string, platform: string) {
    return api.post('/notifications/register', { token, platform });
  }
};
