const API = 'https://caring-generosity-production-2f27.up.railway.app/api/v1';
const response = http.get(API + '/orders?pageSize=5', {
  headers: { 'Authorization': 'Bearer ' + output.token }
});
const data = json(response.body);
const orders = data.data || [];
output.orderCount = data.pagination ? data.pagination.total : orders.length;
if (orders.length > 0) {
  output.latestOrderTotal = parseFloat(orders[0].totalAmount || '0');
  output.latestOrderLines = orders[0].linesCount || 0;
  output.latestOrderId = orders[0].id;
}
