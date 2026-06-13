const fs = require('fs');

const path = 'D:/pepsico dubai/farmley-sfa-v2/mobile/src/services/syncService.ts';
let code = fs.readFileSync(path, 'utf8');

// We want to replace `rec._raw.field = value;` with `rec._setRaw('field', value);`
// But ONLY inside prepareUpdate blocks!
// Since rec._raw is also used in prepareCreate, and prepareCreate does NOT need _setRaw (it needs _raw).
// So we can use a regex that matches `prepareUpdate((rec: any) => { ... })` and replaces inside it.

code = code.replace(/prepareUpdate\(\(rec:\s*any\)\s*=>\s*\{([\s\S]*?)\}\)/g, (match, body) => {
    const newBody = body.replace(/rec\._raw\.([a-zA-Z0-9_]+)\s*=\s*(.*?);/g, "rec._setRaw('$1', $2);");
    return `prepareUpdate((rec: any) => {${newBody}})`;
});

fs.writeFileSync(path, code, 'utf8');
console.log('Fixed syncService.ts');
