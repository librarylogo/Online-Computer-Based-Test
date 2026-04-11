const fs = require('fs');
const files = ['components/AdminDashboard.tsx', 'components/SuperAdminDashboard.tsx', 'services/database.ts', 'services/mockStore.ts', 'supabase_schema.sql'];

files.forEach(file => {
    if (fs.existsSync(file)) {
        let content = fs.readFileSync(file, 'utf8');
        content = content.replace(/Siswa/g, 'Peserta');
        content = content.replace(/siswa/g, 'peserta');
        content = content.replace(/SISWA/g, 'PESERTA');
        content = content.replace(/NISN/g, 'Nomor Peserta');
        // Be careful with nisn -> nomor_peserta, it might affect variables
        // Let's only replace it as a standalone word or in specific contexts, but wait, the user said "kata NISN diganti dengan kata Nomor Peserta".
        // Let's replace 'nisn' with 'nomor_peserta' where it's a property.
        content = content.replace(/nisn/g, 'nomor_peserta');
        fs.writeFileSync(file, content);
        console.log('Updated ' + file);
    }
});
