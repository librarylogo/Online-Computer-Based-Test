const fs = require('fs');
const file = 'services/database.ts';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/'nomor_peserta'/g, "'nisn'");
content = content.replace(/\.nomor_peserta/g, ".nisn");
content = content.replace(/nomor_peserta:/g, "nisn:");
fs.writeFileSync(file, content);
console.log('Updated ' + file);
