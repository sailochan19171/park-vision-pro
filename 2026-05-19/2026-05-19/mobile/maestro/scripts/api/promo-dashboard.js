const API = 'https://caring-generosity-production-2f27.up.railway.app/api/v1';
const response = http.get(API + '/dashboard/summary', {
  headers: { 'Authorization': 'Bearer ' + output.token }
});
const data = json(response.body);
output.activeUsers = data.activeUsers || 0;
output.totalOrders = data.totalOrders || 0;
