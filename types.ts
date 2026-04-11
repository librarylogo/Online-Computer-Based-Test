
export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  GURU = 'GURU',
  PROKTOR = 'PROKTOR',
  STUDENT = 'STUDENT'
}

export interface StudentMapping {
  id: string;
  studentId: string;
  examId: string;
  examDate: string;
  session: string;
  room: string;
}

// Mapped from 'students' table
export interface User {
  id: string;
  name: string;
  username: string; // Maps to NISN
  role: UserRole;
  school?: string;
  npsn?: string;
  class?: string;
  password?: string;
  isLogin?: boolean;
  status?: 'idle' | 'working' | 'finished' | 'blocked';
  // List of mappings for different exams
  mappings?: StudentMapping[];
  // Virtual fields for UI compatibility
  grade?: number; 
  nomorPeserta?: string; 
  room?: string;
  session?: string;
  gender?: string;
  birthDate?: string;
  isLocked?: boolean;
}

export type QuestionType = 'PG' | 'PG_KOMPLEKS' | 'MATCHING' | 'TRUE_FALSE' | 'URAIAN';

// Mapped from 'questions' table
export interface Question {
  id: string;
  subjectId?: string;
  nomor?: string;
  type: QuestionType; // Mapped from "Tipe Soal"
  category?: string; // Mapped from "Jenis Soal"
  text: string;      // Mapped from "Soal"
  imgUrl?: string;   // Mapped from "Url Gambar"
  options: string[]; // Mapped from "Opsi A"..."Opsi D"
  correctIndex?: number; // Parsed from "Kunci"
  correctIndices?: number[]; // Parsed from "Kunci" for Complex
  matchingRights?: string[]; // For Matching UI
  matchingCorrectMap?: Record<string, string>; // For Matching Scoring
  points: number;    // Mapped from "Bobot"
  created_at?: string; // Added for ordering
}

// Mapped from 'subjects' table
export interface Exam {
  id: string;
  title: string;     // Mapped from "name"
  subject: string;   // Mapped from "name"
  code?: string;      // Mapped from "code"
  durationMinutes: number; // Mapped from "duration"
  questionCount: number;   // Mapped from "question_count"
  token: string;
  isActive: boolean; // Virtual (always true based on schema)
  questions: Question[]; // Populated via relation
  
  // Mapping Fields
  examDate?: string; // Mapped from "exam_date"
  session?: string;  // Mapped from "session"
  schoolAccess?: string[]; // Mapped from "school_access"
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;

  // Virtual fields for UI compatibility
  educationLevel: 'SD' | 'SMP';
  startDate?: string;
  endDate?: string;
}

// Mapped from 'results' table
export interface ExamResult {
  id: string;
  studentId: string;
  studentName?: string; // Joined field
  examId: string;       // subject_id
  examTitle?: string;   // Joined field
  score: number;
  submittedAt: string;  // timestamp
  
  // Virtual fields
  totalQuestions: number;
  cheatingAttempts: number;
  answers?: any[]; // Store student answers
  status?: 'working' | 'finished' | 'locked';
}

export interface AppSettings {
  appName: string;
  themeColor: string;
  gradientEndColor: string;
  schoolLogoUrl?: string;
  logoStyle: 'circle' | 'rect_4_3' | 'rect_3_4_vert'; 
  antiCheat: {
    isActive: boolean;
    freezeDurationSeconds: number;
    alertText: string;
    enableSound: boolean;
    antiSubmitEnabled?: boolean;
    antiSubmitTime?: number;
  }; 
  showTokenToStudents?: boolean;
  sessionTimes?: Record<string, string>;
}
