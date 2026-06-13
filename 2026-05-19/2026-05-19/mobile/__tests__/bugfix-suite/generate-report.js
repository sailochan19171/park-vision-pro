#!/usr/bin/env node
/**
 * Generates a clean, static HTML test report from Jest JSON output.
 * Usage: npx jest --json | node generate-report.js
 */
const fs = require('fs');

  const data = JSON.parse(fs.readFileSync(__dirname + '/report/results.json', 'utf-8'));
  {
  const now = new Date().toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' });

  const totalPassed = data.numPassedTests;
  const totalFailed = data.numFailedTests;
  const totalTests = data.numTotalTests;
  const totalSuites = data.numTotalTestSuites;
  const passedSuites = data.numPassedTestSuites;
  const duration = (data.testResults.reduce((s, r) => s + (r.endTime - r.startTime), 0) / 1000).toFixed(1);

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Farmley SFA v2 - Bug Fix Test Report</title>
<style>
body { font-family: Segoe UI, Arial, sans-serif; margin: 0; padding: 20px; background: #f8f9fa; color: #333; }
.header { background: linear-gradient(135deg, #1a3a8f, #2563eb); color: white; padding: 30px; border-radius: 12px; margin-bottom: 24px; }
.header h1 { margin: 0 0 8px 0; font-size: 24px; }
.header p { margin: 0; opacity: 0.85; font-size: 14px; }
.summary { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
.summary-card { flex: 1; min-width: 120px; background: white; border-radius: 10px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); text-align: center; }
.summary-card .num { font-size: 36px; font-weight: 800; }
.summary-card .label { font-size: 13px; color: #6b7280; margin-top: 4px; }
.pass { color: #16a34a; } .fail { color: #dc2626; }
.suite { background: white; border-radius: 10px; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); overflow: hidden; }
.suite-header { padding: 16px 20px; font-weight: 700; font-size: 15px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; }
.suite-header .badge { font-size: 12px; padding: 4px 12px; border-radius: 20px; font-weight: 600; }
.badge-pass { background: #dcfce7; color: #16a34a; } .badge-fail { background: #fef2f2; color: #dc2626; }
.test-group { padding: 0 20px; }
.test-group-title { font-size: 13px; font-weight: 700; color: #1a3a8f; padding: 12px 0 6px 0; border-bottom: 1px solid #f3f4f6; text-transform: uppercase; letter-spacing: 0.5px; }
.test { display: flex; align-items: center; padding: 8px 0; border-bottom: 1px solid #f9fafb; font-size: 13px; }
.test:last-child { border-bottom: none; }
.test .icon { width: 22px; font-size: 16px; flex-shrink: 0; }
.test .name { flex: 1; }
.test .time { font-size: 11px; color: #9ca3af; width: 60px; text-align: right; }
.footer { text-align: center; padding: 20px; font-size: 12px; color: #9ca3af; }
</style></head><body>`;

  html += `<div class="header">
<h1>Farmley SFA v2 — Bug Fix Verification Report</h1>
<p>Generated: ${now} | Framework: Jest (Node.js) | Duration: ${duration}s | By: A. Sai Lochan</p>
</div>`;

  html += `<div class="summary">
<div class="summary-card"><div class="num">${totalTests}</div><div class="label">Total Tests</div></div>
<div class="summary-card"><div class="num pass">${totalPassed}</div><div class="label">Passed</div></div>
<div class="summary-card"><div class="num fail">${totalFailed}</div><div class="label">Failed</div></div>
<div class="summary-card"><div class="num">${passedSuites}/${totalSuites}</div><div class="label">Suites Passed</div></div>
</div>`;

  for (const suite of data.testResults) {
    const parts = suite.name.replace(/\\/g, '/').split('/');
    const name = parts[parts.length - 1].replace('.test.ts', '');
    const tests = suite.assertionResults || [];
    const numPassing = tests.filter(t => t.status === 'passed').length;
    const numFailing = tests.filter(t => t.status === 'failed').length;
    const allPass = numFailing === 0;
    const total = numPassing + numFailing;

    html += `<div class="suite">`;
    html += `<div class="suite-header">${name} <span class="badge ${allPass ? 'badge-pass' : 'badge-fail'}">${numPassing}/${total} passed</span></div>`;

    let currentGroup = '';
    for (const t of tests) {
      const group = t.ancestorTitles.join(' > ');
      if (group !== currentGroup) {
        if (currentGroup) html += `</div>`;
        currentGroup = group;
        html += `<div class="test-group"><div class="test-group-title">${group}</div>`;
      }
      const icon = t.status === 'passed' ? '&#9989;' : '&#10060;';
      const ms = t.duration ? t.duration + 'ms' : '';
      html += `<div class="test"><span class="icon">${icon}</span><span class="name">${t.title}</span><span class="time">${ms}</span></div>`;
    }
    if (currentGroup) html += `</div>`;
    html += `</div>`;
  }

  html += `<div class="footer">Farmley SFA v2 Mobile App — Bug Fix Verification Test Suite | Jest Framework</div>`;
  html += `</body></html>`;

  const outPath = __dirname + '/report/Bug_Fix_Test_Report.html';
  fs.writeFileSync(outPath, html);
  console.log('Report written:', outPath);
  console.log(`Total: ${totalTests} tests, ${totalPassed} passed, ${totalFailed} failed`);
  }
