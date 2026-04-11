import React, { useState, useEffect } from 'react';
import { User, UserRole, AppSettings } from '../types';
import { db } from '../services/database'; // SWITCHED TO REAL DB
import { Users, LogOut, Shield, UserPlus, Trash2, Edit, Search, LayoutDashboard, Palette, Save, AlertTriangle, Speaker, Clock, Upload, Image as ImageIcon, Link } from 'lucide-react';

interface Props {
    user: User;
    onLogout: () => void;
    settings: AppSettings;
    onSettingsChange: () => void;
}

export const SuperAdminDashboard: React.FC<Props> = ({ user, onLogout, settings, onSettingsChange }) => {
    const [users, setUsers] = useState<User[]>([]);
    const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'USERS' | 'THEME' | 'ANTI_CHEAT' | 'WAKTU_SESI'>('DASHBOARD');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);
    const [confirmModal, setConfirmModal] = useState<{message: string, onConfirm: () => void} | null>(null);

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const showConfirm = (message: string, onConfirm: () => void) => {
        setConfirmModal({ message, onConfirm });
    };
    
    // Theme State
    const [primaryColor, setPrimaryColor] = useState(settings.themeColor);
    const [gradientEnd, setGradientEnd] = useState(settings.gradientEndColor);
    const [logoStyle, setLogoStyle] = useState<'circle' | 'rect_4_3' | 'rect_3_4_vert'>(settings.logoStyle);
    const [logoUrl, setLogoUrl] = useState<string | undefined>(settings.schoolLogoUrl);

    // Anti Cheat State
    const [acActive, setAcActive] = useState(settings.antiCheat.isActive);
    const [acFreeze, setAcFreeze] = useState(settings.antiCheat.freezeDurationSeconds);
    const [acText, setAcText] = useState(settings.antiCheat.alertText);
    const [acSound, setAcSound] = useState(settings.antiCheat.enableSound);

    // Session Times State
    const [sessionTimes, setSessionTimes] = useState<Record<string, string>>(settings.sessionTimes || {
        'Sesi 1': '07:30 - 09:30',
        'Sesi 2': '10:00 - 12:00',
        'Sesi 3': '13:00 - 15:00',
        'Sesi 4': '15:30 - 17:30'
    });

    // Form State for User
    const [newUserRole, setNewUserRole] = useState<UserRole>(UserRole.ADMIN);
    const [newName, setNewName] = useState('');
    const [newUsername, setNewUsername] = useState('');
    const [newNisn, setNewNisn] = useState('');
    const [newClass, setNewClass] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = () => {
        db.getUsers().then(setUsers);
    };

    const handleDeleteUser = async (id: string) => {
        showConfirm('Apakah Anda yakin ingin menghapus user ini?', async () => {
            await db.deleteUser(id);
            loadData();
            showToast("User berhasil dihapus");
        });
    };

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        const newUser: User = {
            id: `usr-${Date.now()}`,
            name: newName,
            username: newUsername,
            role: newUserRole,
            nomorPeserta: newNisn,
            class: newUserRole === UserRole.STUDENT ? newClass : undefined,
            grade: newUserRole === UserRole.STUDENT ? 6 : undefined
        };
        await db.addUser(newUser);
        setIsAddModalOpen(false);
        setNewName('');
        setNewUsername('');
        setNewNisn('');
        loadData();
    };

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const url = URL.createObjectURL(e.target.files[0]);
            setLogoUrl(url);
        }
    };

    const handleSaveTheme = async () => {
        await db.updateSettings({
            themeColor: primaryColor,
            gradientEndColor: gradientEnd,
            logoStyle: logoStyle,
            schoolLogoUrl: logoUrl
        });
        onSettingsChange();
        showToast("Tema warna dan logo berhasil disimpan!");
    };

    const handleSaveAntiCheat = async () => {
        await db.updateSettings({
            antiCheat: {
                isActive: acActive,
                freezeDurationSeconds: acFreeze,
                alertText: acText,
                enableSound: acSound
            }
        });
        onSettingsChange();
        showToast("Pengaturan Anti-Kecurangan berhasil disimpan!");
    };

    const handleSaveSessionTimes = async () => {
        await db.updateSettings({ sessionTimes });
        onSettingsChange();
        showToast("Pengaturan Waktu Sesi berhasil disimpan!");
    };

    const getPreviewContainerClass = () => {
        switch(logoStyle) {
            case 'circle': return 'w-24 h-24 rounded-full';
            case 'rect_4_3': return 'w-32 h-24 rounded-lg';
            case 'rect_3_4_vert': return 'w-24 h-32 rounded-lg';
            default: return 'w-24 h-24 rounded-full';
        }
    };

    const NavItem = ({ id, label, icon: Icon }: { id: typeof activeTab, label: string, icon: any }) => (
      <button 
        onClick={() => setActiveTab(id)}
        className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition mb-1 text-sm font-medium ${activeTab === id ? 'bg-white/10 text-white' : 'text-blue-100 hover:bg-white/5'}`}
      >
          <Icon size={18} />
          <span>{label}</span>
      </button>
    );

    return (
        <div className="flex h-screen bg-gray-100 font-sans overflow-hidden">
             
             {/* Sidebar */}
             <aside className="w-64 flex-shrink-0 bg-slate-900 text-white flex flex-col shadow-xl z-20">
                <div className="p-6 border-b border-white/10 flex items-center space-x-3">
                    <Shield size={28} className="text-yellow-400" />
                    <div>
                        <h1 className="font-bold text-lg tracking-wide">SUPER ADMIN</h1>
                        <p className="text-xs text-slate-400">Root Access</p>
                    </div>
                </div>
                
                <nav className="flex-1 p-4 overflow-y-auto">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 px-4 mt-2">Main Menu</p>
                    <NavItem id="DASHBOARD" label="Dashboard" icon={LayoutDashboard} />
                    <NavItem id="USERS" label="Manajemen User" icon={Users} />
                    <NavItem id="THEME" label="Tema & Logo" icon={Palette} />
                    <NavItem id="WAKTU_SESI" label="Waktu Sesi" icon={Clock} />
                    <NavItem id="ANTI_CHEAT" label="Anti Kecurangan" icon={AlertTriangle} />
                </nav>

                <div className="p-4 border-t border-white/10 bg-black/20">
                    <button onClick={onLogout} className="w-full flex items-center justify-center space-x-2 bg-red-600 hover:bg-red-700 text-white py-2 rounded text-xs font-bold transition">
                        <LogOut size={14} /> <span>Keluar System</span>
                    </button>
                </div>
             </aside>

             <main className="flex-1 overflow-y-auto p-8">
                {/* Dashboard View */}
                {activeTab === 'DASHBOARD' && (
                    <div className="animate-in fade-in">
                        <h2 className="text-2xl font-bold text-gray-800 mb-6">System Overview</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                <p className="text-gray-500 text-xs font-bold uppercase mb-1">Total Admin</p>
                                <h3 className="text-4xl font-bold text-slate-700">{users.filter(u => u.role === UserRole.ADMIN).length}</h3>
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                <p className="text-gray-500 text-xs font-bold uppercase mb-1">Total Peserta</p>
                                <h3 className="text-4xl font-bold text-green-600">{users.filter(u => u.role === UserRole.STUDENT).length}</h3>
                            </div>
                        </div>
                    </div>
                )}

                {/* User Management View */}
                {activeTab === 'USERS' && (
                    <div className="animate-in fade-in">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-gray-800">Manajemen Pengguna</h2>
                            <button 
                                onClick={() => setIsAddModalOpen(true)}
                                className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center shadow-sm transition"
                            >
                                <UserPlus size={18} className="mr-2" /> Tambah User
                            </button>
                        </div>

                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                             <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center gap-4">
                                <div className="relative flex-1 max-w-md">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18}/>
                                    <input placeholder="Cari user..." className="pl-10 pr-4 py-2 border rounded-lg w-full text-sm focus:outline-none focus:border-slate-500" />
                                </div>
                             </div>
                             <table className="w-full text-left">
                                <thead className="bg-gray-50 text-gray-500 font-bold text-xs uppercase border-b border-gray-200">
                                    <tr>
                                        <th className="px-6 py-4">Nama</th>
                                        <th className="px-6 py-4">Role</th>
                                        <th className="px-6 py-4">Nomor Peserta/Username</th>
                                        <th className="px-6 py-4 text-center">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 text-sm">
                                    {users.map((u) => (
                                        <tr key={u.id} className="hover:bg-gray-50 transition">
                                            <td className="px-6 py-4 font-bold text-gray-700">{u.name}</td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2 py-1 rounded text-xs font-bold 
                                                    ${u.role === UserRole.SUPER_ADMIN ? 'bg-purple-100 text-purple-700' : 
                                                      u.role === UserRole.ADMIN ? 'bg-blue-100 text-blue-700' : 
                                                      'bg-green-100 text-green-700'}`}>
                                                    {u.role}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-gray-500 font-mono">{u.nomorPeserta || u.username}</td>
                                            <td className="px-6 py-4 text-center">
                                                {u.role !== UserRole.SUPER_ADMIN && (
                                                    <button onClick={() => handleDeleteUser(u.id)} className="p-2 text-red-500 hover:bg-red-50 rounded"><Trash2 size={16}/></button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                             </table>
                        </div>
                    </div>
                )}

                {/* Theme Management View */}
                {activeTab === 'THEME' && (
                    <div className="animate-in fade-in">
                        <h2 className="text-xl font-bold text-gray-800 mb-6">Pengaturan Tema & Logo</h2>
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-2xl">
                            
                            <div className="mb-8 border-b pb-6">
                                <label className="block text-sm font-bold text-gray-700 mb-3">Logo Sekolah</label>
                                <div className="flex items-start gap-6">
                                    <div className="flex-shrink-0 flex flex-col items-center">
                                        <div className={`flex items-center justify-center bg-gray-50 border-2 border-dashed border-gray-300 overflow-hidden shadow-sm ${getPreviewContainerClass()}`}>
                                            {logoUrl ? (
                                                <img src={logoUrl} alt="Preview" className="w-full h-full object-contain bg-white" />
                                            ) : (
                                                <ImageIcon className="text-gray-400 w-8 h-8" />
                                            )}
                                        </div>
                                        <p className="text-[10px] text-gray-400 mt-2 text-center uppercase tracking-wide">Preview Mode</p>
                                    </div>
                                    <div className="flex-1 space-y-4">
                                        {/* File Upload */}
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Upload File (Gambar)</label>
                                            <input 
                                                type="file" 
                                                accept="image/*"
                                                onChange={handleLogoUpload}
                                                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition border border-gray-200 rounded-lg p-1" 
                                            />
                                        </div>
                                        
                                        {/* URL Input */}
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Atau Gunakan URL Gambar</label>
                                            <div className="relative">
                                                <Link className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                                                <input 
                                                    type="text"
                                                    value={logoUrl || ''}
                                                    onChange={(e) => setLogoUrl(e.target.value)}
                                                    placeholder="https://example.com/logo.png"
                                                    className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition text-gray-700"
                                                />
                                            </div>
                                        </div>

                                        {/* Style Selection */}
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Bentuk Frame Logo</label>
                                            <div className="flex gap-2 flex-wrap">
                                                <button 
                                                    onClick={() => setLogoStyle('circle')}
                                                    className={`px-3 py-1.5 rounded text-xs font-bold border transition ${logoStyle === 'circle' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                                >
                                                    Circle (Bulat)
                                                </button>
                                                <button 
                                                    onClick={() => setLogoStyle('rect_4_3')}
                                                    className={`px-3 py-1.5 rounded text-xs font-bold border transition ${logoStyle === 'rect_4_3' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                                >
                                                    Persegi (4:3)
                                                </button>
                                                <button 
                                                    onClick={() => setLogoStyle('rect_3_4_vert')}
                                                    className={`px-3 py-1.5 rounded text-xs font-bold border transition ${logoStyle === 'rect_3_4_vert' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                                >
                                                    Vertikal (3:4)
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Warna Utama (Primary)</label>
                                    <div className="flex items-center gap-3">
                                        <input 
                                            type="color" 
                                            value={primaryColor}
                                            onChange={(e) => setPrimaryColor(e.target.value)}
                                            className="h-10 w-10 p-0 border-0 rounded cursor-pointer"
                                        />
                                        <span className="font-mono text-gray-500 bg-gray-100 px-2 py-1 rounded">{primaryColor}</span>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-2">Warna dasar header dan tombol utama.</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Warna Gradasi (Secondary)</label>
                                    <div className="flex items-center gap-3">
                                        <input 
                                            type="color" 
                                            value={gradientEnd}
                                            onChange={(e) => setGradientEnd(e.target.value)}
                                            className="h-10 w-10 p-0 border-0 rounded cursor-pointer"
                                        />
                                        <span className="font-mono text-gray-500 bg-gray-100 px-2 py-1 rounded">{gradientEnd}</span>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-2">Warna akhir untuk efek gradasi background.</p>
                                </div>
                            </div>

                            <button 
                                onClick={handleSaveTheme}
                                className="bg-slate-800 text-white px-6 py-3 rounded-lg font-bold hover:bg-slate-900 transition flex items-center"
                            >
                                <Save size={18} className="mr-2" /> Simpan Perubahan
                            </button>
                        </div>
                    </div>
                )}

                {/* Session Times View */}
                {activeTab === 'WAKTU_SESI' && (
                    <div className="animate-in fade-in">
                        <h2 className="text-xl font-bold text-gray-800 mb-6">Pengaturan Waktu Sesi</h2>
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-md">
                            <div className="space-y-6 mb-8">
                                {['Sesi 1', 'Sesi 2', 'Sesi 3', 'Sesi 4'].map((session) => (
                                    <div key={session}>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{session}</label>
                                        <input 
                                            className="w-full border rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition" 
                                            value={sessionTimes[session] || ''} 
                                            onChange={e => setSessionTimes({...sessionTimes, [session]: e.target.value})}
                                            placeholder="Contoh: 07:30 - 09:30"
                                        />
                                    </div>
                                ))}
                            </div>
                            <button 
                                onClick={handleSaveSessionTimes}
                                className="bg-slate-800 text-white px-6 py-3 rounded-lg font-bold hover:bg-slate-900 transition flex items-center"
                            >
                                <Save size={18} className="mr-2" /> Simpan Waktu Sesi
                            </button>
                        </div>
                    </div>
                )}

                {/* Anti Cheat Management View */}
                {activeTab === 'ANTI_CHEAT' && (
                    <div className="animate-in fade-in">
                        <h2 className="text-xl font-bold text-gray-800 mb-6">Pengaturan Sistem Keamanan</h2>
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-2xl">
                            
                            <div className="flex items-center justify-between mb-8 pb-6 border-b">
                                <div>
                                    <h3 className="font-bold text-lg text-gray-800">Status Sistem Anti-Curang</h3>
                                    <p className="text-sm text-gray-500">Aktifkan deteksi pindah tab/window blur.</p>
                                </div>
                                <button 
                                    onClick={() => setAcActive(!acActive)}
                                    className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${acActive ? 'bg-green-500' : 'bg-gray-300'}`}
                                >
                                    <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition ${acActive ? 'translate-x-7' : 'translate-x-1'}`} />
                                </button>
                            </div>

                            <div className={`space-y-6 ${!acActive ? 'opacity-50 pointer-events-none' : ''}`}>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center"><Clock size={16} className="mr-2"/> Durasi Pembekuan Layar (Freeze)</label>
                                    <div className="flex items-center gap-3">
                                        <input 
                                            type="number" 
                                            min="0"
                                            value={acFreeze}
                                            onChange={(e) => setAcFreeze(parseInt(e.target.value))}
                                            className="w-24 border rounded-lg px-3 py-2 text-center font-bold"
                                        />
                                        <span className="text-sm text-gray-500">Detik</span>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-1">Layar peserta akan terkunci selama durasi ini jika terdeteksi curang.</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center"><AlertTriangle size={16} className="mr-2"/> Pesan Peringatan</label>
                                    <textarea 
                                        value={acText}
                                        onChange={(e) => setAcText(e.target.value)}
                                        className="w-full border rounded-lg px-3 py-2 text-sm h-24"
                                        placeholder="Contoh: Dilarang membuka aplikasi lain!"
                                    />
                                </div>

                                <div className="flex items-center gap-3">
                                    <input 
                                        type="checkbox" 
                                        id="soundToggle"
                                        checked={acSound}
                                        onChange={(e) => setAcSound(e.target.checked)}
                                        className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <label htmlFor="soundToggle" className="text-sm font-bold text-gray-700 flex items-center cursor-pointer">
                                        <Speaker size={16} className="mr-2"/> Aktifkan Suara Alert (Beep)
                                    </label>
                                </div>
                            </div>

                            <div className="mt-8 pt-6 border-t">
                                <button 
                                    onClick={handleSaveAntiCheat}
                                    className="bg-slate-800 text-white px-6 py-3 rounded-lg font-bold hover:bg-slate-900 transition flex items-center"
                                >
                                    <Save size={18} className="mr-2" /> Simpan Konfigurasi
                                </button>
                            </div>

                        </div>
                    </div>
                )}
             </main>

             {/* Add User Modal */}
             {isAddModalOpen && (
                 <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                     <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in duration-200">
                         <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                             <h3 className="font-bold text-lg text-gray-800">Tambah User Baru</h3>
                             <button onClick={() => setIsAddModalOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                         </div>
                         <form onSubmit={handleAddUser} className="p-6 space-y-4">
                             <div>
                                 <label className="block text-sm font-bold text-gray-700 mb-1">Role User</label>
                                 <div className="grid grid-cols-2 gap-4">
                                     <button 
                                        type="button"
                                        onClick={() => setNewUserRole(UserRole.ADMIN)}
                                        className={`py-2 rounded border font-bold text-sm ${newUserRole === UserRole.ADMIN ? 'bg-blue-50 border-blue-500 text-blue-600' : 'border-gray-200 text-gray-500'}`}
                                     >
                                         Admin Sekolah
                                     </button>
                                     <button 
                                        type="button"
                                        onClick={() => setNewUserRole(UserRole.STUDENT)}
                                        className={`py-2 rounded border font-bold text-sm ${newUserRole === UserRole.STUDENT ? 'bg-green-50 border-green-500 text-green-600' : 'border-gray-200 text-gray-500'}`}
                                     >
                                         Peserta
                                     </button>
                                 </div>
                             </div>
                             
                             <div>
                                 <label className="block text-sm font-bold text-gray-700 mb-1">Nama Lengkap</label>
                                 <input required className="w-full border rounded-lg p-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Contoh: Budi Santoso" />
                             </div>

                             <div>
                                 <label className="block text-sm font-bold text-gray-700 mb-1">Username Login</label>
                                 <input required className="w-full border rounded-lg p-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="username" />
                             </div>

                             {newUserRole === UserRole.STUDENT && (
                                 <div>
                                     <label className="block text-sm font-bold text-gray-700 mb-1">Nomor Peserta (Nomor Induk Peserta Nasional)</label>
                                     <input className="w-full border rounded-lg p-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" value={newNisn} onChange={e => setNewNisn(e.target.value)} placeholder="10 digit Nomor Peserta" maxLength={10} />
                                 </div>
                             )}

                             {newUserRole === UserRole.STUDENT && (
                                 <div>
                                     <label className="block text-sm font-bold text-gray-700 mb-1">Kelas</label>
                                     <input className="w-full border rounded-lg p-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" value={newClass} onChange={e => setNewClass(e.target.value)} placeholder="Contoh: 6A" />
                                 </div>
                             )}

                             <div className="pt-4 flex gap-3">
                                 <button type="button" onClick={() => setIsAddModalOpen(false)} className="flex-1 py-2.5 border border-gray-300 text-gray-600 rounded-lg font-bold text-sm hover:bg-gray-50">Batal</button>
                                 <button type="submit" className="flex-1 py-2.5 bg-btn-primary text-white rounded-lg font-bold text-sm hover:bg-blue-600 shadow-md">Simpan</button>
                             </div>
                         </form>
                     </div>
                 </div>
             )}

             {/* CUSTOM TOAST */}
             {toast && (
                 <div className="fixed bottom-10 left-1/2 transform -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-10 duration-300">
                     <div className={`px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 border ${
                         toast.type === 'error' ? 'bg-red-600 border-red-500 text-white' : 'bg-green-600 border-green-500 text-white'
                     }`}>
                         <span className="font-bold text-sm">{toast.message}</span>
                     </div>
                 </div>
             )}

             {/* CUSTOM CONFIRM MODAL */}
             {confirmModal && (
                 <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
                     <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-in zoom-in-95 duration-200">
                         <div className="flex justify-center mb-4">
                             <div className="bg-orange-100 p-3 rounded-full">
                                 <AlertTriangle className="text-orange-600" size={32}/>
                             </div>
                         </div>
                         <h3 className="text-lg font-bold text-center text-gray-800 mb-2">Konfirmasi</h3>
                         <p className="text-sm text-gray-500 text-center mb-8">{confirmModal.message}</p>
                         <div className="flex gap-3">
                             <button 
                                 onClick={() => setConfirmModal(null)}
                                 className="flex-1 py-2.5 border border-gray-300 text-gray-600 rounded-xl font-bold text-sm hover:bg-gray-50 transition"
                             >
                                 Batal
                             </button>
                             <button 
                                 onClick={() => { confirmModal.onConfirm(); setConfirmModal(null); }}
                                 className="flex-1 py-2.5 bg-slate-800 text-white rounded-xl font-bold text-sm hover:bg-slate-900 shadow-lg transition"
                             >
                                 Ya, Lanjutkan
                             </button>
                         </div>
                     </div>
                 </div>
             )}
        </div>
    );
};