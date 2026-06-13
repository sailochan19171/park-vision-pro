const API = 'https://caring-generosity-production-2f27.up.railway.app/api/v1';
const response = http.post(API + '/auth/login', {
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'demo', password: 'farmley123' })
});
const data = json(response.body);
output.token = data.accessToken;
output.userCode = data.user.code;
