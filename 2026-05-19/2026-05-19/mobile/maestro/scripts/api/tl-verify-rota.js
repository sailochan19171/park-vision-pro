const API = 'https://caring-generosity-production-2f27.up.railway.app/api/v1';
const response = http.get(API + '/rota?pageSize=50', {
  headers: { 'Authorization': 'Bearer ' + output.token }
});
const data = json(response.body);
const entries = data.data || [];
output.rotaCount = entries.length;
if (entries.length > 0) {
  output.lastRotaId = entries[0].id;
}
