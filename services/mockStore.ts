
import { User, UserRole, Exam, ExamResult, AppSettings } from '../types';

// Initial Mock Data
let MOCK_SETTINGS: AppSettings = {
  appName: 'UJI TKA MANDIRI',
  schoolLogoUrl: 'https://lh3.googleusercontent.com/d/1tQPCSlVqJv08xNKeZRZhtRKC8T8PF-Uj', // Default Logo (App Logo) for Card Printing
  themeColor: '#2459a9', // Default Blue
  gradientEndColor: '#60a5fa', // Blue-400
  logoStyle: 'circle',
  antiCheat: {
    isActive: true,
    freezeDurationSeconds: 15,
    alertText: 'PERINGATAN! Dilarang berpindah aplikasi atau membuka tab lain.',
    enableSound: true
  }
};

// Simulation of 4 Schools
const SCHOOLS = [
  "SDN 1 BEJI",
  "SDN 2 DEPOK", 
  "SDIT NURUL FIKRI",
  "MI AL-HUDA"
];

let MOCK_USERS: User[] = [
  { id: '1', name: 'Kepala Sekolah', username: 'superadmin', role: UserRole.SUPER_ADMIN, school: 'PUSAT', password: 'admin' },
  { id: '2', name: 'Admin Sekolah', username: 'admin', role: UserRole.ADMIN, school: 'PUSAT', password: 'admin' },
  // Students (5 Peserta Mock Up)
  { 
    id: '3', 
    name: 'Ahmad Peserta', 
    username: 'peserta1', 
    role: UserRole.STUDENT, 
    grade: 6,
    nomorPeserta: '1001',
    school: SCHOOLS[0],
    gender: 'Laki-laki',
    birthDate: '2012-05-15',
    isLocked: false,
    password: '12345'
  },
  { 
    id: '4', 
    name: 'Budi Santoso', 
    username: 'peserta2', 
    role: UserRole.STUDENT, 
    grade: 6,
    nomorPeserta: '1002',
    school: SCHOOLS[1],
    gender: 'Laki-laki',
    birthDate: '2012-06-20',
    isLocked: false,
    password: '12345'
  },
  { 
    id: '5', 
    name: 'Siti Aminah', 
    username: 'peserta3', 
    role: UserRole.STUDENT, 
    grade: 6,
    nomorPeserta: '1003',
    school: SCHOOLS[0],
    gender: 'Perempuan',
    birthDate: '2012-01-10',
    isLocked: false,
    password: '12345'
  },
  { 
    id: '6', 
    name: 'Dewi Lestari', 
    username: 'peserta4', 
    role: UserRole.STUDENT, 
    grade: 6,
    nomorPeserta: '1004',
    school: SCHOOLS[2], // SDIT NURUL FIKRI
    gender: 'Perempuan',
    birthDate: '2012-03-12',
    isLocked: false,
    password: '12345'
  },
  { 
    id: '7', 
    name: 'Eko Prasetyo', 
    username: 'peserta5', 
    role: UserRole.STUDENT, 
    grade: 6,
    nomorPeserta: '1005',
    school: SCHOOLS[3], // MI AL-HUDA
    gender: 'Laki-laki',
    birthDate: '2012-08-05',
    isLocked: false,
    password: '12345'
  },
];

// Current Date for scheduling
const now = new Date();
const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);

// MOCK EXAMS (3 Mapel: MTK, IND, IPA)
let MOCK_EXAMS: Exam[] = [
  {
    id: 'ex-sd-mat',
    title: 'Matematika - Ujian Akhir Semester SD',
    subject: 'Matematika',
    educationLevel: 'SD',
    durationMinutes: 90,
    isActive: true,
    token: 'MTKSD1',
    startDate: now.toISOString(), // Ongoing
    endDate: tomorrow.toISOString(),
    questionCount: 4,
    questions: [
      { 
        id: 'q_mat_1', 
        type: 'PG', 
        text: 'Hasil pengerjaan dari 1.500 + 250 : 5 adalah...', 
        options: ['350', '1.550', '1.750', '8.750'], 
        correctIndex: 1, // 1.500 + 50 = 1.550
        points: 10 
      },
      { 
        id: 'q_mat_2', 
        type: 'PG', 
        text: 'Sebuah lingkaran memiliki jari-jari 14 cm. Berapakah luas lingkaran tersebut? (π = 22/7)', 
        options: ['154 cm²', '616 cm²', '1.232 cm²', '2.464 cm²'], 
        correctIndex: 1, // 22/7 * 14 * 14 = 616
        points: 10 
      },
      { 
        id: 'q_mat_complex_1', 
        type: 'PG_KOMPLEKS', 
        text: 'Manakah dari bilangan berikut yang merupakan Bilangan Prima? (Pilih dua jawaban)', 
        options: ['2', '9', '17', '21'], 
        correctIndices: [0, 2], // 2 dan 17 adalah prima
        points: 20 
      },
      {
        id: 'q_mat_complex_2',
        type: 'PG_KOMPLEKS', 
        text: 'Perhatikan ciri-ciri bangun datar berikut. Mana yang benar mengenai Persegi? (Pilih semua yang benar)',
        options: ['Memiliki 4 sisi sama panjang', 'Memiliki 2 pasang sisi sejajar', 'Memiliki 3 sudut tumpul', 'Tidak memiliki simetri lipat'],
        correctIndices: [0, 1], // Sisi sama panjang & sejajar
        points: 20
      }
    ]
  },
  {
    id: 'ex-sd-ind',
    title: 'Bahasa Indonesia - SD Literasi',
    subject: 'Bahasa Indonesia',
    educationLevel: 'SD',
    durationMinutes: 90,
    isActive: true,
    token: 'INDOSD',
    startDate: now.toISOString(), 
    endDate: tomorrow.toISOString(),
    questionCount: 4,
    questions: [
      { 
          id: 'q_ind_1', 
          type: 'PG', 
          text: 'Bacalah kalimat berikut: "Budi sangat gemar membaca buku di perpustakaan." \nSinonim dari kata "gemar" pada kalimat tersebut adalah...', 
          options: ['Bosan', 'Suka', 'Malas', 'Takut'], 
          correctIndex: 1, // Suka
          points: 10 
      },
      { 
          id: 'q_ind_2', 
          type: 'PG', 
          text: 'Ide pokok dalam sebuah paragraf biasanya dapat ditemukan pada...', 
          options: ['Kalimat utama', 'Kalimat penjelas', 'Judul bacaan', 'Kesimpulan akhir saja'], 
          correctIndex: 0, // Kalimat utama
          points: 10 
      },
      {
          id: 'q_ind_complex_1',
          type: 'PG_KOMPLEKS',
          text: 'Manakah di bawah ini yang termasuk penulisan kata baku yang BENAR? (Pilih dua jawaban)',
          options: ['Apotek', 'Nasehat', 'Jadwal', 'Antri'],
          correctIndices: [0, 2], 
          points: 20
      },
      {
          id: 'q_ind_complex_2',
          type: 'PG_KOMPLEKS',
          text: 'Pilihlah kalimat yang menggunakan huruf kapital dengan benar:',
          options: [
              'Ayah pergi ke surabaya.', 
              'Presiden Jokowi meresmikan jembatan.', 
              'ibu membeli garam inggris.', 
              'Kita harus menghormati tamu.'
          ],
          correctIndices: [1, 3], 
          points: 20
      }
    ]
  },
  {
    id: 'ex-sd-ipa',
    title: 'Ilmu Pengetahuan Alam - Paket A',
    subject: 'Ilmu Pengetahuan Alam',
    educationLevel: 'SD',
    durationMinutes: 60,
    isActive: true,
    token: 'IPASD1',
    startDate: now.toISOString(),
    endDate: tomorrow.toISOString(),
    questionCount: 4,
    questions: [
        {
            id: 'q_ipa_1',
            type: 'PG',
            text: 'Tumbuhan yang menyimpan cadangan makanan pada akar adalah...',
            options: ['Singkong', 'Padi', 'Mangga', 'Tebu'],
            correctIndex: 0,
            points: 10
        },
        {
            id: 'q_ipa_2',
            type: 'PG',
            text: 'Hewan yang mengalami metamorfosis sempurna adalah...',
            options: ['Kecoa', 'Belalang', 'Kupu-kupu', 'Capung'],
            correctIndex: 2,
            points: 10
        },
        {
            id: 'q_ipa_complex_1',
            type: 'PG_KOMPLEKS',
            text: 'Pilihlah benda-benda yang dapat ditarik oleh magnet (Magnetis):',
            options: ['Paku Besi', 'Karet Penghapus', 'Jarum Jahit', 'Pensil Kayu'],
            correctIndices: [0, 2],
            points: 20
        },
        {
            id: 'q_ipa_complex_2',
            type: 'PG_KOMPLEKS',
            text: 'Cara menjaga kesehatan organ pernapasan adalah:',
            options: ['Merokok', 'Olahraga teratur', 'Tidur larut malam', 'Menanam pohon di lingkungan sekitar'],
            correctIndices: [1, 3],
            points: 20
        }
    ]
  }
];

const MOCK_RESULTS: ExamResult[] = [];

// Mimic Async DB Calls
export const mockDb = {
  getSettings: async (): Promise<AppSettings> => {
    return Promise.resolve({ ...MOCK_SETTINGS });
  },

  updateSettings: async (newSettings: Partial<AppSettings>): Promise<void> => {
    MOCK_SETTINGS = { ...MOCK_SETTINGS, ...newSettings };
    return Promise.resolve();
  },

  login: async (input: string, password?: string): Promise<User | undefined> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        const user = MOCK_USERS.find(u => u.username === input || u.nomorPeserta === input);
        if (user) {
            // Check password if provided and user has one
            if (password && user.password && user.password !== password) {
                resolve(undefined);
                return;
            }
            resolve(user);
        } else {
            resolve(undefined);
        }
      }, 500);
    });
  },

  getExams: async (level?: 'SD'): Promise<Exam[]> => {
    return new Promise((resolve) => {
      setTimeout(() => {
         resolve(MOCK_EXAMS.filter(e => e.educationLevel === 'SD'));
      }, 300);
    });
  },

  updateExamToken: async (examId: string, newToken: string): Promise<void> => {
    const exam = MOCK_EXAMS.find(e => e.id === examId);
    if (exam) exam.token = newToken;
    return Promise.resolve();
  },

  updateExamSchedule: async (examId: string, token: string, durationMinutes: number, startDate: string, endDate: string): Promise<void> => {
    const exam = MOCK_EXAMS.find(e => e.id === examId);
    if (exam) {
        exam.token = token;
        exam.durationMinutes = durationMinutes;
        exam.startDate = startDate;
        exam.endDate = endDate;
    }
    return Promise.resolve();
  },

  createExam: async (exam: Exam): Promise<void> => {
    MOCK_EXAMS.push(exam);
    return Promise.resolve();
  },

  addQuestions: async (examId: string, questions: any[]): Promise<void> => {
      const exam = MOCK_EXAMS.find(e => e.id === examId);
      if (exam) {
          exam.questions = [...exam.questions, ...questions];
          exam.questionCount = exam.questions.length;
      }
      return Promise.resolve();
  },

  submitResult: async (result: ExamResult): Promise<void> => {
    MOCK_RESULTS.push(result);
    return Promise.resolve();
  },

  getAllResults: async (): Promise<ExamResult[]> => {
    return Promise.resolve(MOCK_RESULTS);
  },

  getUsers: async (): Promise<User[]> => {
    return Promise.resolve(MOCK_USERS);
  },
  
  addUser: async (user: User): Promise<void> => {
    MOCK_USERS.push(user);
    return Promise.resolve();
  },

  deleteUser: async (id: string): Promise<void> => {
    MOCK_USERS = MOCK_USERS.filter(u => u.id !== id);
    return Promise.resolve();
  },

  resetUserStatus: async (userId: string): Promise<void> => {
    const user = MOCK_USERS.find(u => u.id === userId);
    if (user) user.isLocked = false;
    return Promise.resolve();
  },

  resetUserPassword: async (userId: string): Promise<void> => {
    const user = MOCK_USERS.find(u => u.id === userId);
    if (user) user.password = '12345';
    return Promise.resolve();
  }
};
