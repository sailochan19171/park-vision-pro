const API = 'https://caring-generosity-production-2f27.up.railway.app/api/v1';
const response = http.get(API + '/store-checks?pageSize=5', {
  headers: { 'Authorization': 'Bearer ' + output.token }
});
const data = json(response.body);
output.storeCheckCount = data.pagination ? data.pagination.total : 0;
