const API = 'https://caring-generosity-production-2f27.up.railway.app/api/v1';
const response = http.get(API + '/team/location-approvals', {
  headers: { 'Authorization': 'Bearer ' + output.token }
});
const data = json(response.body);
output.pendingCount = data.counts ? data.counts.pending : 0;
output.approvedCount = data.counts ? data.counts.approved : 0;
output.rejectedCount = data.counts ? data.counts.rejected : 0;
output.totalApprovals = output.pendingCount + output.approvedCount + output.rejectedCount;
