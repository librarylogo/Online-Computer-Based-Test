
// Versi aplikasi saat ini. Ubah string ini setiap kali Anda melakukan deploy besar
// agar aplikasi otomatis membersihkan cache di browser pengguna.
const CURRENT_APP_VERSION = '1.0.1'; 
const VERSION_KEY = 'das_app_version';

export const cacheManager = {
  /**
   * Dijalankan saat aplikasi pertama kali load (App.tsx).
   * Memeriksa apakah versi aplikasi berubah. Jika ya, hapus semua cache.
   */
  initialize: () => {
    try {
      const storedVersion = localStorage.getItem(VERSION_KEY);
      
      if (storedVersion !== CURRENT_APP_VERSION) {
        console.log(`New version detected (${CURRENT_APP_VERSION}). Cleaning cache...`);
        
        // Simpan setting tertentu jika perlu (opsional), sisanya hapus
        // Dalam kasus ini, kita hapus bersih untuk keamanan dan performa
        localStorage.clear();
        sessionStorage.clear();
        
        // Hapus cache storage (Service Workers) jika ada
        if ('caches' in window) {
          caches.keys().then((names) => {
            names.forEach((name) => {
              caches.delete(name);
            });
          });
        }

        // Set versi baru
        localStorage.setItem(VERSION_KEY, CURRENT_APP_VERSION);
        console.log('Cache cleaned successfully.');
      } else {
        console.log('App is up to date.');
      }
    } catch (e) {
      console.error('Error managing cache:', e);
    }
  },

  /**
   * Panggil fungsi ini saat user logout untuk memastikan data sensitif hilang
   */
  clearSession: () => {
    try {
      // Hapus data session spesifik
      sessionStorage.clear();
      
      // Kita bisa memilih key mana yang dihapus di localStorage, atau hapus semua kecuali versi
      const currentVersion = localStorage.getItem(VERSION_KEY);
      localStorage.clear();
      if (currentVersion) {
        localStorage.setItem(VERSION_KEY, currentVersion);
      }
    } catch (e) {
      console.error('Error clearing session:', e);
    }
  }
};
