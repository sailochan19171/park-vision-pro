const API = 'https://caring-generosity-production-2f27.up.railway.app/api/v1';
if (output.lastRotaId) {
  const response = http.request(API + '/rota/' + output.lastRotaId, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + output.token }
  });
  output.cleanupStatus = response.status;
} else {
  output.cleanupStatus = 'skipped';
}
