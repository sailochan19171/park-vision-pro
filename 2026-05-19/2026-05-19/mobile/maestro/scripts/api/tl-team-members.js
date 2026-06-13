const API = 'https://caring-generosity-production-2f27.up.railway.app/api/v1';
const response = http.get(API + '/team/members', {
  headers: { 'Authorization': 'Bearer ' + output.token }
});
const data = json(response.body);
output.teamTotal = data.summary.total;
output.teamPresent = data.summary.present;
output.teamAbsent = data.summary.absent;
output.firstMemberName = data.members[0].name;
