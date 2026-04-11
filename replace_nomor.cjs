const fs = require('fs');
const files = ['components/AdminDashboard.tsx', 'components/SuperAdminDashboard.tsx', 'services/mockStore.ts'];

files.forEach(file => {
    if (fs.existsSync(file)) {
        let content = fs.readFileSync(file, 'utf8');
        content = content.replace(/nomor_peserta/g, 'nomorPeserta');
        fs.writeFileSync(file, content);
        console.log('Updated ' + file);
    }
});
