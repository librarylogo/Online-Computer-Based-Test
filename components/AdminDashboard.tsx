import React, { useState, useEffect, useRef } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { User, Exam, UserRole, Question, QuestionType, ExamResult, AppSettings } from '../types';
import { db, supabase } from '../services/database'; 
import { generateQuestionsWithGemini } from '../services/geminiService';
import { Plus, BookOpen, Save, LogOut, Loader2, Key, RotateCcw, Clock, Upload, Download, FileText, LayoutDashboard, Settings, Printer, Filter, Calendar, FileSpreadsheet, Lock, Link, Edit, ShieldAlert, Activity, ClipboardList, Search, Unlock, Trash2, Database, School, Shuffle, X, CheckSquare, Map, CalendarDays, Flame, Volume2, AlertTriangle, UserX, Info, Check, Monitor, Users, GraduationCap, CheckCircle, XCircle, ArrowLeft, BarChart3, PieChart, Menu, Trash, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, History, Sparkles, Bot, Eye, Wrench, Power, ArrowRight, CheckCircle2, TriangleAlert, ShieldCheck } from 'lucide-react';
import ReactQuill, { Quill } from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import katex from 'katex';
import 'katex/dist/katex.min.css';
// @ts-ignore
import renderMathInElement from 'katex/dist/contrib/auto-render';

if (typeof window !== 'undefined') {
    (window as any).katex = katex;
    (window as any).Quill = Quill;
    
    // Compatibility alias for older modules
    if (!(Quill as any).imports && (Quill as any).import) {
        (Quill as any).imports = (Quill as any).import;
    }
    
    // Polyfill for old modules that expect Quill.Attributor (Quill 2.0 compatibility)
    if (!(Quill as any).Attributor) {
        try {
            const parchment = Quill.import('parchment');
            if (parchment) {
                (Quill as any).Attributor = parchment.Attributor || parchment;
                // Some modules look for Attributor.Style
                if ((Quill as any).Attributor && !(Quill as any).Attributor.Style) {
                    (Quill as any).Attributor.Style = (parchment as any).StyleAttributor || (parchment as any).Style;
                }
            }
        } catch (e) {
            console.error("Failed to polyfill Quill.Attributor", e);
        }
    }
    
    // Dynamic import to ensure window.Quill is set before ImageResize loads
    // @ts-ignore
    import('quill-image-resize-module').then((module) => {
        const ImageResize = module.default;
        try {
            if (!Quill.import('modules/imageResize')) {
                Quill.register('modules/imageResize', ImageResize);
            }
        } catch (e) {
            Quill.register('modules/imageResize', ImageResize);
        }
    }).catch(err => {
        console.error("Failed to load ImageResize module", err);
    });

    // Ensure formula module is registered (Quill 2.0 compatibility)
    // Removed faulty registration block that caused circular import errors
}

interface AdminDashboardProps {
  user: User;
  onLogout: () => void;
  appName: string;
  onSettingsChange: () => void;
  themeColor: string;
  settings: AppSettings;
}

// Fixed Logo for Card Printing
const FIXED_LOGO_URL = "https://lh3.googleusercontent.com/d/1OtRkYlUrTr89sYj1Wj1hwTO7NjWXoLPf?authuser=0";

// --- ROBUST CSV PARSER ---
const quillModules = {
    toolbar: [
        [{ 'header': [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'script': 'sub'}, { 'script': 'super' }],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        [{ 'align': [] }],
        ['link', 'image', 'formula'],
        ['clean']
    ],
    // formula: true, // Removed to prevent "Cannot import modules/formula" error
    imageResize: {
        modules: ['Resize', 'DisplaySize', 'Toolbar']
    }
};

const parseCSV = (text: string): string[][] => {
    const cleanText = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const firstLine = cleanText.split('\n')[0];
    const delimiter = firstLine.includes(';') ? ';' : ',';

    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let insideQuotes = false;

    for (let i = 0; i < cleanText.length; i++) {
        const char = cleanText[i];
        if (char === '"') {
            if (insideQuotes && cleanText[i + 1] === '"') {
                currentField += '"';
                i++; 
            } else {
                insideQuotes = !insideQuotes;
            }
        } else if (char === delimiter && !insideQuotes) {
            currentRow.push(currentField);
            currentField = '';
        } else if (char === '\n' && !insideQuotes) {
            currentRow.push(currentField);
            rows.push(currentRow);
            currentRow = [];
            currentField = '';
        } else {
            currentField += char;
        }
    }
    if (currentField || currentRow.length > 0) {
        currentRow.push(currentField);
        rows.push(currentRow);
    }
    return rows;
};

const escapeCSV = (field: any): string => {
    if (field === null || field === undefined) return '';
    const stringField = String(field);
    if (stringField.includes('"') || stringField.includes(',') || stringField.includes(';') || stringField.includes('\n')) {
        return `"${stringField.replace(/"/g, '""')}"`;
    }
    return stringField;
};

const processImageUrl = (url: string): string => {
    const trimmed = url.trim();
    if (!trimmed) return '';
    
    // If it's a Google Drive link, extract ID (33rd char, 33 chars long)
    if (trimmed.includes('drive.google.com')) {
        const id = trimmed.substring(32, 32 + 33);
        return `https://lh3.googleusercontent.com/d/${id}`;
    }
    
    // If it's just an ID (not starting with http), prepend the base URL
    if (!trimmed.startsWith('http')) {
        return `https://lh3.googleusercontent.com/d/${trimmed}`;
    }
    
    return trimmed;
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ user, onLogout, appName, onSettingsChange, themeColor, settings }) => {
  const [exams, setExams] = useState<Exam[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [results, setResults] = useState<ExamResult[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isProcessingImport, setIsProcessingImport] = useState(false);
  
  // TABS
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'MONITORING' | 'HASIL_UJIAN' | 'BANK_SOAL' | 'MAPPING' | 'PESERTA' | 'CETAK_KARTU' | 'ANTI_CHEAT' | 'STAFF' | 'TROUBLESHOOTING'>('DASHBOARD');
  
  // STAFF STATE
  const [staffList, setStaffList] = useState<User[]>([]);
  const [isAddStaffModalOpen, setIsAddStaffModalOpen] = useState(false);
  const [newStaff, setNewStaff] = useState<Partial<User>>({ role: UserRole.PROKTOR });
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomSchool, setNewRoomSchool] = useState('');
  const [staffSort, setStaffSort] = useState<{ column: string, direction: 'asc' | 'desc' }>({ column: 'username', direction: 'asc' });

  // STUDENT MANAGEMENT STATE
  const [isAddStudentModalOpen, setIsAddStudentModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<User | null>(null);
  const [newStudent, setNewStudent] = useState<Partial<User>>({ role: UserRole.STUDENT, status: 'idle' });
  
  // DASHBOARD DRILL-DOWN VIEWS
  const [dashboardView, setDashboardView] = useState<'MAIN' | 'STUDENTS_DETAIL' | 'SCHOOLS_DETAIL' | 'EXAMS_DETAIL'>('MAIN');

  // ANTI CHEAT STATE
  const [acActive, setAcActive] = useState(settings.antiCheat.isActive);
  const [acFreeze, setAcFreeze] = useState(settings.antiCheat.freezeDurationSeconds);
  const [acText, setAcText] = useState(settings.antiCheat.alertText);
  const [acSound, setAcSound] = useState(settings.antiCheat.enableSound);
  const [acAntiSubmit, setAcAntiSubmit] = useState(settings.antiCheat.antiSubmitEnabled || false);
  const [acAntiSubmitTime, setAcAntiSubmitTime] = useState(settings.antiCheat.antiSubmitTime || 10);

  // MAPPING / SCHEDULE STATE
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingExam, setEditingExam] = useState<Exam | null>(null);
  const [editToken, setEditToken] = useState('');
  const [editDuration, setEditDuration] = useState(0);
  const [editDate, setEditDate] = useState('');
  const [editSession, setEditSession] = useState('');
  const [editSchoolAccess, setEditSchoolAccess] = useState<string[]>([]);
  const [mappingSearch, setMappingSearch] = useState(''); 
  const [editingMappingGroup, setEditingMappingGroup] = useState<any | null>(null);
  const [isEditMappingGroupModalOpen, setIsEditMappingGroupModalOpen] = useState(false);
  const [editMappingForm, setEditMappingForm] = useState({
      date: '',
      endDate: '',
      session: '',
      room: '',
      examId: ''
  });
  
  const [resultSort, setResultSort] = useState<{column: string, direction: 'asc' | 'desc'}>({column: 'studentName', direction: 'asc'});

  // QUESTION BANK STATE
  const [viewingQuestionsExam, setViewingQuestionsExam] = useState<Exam | null>(null);
  const [isAddQuestionModalOpen, setIsAddQuestionModalOpen] = useState(false);
  const [isCreateExamModalOpen, setIsCreateExamModalOpen] = useState(false);
  const [newExamTitle, setNewExamTitle] = useState('');
  const [targetExamForAdd, setTargetExamForAdd] = useState<Exam | null>(null);
  
  // MANUAL QUESTION FORM
  const [nqType, setNqType] = useState<QuestionType>('PG');
  const [nqText, setNqText] = useState<string>('');
  const [nqImg, setNqImg] = useState<string>('');
  const [nqOptions, setNqOptions] = useState<string[]>(['', '', '', '']);
  const [nqCorrectIndex, setNqCorrectIndex] = useState<number>(0);
  const [nqCorrectIndices, setNqCorrectIndices] = useState<number[]>([]);
  const [nqMatchingPairs, setNqMatchingPairs] = useState<{left: string, right: string}[]>([{left: '', right: ''}]);
  const [nqPoints, setNqPoints] = useState<number>(10);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);

  // PREVIEW STATE
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isFullExamPreviewOpen, setIsFullExamPreviewOpen] = useState(false);
  const [previewQuestion, setPreviewQuestion] = useState<Question | null>(null);

  // IMPORT REFS
  const [importTargetExamId, setImportTargetExamId] = useState<string | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  
  // AI Generation State
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [aiCount, setAiCount] = useState(10);
  const [aiGrade, setAiGrade] = useState(6);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [exportTargetExam, setExportTargetExam] = useState<Exam | null>(null);
  
  const studentFileRef = useRef<HTMLInputElement>(null);
  const questionFileRef = useRef<HTMLInputElement>(null);
  const examViewFileRef = useRef<HTMLInputElement>(null);
  const quillRef = useRef<any>(null);
  
  // FILTERS & CARD PRINTING
  const [selectedSchoolFilter, setSelectedSchoolFilter] = useState<string>('ALL'); // For Peserta & Monitoring
  const [dashboardSchoolFilter, setDashboardSchoolFilter] = useState<string>('ALL'); // For Dashboard Details
  const [resultSchoolFilter, setResultSchoolFilter] = useState<string>('ALL'); // For Results
  const [cardSchoolFilter, setCardSchoolFilter] = useState<string>('ALL'); // For Cards
  
  const [selectedRoomFilter, setSelectedRoomFilter] = useState<string>('ALL');
  const [selectedSessionFilter, setSelectedSessionFilter] = useState<string>('ALL');
  
  const [dashboardRoomFilter, setDashboardRoomFilter] = useState<string>('ALL');
  const [dashboardSessionFilter, setDashboardSessionFilter] = useState<string>('ALL');
  const [monitoringSchoolFilter, setMonitoringSchoolFilter] = useState<string>('ALL');
  const [monitoringClassFilter, setMonitoringClassFilter] = useState<string>('ALL');
  const [monitoringSubjectFilter, setMonitoringSubjectFilter] = useState<string>('ALL');
  const [monitoringSortConfig, setMonitoringSortConfig] = useState<{key: string, direction: 'asc'|'desc'} | null>(null);
  
  const [resultRoomFilter, setResultRoomFilter] = useState<string>('ALL');
  const [resultSessionFilter, setResultSessionFilter] = useState<string>('ALL');
  const [resultClassFilter, setResultClassFilter] = useState<string>('ALL');
  const [resultExamFilter, setResultExamFilter] = useState<string>('ALL');
  const [resultSubTab, setResultSubTab] = useState<'TABLE' | 'REVIEW'>('TABLE');
  const [reviewExamFilter, setReviewExamFilter] = useState<string>('ALL');
  const [reviewClassFilter, setReviewClassFilter] = useState<string>('ALL');
  const [selectedReviewResult, setSelectedReviewResult] = useState<ExamResult | null>(null);
  const [comparisonResult, setComparisonResult] = useState<ExamResult | null>(null);
  
  const [cardRoomFilter, setCardRoomFilter] = useState<string>('ALL');
  const [cardSessionFilter, setCardSessionFilter] = useState<string>('ALL');

  const today = new Date();
  const localTodayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const [monitoringSearch, setMonitoringSearch] = useState<string>('');
  const [printDate, setPrintDate] = useState(localTodayStr); // YYYY-MM-DD
  const [cardModel, setCardModel] = useState<'MODEL_1' | 'MODEL_2'>('MODEL_1');
  
  // GRAPH FILTERS
  const [graphFilterMode, setGraphFilterMode] = useState<'SCHEDULED' | 'ALL'>('SCHEDULED');
  const [graphDate, setGraphDate] = useState(localTodayStr);
  const [selectedSchoolTooltip, setSelectedSchoolTooltip] = useState<{name: string, value: number, x: number, y: number} | null>(null);

  // MONITORING BULK ACTIONS
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [monitoringExamId, setMonitoringExamId] = useState<string>('');

  // MOBILE SIDEBAR STATE
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  // MAPPING STATES
  const [mappingSchoolFilter, setMappingSchoolFilter] = useState<string>('ALL');
  const [mappingClassFilter, setMappingClassFilter] = useState<string>('ALL');
  const [mappingRoomFilter, setMappingRoomFilter] = useState<string>('ALL');
  const [mappingSessionFilter, setMappingSessionFilter] = useState<string>('ALL');
  const [mappingSort, setMappingSort] = useState<{column: keyof User | 'room' | 'session' | 'examId', direction: 'asc' | 'desc'}>({ column: 'class', direction: 'asc' });
  const [mappingSelectedIds, setMappingSelectedIds] = useState<string[]>([]);
  const [mappingLimit, setMappingLimit] = useState<number>(50); // Default 50
  const [isRecapModalOpen, setIsRecapModalOpen] = useState(false);
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [sessionTimes, setSessionTimes] = useState<Record<string, string>>(settings.sessionTimes || {
    'Sesi 1': '07.30 - 09.30',
    'Sesi 2': '10.00 - 12.00',
    'Sesi 3': '13.00 - 15.00',
    'Sesi 4': '15.30 - 17.30'
  });
  const [mappingEditForm, setMappingEditForm] = useState({ examId: '', examDate: '', endDate: '', room: '', session: '' });
  const [mappingMode, setMappingMode] = useState<'OBT' | 'TRYOUT'>('OBT');
  const [isMappingAccordionOpen, setIsMappingAccordionOpen] = useState(true);

  // Helper for Mapping History
  const getMappingHistory = () => {
    const history: Record<string, {
      date: string,
      session: string,
      examId: string,
      school: string,
      room: string,
      count: number
    }> = {};

    users.forEach(u => {
      if (u.role === UserRole.STUDENT && u.mappings) {
        u.mappings.forEach(m => {
          const key = `${m.examDate}|${m.session}|${m.examId}|${u.school}|${m.room}`;
          if (history[key]) {
            history[key].count++;
          } else {
            history[key] = {
              date: m.examDate,
              session: m.session,
              examId: m.examId,
              school: u.school || 'Unknown',
              room: m.room,
              count: 1
            };
          }
        });
      }
    });

    return Object.values(history).sort((a, b) => {
        // Sort by date desc, then session asc
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return a.session.localeCompare(b.session);
    });
  };

  // CUSTOM MODALS & TOASTS
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error' | 'info'} | null>(null);
  const [confirmModal, setConfirmModal] = useState<{message: string, onConfirm: () => void} | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
      setToast({ message, type });
      setTimeout(() => setToast(null), 3000);
  };

  const showConfirm = (message: string, onConfirm: () => void) => {
      setConfirmModal({ message, onConfirm });
  };

  useEffect(() => {
    if (mainRef.current) {
      renderMathInElement(mainRef.current, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
          { left: '\\[', right: '\\]', display: true }
        ],
        throwOnError: false
      });
      
      // Handle Quill formulas
      const formulas = mainRef.current.querySelectorAll('.ql-formula');
      formulas.forEach((el: any) => {
        const tex = el.getAttribute('data-value');
        if (tex) {
          try {
            const span = document.createElement('span');
            katex.render(tex, span, { throwOnError: false });
            el.parentNode?.replaceChild(span, el);
          } catch (e) {
            console.error("KaTeX render error", e);
          }
        }
      });
    }
  }, [activeTab, viewingQuestionsExam, isPreviewOpen, isAddQuestionModalOpen]);

  useEffect(() => {
    loadData();
    
    // Auto refresh for Monitoring & Anti-Cheat tab
    let interval: any;
    if (activeTab === 'MONITORING' || activeTab === 'ANTI_CHEAT') {
        interval = setInterval(() => {
            loadData();
        }, 5000); // Every 5 seconds
    }
    
    return () => {
        if (interval) clearInterval(interval);
    };
  }, [activeTab]);

  const handleSaveStudent = async () => {
      if (!newStudent.name || !newStudent.username || !newStudent.password) {
          return showToast("Nama, Username, dan Password wajib diisi!", 'error');
      }

      setIsLoadingData(true);
      try {
          if (editingStudent) {
              await db.updateUser(editingStudent.id, newStudent);
              showToast("Data peserta berhasil diperbarui.");
          } else {
              await db.createUser({
                  ...newStudent as any,
                  role: UserRole.STUDENT,
                  status: 'idle',
                  isLogin: false
              });
              showToast("Peserta baru berhasil ditambahkan.");
          }
          setIsAddStudentModalOpen(false);
          setEditingStudent(null);
          setNewStudent({ role: UserRole.STUDENT, status: 'idle' });
          await loadData();
      } catch (e: any) {
          showToast(e.message || "Gagal menyimpan data peserta", 'error');
      }
      setIsLoadingData(false);
  };

  const handleEditStudent = (u: User) => {
      setEditingStudent(u);
      setNewStudent({ ...u });
      setIsAddStudentModalOpen(true);
  };

  const getSortedStaff = () => {
    const proktors = staffList.filter(s => s.role === UserRole.PROKTOR);
    return [...proktors].sort((a, b) => {
      const valA = (a as any)[staffSort.column] || '';
      const valB = (b as any)[staffSort.column] || '';
      if (valA < valB) return staffSort.direction === 'asc' ? -1 : 1;
      if (valA > valB) return staffSort.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const handleStaffSort = (column: string) => {
    if (staffSort.column === column) {
      setStaffSort({ column, direction: staffSort.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      setStaffSort({ column, direction: 'asc' });
    }
  };

  const loadData = async () => {
    setIsLoadingData(true);
    try {
      const e = await db.getExams(); 
      const u = await db.getUsers();
      const r = await db.getAllResults();
      
      let s: User[] = [];
      try {
        s = await db.getStaff();
      } catch (err: any) {
        console.error("Error loading staff:", err);
        if (err.message?.includes('relation') || err.code === '42P01' || err.message?.includes('staff')) {
          showToast("Tabel 'staff' belum dibuat di Supabase. Silakan jalankan SQL di supabase_schema.sql", 'error');
        }
      }
      
      setExams(e);
      
      let filteredUsers = u;
      let filteredResults = r;

      if (user.role === UserRole.PROKTOR) {
          filteredUsers = u.filter(student => 
              student.school === user.school && 
              student.mappings?.some(m => m.room === user.room)
          );
          const studentIds = new Set(filteredUsers.map(student => student.id));
          filteredResults = r.filter(res => studentIds.has(res.studentId));
      }

      setUsers(filteredUsers); 
      setResults(filteredResults);
      setStaffList(s);
    } catch (err) {
      console.error("Error loading data:", err);
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleAddStaff = async () => {
      if (!newStaff.name || !newStaff.username) return showToast("Nama dan Username wajib diisi!", 'error');
      try {
          await db.addStaff(newStaff);
          await loadData();
          setIsAddStaffModalOpen(false);
          setNewStaff({ role: UserRole.PROKTOR });
          showToast("Staff berhasil ditambahkan!");
      } catch (e) {
          showToast("Gagal menambahkan staff", 'error');
      }
  };

  const handleDeleteStaff = async (id: string) => {
      showConfirm("Hapus akun staff ini?", async () => {
          await db.deleteStaff(id);
          await loadData();
          showToast("Staff dihapus.");
      });
  };

  // --- ACTIONS ---
  const handleSaveAntiCheat = async () => {
      await db.updateSettings({
          antiCheat: {
              isActive: acActive,
              freezeDurationSeconds: acFreeze,
              alertText: acText,
              enableSound: acSound,
              antiSubmitEnabled: acAntiSubmit,
              antiSubmitTime: acAntiSubmitTime
          }
      });
      onSettingsChange();
      showToast("Pengaturan Sistem Anti-Curang berhasil diperbarui!");
  };

  const handleDeleteMappingGroup = async (group: any) => {
      showConfirm(`Apakah Anda yakin ingin menghapus mapping untuk ${group.school} - ${group.room} pada sesi ${group.session}?`, async () => {
          try {
              const studentIds = users
                  .filter(u => 
                      u.role === UserRole.STUDENT && 
                      u.school === group.school &&
                      u.mappings?.some(m => 
                          m.examId === group.examId &&
                          m.examDate === group.date &&
                          m.session === group.session &&
                          m.room === group.room
                      )
                  )
                  .map(u => u.id);
              
              if (studentIds.length === 0) {
                  showToast("Tidak ada peserta yang ditemukan untuk mapping ini.", 'error');
                  return;
              }

              await db.deleteStudentMappingBatch(studentIds, group.examId, group.date, group.session, group.room);
              showToast("Mapping berhasil dihapus", 'success');
              loadData();
          } catch (error: any) {
              showToast("Gagal menghapus mapping: " + error.message, 'error');
          }
      });
  };

  const handleOpenEditMapping = (group: any) => {
      setEditingMappingGroup(group);
      let startDate = group.date;
      let endDate = '';
      if (group.date?.includes('|')) {
          [startDate, endDate] = group.date.split('|');
      }
      setEditMappingForm({
          date: startDate,
          endDate: endDate,
          session: group.session,
          room: group.room,
          examId: group.examId
      });
      setIsEditMappingGroupModalOpen(true);
  };

  const handleSaveEditMapping = async () => {
      if (!editingMappingGroup) return;
      
      try {
          const studentIds = users
              .filter(u => 
                  u.role === UserRole.STUDENT && 
                  u.school === editingMappingGroup.school &&
                  u.mappings?.some(m => 
                      m.examId === editingMappingGroup.examId &&
                      m.examDate === editingMappingGroup.date &&
                      m.session === editingMappingGroup.session &&
                      m.room === editingMappingGroup.room
                  )
              )
              .map(u => u.id);
          
          if (studentIds.length === 0) {
              showToast("Tidak ada peserta yang ditemukan untuk mapping ini.", 'error');
              return;
          }

          let finalExamDate = editMappingForm.date;
          if (editMappingForm.endDate) {
              finalExamDate = `${editMappingForm.date}|${editMappingForm.endDate}`;
          }

          const newMapping = {
              ...editMappingForm,
              date: finalExamDate
          };

          await db.updateStudentMappingBatch(studentIds, editingMappingGroup, newMapping);
          showToast("Mapping berhasil diperbarui", 'success');
          setIsEditMappingGroupModalOpen(false);
          loadData();
      } catch (error: any) {
          showToast("Gagal memperbarui mapping: " + error.message, 'error');
      }
  };

  const handleResetViolation = async (resultId: string) => {
      showConfirm("Reset status pelanggaran peserta ini?", async () => {
          await db.resetCheatingCount(resultId);
          // Optimistic update locally
          setResults(prev => prev.map(r => r.id === resultId ? {...r, cheatingAttempts: 0} : r));
          showToast("Pelanggaran di-reset.");
      });
  };

  const handlePrintCards = () => {
      const filteredUsers = getMonitoringUsers(selectedSchoolFilter, selectedRoomFilter, selectedSessionFilter);
      if (filteredUsers.length === 0) {
          showToast("Tidak ada peserta untuk dicetak", "error");
          return;
      }

      const printWindow = window.open('', '_blank');
      if (!printWindow) return;

      const now = new Date();
      const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
      const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
      const printDateStr = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}.${now.getMinutes().toString().padStart(2, '0')} WIB`;

      let content = `
      <!DOCTYPE html>
      <html>
      <head>
          <title>Cetak Kartu Peserta</title>
          <style>
              body {
                  font-family: Arial, sans-serif;
                  margin: 0;
                  padding: 20px;
                  background: #f0f0f0;
              }
              .page {
                  display: grid;
                  grid-template-columns: repeat(3, 1fr);
                  gap: 15px;
                  page-break-after: always;
              }
              .card {
                  background: white;
                  border: 1px dashed #999;
                  padding: 15px;
                  width: 100%;
                  box-sizing: border-box;
                  text-align: center;
              }
              .logo {
                  height: 40px;
                  object-fit: contain;
                  margin-bottom: 5px;
              }
              .app-name {
                  font-size: 12px;
                  font-weight: bold;
                  text-transform: uppercase;
                  margin: 0 0 5px 0;
              }
              .black-bar {
                  background: black;
                  color: white;
                  font-size: 10px;
                  font-weight: bold;
                  padding: 4px 0;
                  margin-bottom: 10px;
                  text-transform: uppercase;
              }
              .participant-name {
                  font-size: 12px;
                  font-weight: bold;
                  margin: 0 0 2px 0;
                  text-transform: uppercase;
              }
              .school-name {
                  font-size: 10px;
                  font-style: italic;
                  margin: 0 0 10px 0;
              }
              .divider {
                  border-top: 1px solid #000;
                  margin: 5px 0;
              }
              .thick-divider {
                  border-top: 2px solid #000;
                  margin: 5px 0;
              }
              .info-row {
                  display: flex;
                  justify-content: space-between;
                  font-size: 10px;
                  margin: 3px 0;
              }
              .info-label {
                  font-style: italic;
                  text-transform: uppercase;
              }
              .info-value {
                  font-weight: bold;
              }
              .info-value-normal {
                  font-weight: normal;
              }
              .print-date {
                  font-size: 8px;
                  font-style: italic;
                  text-align: right;
                  margin-top: 5px;
              }
              @media print {
                  body { background: white; padding: 0; }
                  .page { gap: 10px; }
                  .card { page-break-inside: avoid; }
              }
          </style>
      </head>
      <body>
      `;

      let cardsCount = 0;
      content += `<div class="page">`;
      
      filteredUsers.forEach((u, index) => {
          if (cardsCount > 0 && cardsCount % 9 === 0) {
              content += `</div><div class="page">`;
          }
          
          content += `
          <div class="card">
              <img src="${settings.schoolLogoUrl}" class="logo" alt="Logo">
              <div class="app-name">${appName.replace(/\n/g, '<br>')}</div>
              <div class="black-bar">KARTU PESERTA UJIAN</div>
              <div class="participant-name">${u.name}</div>
              <div class="school-name">${u.school || '-'}</div>
              
              <div class="divider"></div>
              <div class="info-row">
                  <span class="info-label">USERNAME</span>
                  <span class="info-value">${u.nomorPeserta}</span>
              </div>
              <div class="info-row">
                  <span class="info-label">PASSWORD</span>
                  <span class="info-value">${u.password || '12345'}</span>
              </div>
              
              <div class="divider"></div>
              <div class="info-row">
                  <span class="info-label">RUANG</span>
                  <span class="info-value-normal">${u.room || '-'}</span>
              </div>
              <div class="info-row">
                  <span class="info-label">SESI</span>
                  <span class="info-value-normal">${u.session || '-'}</span>
              </div>
              <div class="info-row">
                  <span class="info-label">NO. PC</span>
                  <span class="info-value-normal">-</span>
              </div>
              
              <div class="thick-divider"></div>
              <div class="print-date">dicetak ${printDateStr}</div>
          </div>
          `;
          cardsCount++;
      });

      content += `</div>
          <script>
              window.onload = function() {
                  setTimeout(() => {
                      window.print();
                  }, 500);
              };
          </script>
      </body>
      </html>
      `;

      printWindow.document.write(content);
      printWindow.document.close();
  };

  const handleCreateExam = async () => {
      if(!newExamTitle.trim()) return showToast("Nama Mata Pelajaran wajib diisi!", 'error');
      
      setIsLoadingData(true);
      try {
          const newExam: Exam = {
              id: `temp`, 
              title: newExamTitle,
              subject: newExamTitle,
              educationLevel: 'SD',
              durationMinutes: 60,
              isActive: true,
              token: Math.random().toString(36).substring(2, 8).toUpperCase(),
              questions: [],
              questionCount: 0
          };
          await db.createExam(newExam);
          await loadData();
          setIsCreateExamModalOpen(false);
          setNewExamTitle('');
          showToast("Mata Pelajaran berhasil ditambahkan!");
      } catch (error: any) {
          console.error(error);
          const errorMsg = error.message || "Gagal menambahkan mata pelajaran. Pastikan koneksi internet stabil.";
          showToast(`Gagal: ${errorMsg}`, 'error');
      } finally {
          setIsLoadingData(false);
      }
  };

  const handleDeleteExam = async (examId: string) => {
      showConfirm("Hapus mata pelajaran ini beserta seluruh soalnya?", async () => {
          setIsLoadingData(true);
          try {
              await db.deleteExam(examId);
              await loadData();
              showToast("Mata Pelajaran berhasil dihapus.");
          } catch (error: any) {
              showToast(`Gagal menghapus: ${error.message}`, 'error');
          } finally {
              setIsLoadingData(false);
          }
      });
  };

  // --- MAPPING LOGIC ---
  const handleAppNameChange = async (newName: string) => {
      await db.updateSettings({ appName: newName });
      onSettingsChange();
  };

  const handleCreateRoomProktor = async () => {
    if (!newRoomName.trim() || !newRoomSchool.trim()) {
      showToast('Nama sekolah dan Nama ruang harus diisi!', 'error');
      return;
    }

    try {
      setIsLoadingData(true);
      
      // Find NPSN for the selected school
      const schoolUser = users.find(u => u.school === newRoomSchool && u.npsn);
      const npsn = schoolUser?.npsn || '00000000';

      // Generate username based on NPSN-XXX
      const proktorsInSchool = staffList.filter(s => s.npsn === npsn && s.role === UserRole.PROKTOR);
      const nextNumber = proktorsInSchool.length + 1;
      const username = `${npsn}-${String(nextNumber).padStart(3, '0')}`;
      
      const password = Math.random().toString(36).substring(2, 8);
      
      await db.addStaff({
        name: `Proktor ${newRoomName}`,
        username,
        password,
        role: UserRole.PROKTOR,
        school: newRoomSchool,
        npsn: npsn,
        room: newRoomName
      });

      showToast(`Ruang ${newRoomName} berhasil ditambahkan! User: ${username}, Pass: ${password}`, 'success');
      setNewRoomName('');
      setNewRoomSchool('');
      loadData();
    } catch (e: any) {
      console.error(e);
      if (e.message?.includes('relation') || e.code === '42P01' || e.message?.includes('column') || e.message?.includes('staff')) {
        showToast("Database belum siap. Silakan jalankan/update SQL di supabase_schema.sql (terutama tabel 'staff' dan kolom 'npsn')", 'error');
      } else {
        showToast('Gagal menambahkan ruang.', 'error');
      }
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleForceFinishAll = async () => {
      showConfirm("Anda yakin ingin memaksa semua peserta yang sedang mengerjakan untuk selesai?", async () => {
          setIsLoadingData(true);
          try {
              await db.forceFinishAllWorking(monitoringExamId || undefined);
              showToast("Berhasil memaksa selesai semua peserta yang sedang mengerjakan.");
              await loadData();
          } catch (e: any) {
              showToast(e.message || "Gagal memaksa selesai", 'error');
          }
          setIsLoadingData(false);
      });
  };

  const handleResetAllLogins = async () => {
      showConfirm("Anda yakin ingin mereset status login SEMUA peserta? Ini akan membuat mereka harus login ulang.", async () => {
          setIsLoadingData(true);
          try {
              const { error } = await supabase.from('students').update({ is_login: false, status: 'idle' }).neq('id', 'admin-id');
              if (error) throw error;
              showToast("Status login semua peserta berhasil direset.");
              await loadData();
          } catch (e: any) {
              showToast(e.message || "Gagal mereset status login", 'error');
          }
          setIsLoadingData(false);
      });
  };

  const handleResetAllViolations = async () => {
      showConfirm("Anda yakin ingin mereset SEMUA pelanggaran peserta?", async () => {
          setIsLoadingData(true);
          try {
              const { error } = await supabase.from('results').update({ violation_count: 0 });
              if (error) throw error;
              showToast("Semua pelanggaran berhasil direset.");
              await loadData();
          } catch (e: any) {
              showToast(e.message || "Gagal mereset pelanggaran", 'error');
          }
          setIsLoadingData(false);
      });
  };

  const handleUnblockAll = async () => {
      showConfirm("Anda yakin ingin membuka blokir SEMUA peserta?", async () => {
          setIsLoadingData(true);
          try {
              const { error } = await supabase.from('students').update({ status: 'idle' }).eq('status', 'blocked');
              if (error) throw error;
              showToast("Semua blokir peserta berhasil dibuka.");
              await loadData();
          } catch (e: any) {
              showToast(e.message || "Gagal membuka blokir", 'error');
          }
          setIsLoadingData(false);
      });
  };

  const handleGenerateNewToken = async (examId: string) => {
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
        showToast("Hanya Admin yang dapat mengubah token!", "error");
        return;
    }

    const newToken = Math.random().toString(36).substring(2, 8).toUpperCase();
    try {
        await db.updateExamToken(examId, newToken);
        setExams(prev => prev.map(ex => ex.id === examId ? { ...ex, token: newToken } : ex));
        showToast(`Token baru berhasil di-generate: ${newToken}`);
    } catch (e: any) {
        showToast(`Gagal generate token: ${e.message}`, 'error');
    }
  };

  const handleToggleTokenVisibility = async (visible: boolean) => {
      await db.updateSettings({ showTokenToStudents: visible });
      onSettingsChange();
  };

  const openMappingModal = (exam: Exam) => {
      setEditingExam(exam);
      setEditToken(exam.token);
      setEditDuration(exam.durationMinutes);
      setEditDate(exam.examDate || localTodayStr);
      setEditSession(exam.session || 'Sesi 1');
      setEditSchoolAccess(exam.schoolAccess || []); 
      setMappingSearch('');
      setIsEditModalOpen(true);
  };

  const toggleSchoolAccess = (schoolName: string) => {
      setEditSchoolAccess(prev => {
          if (prev.includes(schoolName)) return prev.filter(s => s !== schoolName);
          return [...prev, schoolName];
      });
  };

  const addAllAvailableSchools = (available: string[]) => {
      const newAccess = [...editSchoolAccess];
      available.forEach(s => {
          if(!newAccess.includes(s)) newAccess.push(s);
      });
      setEditSchoolAccess(newAccess);
  };

  const handleSaveMapping = async () => {
      if (!editingExam) return;
      if (editToken.length < 3) return showToast("Token minimal 3 karakter", 'error');
      
      await db.updateExamMapping(
          editingExam.id, 
          editToken.toUpperCase(), 
          editDuration,
          editDate,
          editSession,
          editSchoolAccess,
          editingExam.shuffleQuestions,
          editingExam.shuffleOptions
      );
      setIsEditModalOpen(false);
      setEditingExam(null);
      loadData();
      showToast("Mapping Jadwal & Akses Sekolah berhasil diperbarui!");
  };

  // --- QUESTION BANK & IMPORT/EXPORT ---
  const handleSaveQuestion = async () => {
      if (!targetExamForAdd) return;
      if (!nqText.trim()) return showToast("Teks soal wajib diisi!", 'error');
      
      const finalImgUrl = processImageUrl(nqImg);

      const newQuestion: Question = {
          id: editingQuestionId || `manual`,
          type: nqType,
          text: nqText,
          imgUrl: finalImgUrl || undefined,
          points: Number(nqPoints) || 0,
          options: nqType === 'MATCHING' ? [] : (nqType === 'TRUE_FALSE' ? ['Benar', 'Salah'] : nqOptions),
          correctIndex: nqType === 'PG_KOMPLEKS' ? undefined : nqCorrectIndex,
          correctIndices: nqType === 'PG_KOMPLEKS' ? nqCorrectIndices : undefined,
      };
      
      if (nqType === 'MATCHING') {
          newQuestion.options = nqMatchingPairs.map(p => `${p.left}|${p.right}`);
      }

      try {
          if (editingQuestionId) {
              await db.updateQuestion(newQuestion);
          } else {
              await db.addQuestions(targetExamForAdd.id, [newQuestion]);
          }
          
          // Refresh data and update the viewingQuestionsExam state to show new question
          const updatedExams = await db.getExams();
          setExams(updatedExams);
          
          if (viewingQuestionsExam) {
              const updatedViewing = updatedExams.find(ex => ex.id === viewingQuestionsExam.id);
              if (updatedViewing) setViewingQuestionsExam(updatedViewing);
          }

          setIsAddQuestionModalOpen(false);
          setEditingQuestionId(null);
          setNqText('');
          setNqImg('');
          setNqOptions(['', '', '', '']);
          setNqCorrectIndex(0);
          setNqCorrectIndices([]);
          setNqMatchingPairs([{left: '', right: ''}]);
          showToast(editingQuestionId ? "Soal berhasil diperbarui!" : "Soal berhasil disimpan!");
      } catch (error: any) {
          console.error("Save Question Error:", error);
          showToast(`Gagal menyimpan: ${error.message || "Database error"}`, 'error');
      }
  };

  const handlePreviewQuestion = () => {
      if (!nqText.trim()) return showToast("Teks soal wajib diisi untuk preview!", 'error');
      
      const finalImgUrl = processImageUrl(nqImg);

      const q: Question = {
          id: 'preview',
          type: nqType,
          text: nqText,
          imgUrl: finalImgUrl || undefined,
          points: Number(nqPoints) || 0,
          options: nqType === 'MATCHING' ? nqMatchingPairs.map(p => `${p.left}|${p.right}`) : (nqType === 'TRUE_FALSE' ? ['Benar', 'Salah'] : nqOptions),
          correctIndex: nqType === 'PG_KOMPLEKS' ? undefined : nqCorrectIndex,
          correctIndices: nqType === 'PG_KOMPLEKS' ? nqCorrectIndices : undefined,
      };
      setPreviewQuestion(q);
      setIsPreviewOpen(true);
  };

  const handleEditQuestion = (q: Question) => {
      setNqType(q.type);
      setNqText(q.text);
      setNqImg(q.imgUrl || '');
      setNqPoints(q.points);
      setEditingQuestionId(q.id);
      
      if (q.type === 'MATCHING') {
          const pairs = q.options.map(opt => {
              const [left, right] = opt.split('|');
              return { left: left || '', right: right || '' };
          });
          setNqMatchingPairs(pairs.length > 0 ? pairs : [{left: '', right: ''}]);
      } else {
          setNqOptions(q.options.length >= 4 ? q.options : [...q.options, '', '', '', ''].slice(0, 4));
          setNqCorrectIndex(q.correctIndex || 0);
          setNqCorrectIndices(q.correctIndices || []);
      }
      
      setTargetExamForAdd(viewingQuestionsExam);
      setIsAddQuestionModalOpen(true);
  };

  const handleDeleteQuestion = async (questionId: string) => {
      if (!viewingQuestionsExam) return;
      showConfirm("Hapus soal ini?", async () => {
          try {
              await db.deleteQuestion(questionId, viewingQuestionsExam.id);
              const updatedExams = await db.getExams();
              setExams(updatedExams);
              const updatedViewing = updatedExams.find(ex => ex.id === viewingQuestionsExam.id);
              if (updatedViewing) setViewingQuestionsExam(updatedViewing);
              showToast("Soal berhasil dihapus");
          } catch (e) {
              showToast("Gagal menghapus soal", "error");
          }
      });
  };

  const handleMoveQuestion = async (questionId: string, direction: 'up' | 'down') => {
      if (!viewingQuestionsExam) return;
      const questions = [...viewingQuestionsExam.questions];
      const index = questions.findIndex(q => q.id === questionId);
      if (index === -1) return;
      
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= questions.length) return;
      
      // Swap
      [questions[index], questions[newIndex]] = [questions[newIndex], questions[index]];
      
      try {
          // Update order in DB by updating created_at timestamps
          const now = new Date();
          const updatedQuestions = questions.map((q, idx) => ({
              ...q,
              created_at: new Date(now.getTime() + idx).toISOString()
          }));
          
          const updatedExam = { ...viewingQuestionsExam, questions: updatedQuestions };
          setViewingQuestionsExam(updatedExam);
          setExams(exams.map(ex => ex.id === updatedExam.id ? updatedExam : ex));
          
          // Persist the swapped questions
          await db.updateQuestion(updatedQuestions[index]);
          await db.updateQuestion(updatedQuestions[newIndex]);
          
          showToast(`Soal dipindahkan ke ${direction === 'up' ? 'atas' : 'bawah'}`);
      } catch (e) {
          showToast("Gagal memindahkan soal", "error");
      }
  };

  const handleGenerateAiQuestions = async () => {
    if (!viewingQuestionsExam || !aiTopic.trim()) {
        showToast("Topik wajib diisi!", "error");
        return;
    }

    setIsGeneratingAi(true);
    try {
        const generated = await generateQuestionsWithGemini(aiTopic, aiCount, aiGrade);
        
        if (generated.length === 0) {
            throw new Error("Gagal menghasilkan soal. Pastikan API Key sudah benar.");
        }

        // Save generated questions to the database
        await db.addQuestions(viewingQuestionsExam.id, generated);

        await loadData();
        
        // Update viewing exam state
        const updatedExams = await db.getExams();
        const updatedViewing = updatedExams.find(ex => ex.id === viewingQuestionsExam.id);
        if (updatedViewing) setViewingQuestionsExam(updatedViewing);

        setIsAiModalOpen(false);
        setAiTopic('');
        showToast(`${generated.length} soal berhasil dibuat oleh AI!`);
    } catch (error: any) {
        console.error(error);
        showToast(error.message || "Gagal membuat soal dengan AI", "error");
    } finally {
        setIsGeneratingAi(false);
    }
  };

  const handleUpdateDuration = async (newDuration: number) => {
      if (!viewingQuestionsExam) return;
      try {
          const updatedExam = { ...viewingQuestionsExam, durationMinutes: newDuration };
          await db.updateExamMapping(
              viewingQuestionsExam.id,
              viewingQuestionsExam.token,
              newDuration,
              viewingQuestionsExam.examDate || '',
              viewingQuestionsExam.session || '',
              viewingQuestionsExam.schoolAccess || [],
              viewingQuestionsExam.shuffleQuestions,
              viewingQuestionsExam.shuffleOptions
          );
          setViewingQuestionsExam(updatedExam);
          setExams(exams.map(ex => ex.id === updatedExam.id ? updatedExam : ex));
          showToast("Durasi ujian diperbarui");
      } catch (e) {
          showToast("Gagal memperbarui durasi", "error");
      }
  };

  const handleUpdateQuestionPoints = async (questionId: string, newPoints: number) => {
      if (!viewingQuestionsExam) return;
      try {
          const questionToUpdate = viewingQuestionsExam.questions.find(q => q.id === questionId);
          if (!questionToUpdate) return;
          
          const updatedQuestion = { ...questionToUpdate, points: newPoints };
          await db.updateQuestion(updatedQuestion);
          
          const updatedQuestions = viewingQuestionsExam.questions.map(q => 
              q.id === questionId ? updatedQuestion : q
          );
          const updatedExam = { ...viewingQuestionsExam, questions: updatedQuestions };
          setViewingQuestionsExam(updatedExam);
          setExams(exams.map(ex => ex.id === updatedExam.id ? updatedExam : ex));
      } catch (e) {
          showToast("Gagal memperbarui bobot soal", "error");
      }
  };

  const handleUpdateAllQuestionPoints = async (newPoints: number) => {
      if (!viewingQuestionsExam) return;
      showConfirm(`Ubah semua bobot soal menjadi ${newPoints}?`, async () => {
          try {
              const updatedQuestions = viewingQuestionsExam.questions.map(q => ({ ...q, points: newPoints }));
              
              // Update all questions in DB sequentially to avoid overwhelming the connection
              for (const q of updatedQuestions) {
                  await db.updateQuestion(q);
              }
              
              const updatedExam = { ...viewingQuestionsExam, questions: updatedQuestions };
              setViewingQuestionsExam(updatedExam);
              setExams(exams.map(ex => ex.id === updatedExam.id ? updatedExam : ex));
              showToast(`Bobot semua soal diubah menjadi ${newPoints}`);
          } catch (e) {
              showToast("Gagal memperbarui bobot soal", "error");
          }
      });
  };

  const handleToggleShuffle = async (field: 'shuffleQuestions' | 'shuffleOptions', value: boolean) => {
      if (!viewingQuestionsExam) return;
      try {
          const updatedExam = { ...viewingQuestionsExam, [field]: value };
          await db.updateExamMapping(
              viewingQuestionsExam.id,
              viewingQuestionsExam.token,
              viewingQuestionsExam.durationMinutes,
              viewingQuestionsExam.examDate || '',
              viewingQuestionsExam.session || '',
              viewingQuestionsExam.schoolAccess || [],
              field === 'shuffleQuestions' ? value : viewingQuestionsExam.shuffleQuestions,
              field === 'shuffleOptions' ? value : viewingQuestionsExam.shuffleOptions
          );
          setViewingQuestionsExam(updatedExam);
          setExams(exams.map(ex => ex.id === updatedExam.id ? updatedExam : ex));
          showToast("Pengaturan acak diperbarui");
      } catch (e) {
          showToast("Gagal memperbarui pengaturan", "error");
      }
  };

  const downloadQuestionTemplate = () => {
      const headers = "No,Tipe,Jenis,Soal,Url Gambar,Opsi A,Opsi B,Opsi C,Opsi D,Kunci,Bobot";
      const example1 = "1,PG,UMUM,Siapa presiden pertama RI?,,Soekarno,Hatta,Habibie,Gus Dur,A,10";
      const blob = new Blob([headers + "\n" + example1], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'TEMPLATE_SOAL_DB.csv'; link.click();
  };
  
  const downloadStudentTemplate = () => {
      const headers = "Nomor Peserta,NAMA,SEKOLAH,KELAS,PASSWORD";
      const example = "1234567890,Ahmad Peserta,SD NEGERI 1,6A,12345";
      const blob = new Blob([headers + "\n" + example], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'TEMPLATE_PESERTA_DB.csv'; link.click();
  };

  const downloadExamViewTemplate = () => {
      const content = `1. Siapa presiden pertama Republik Indonesia?
A. Soekarno
B. Mohammad Hatta
C. Soeharto
D. B.J. Habibie
ANS: A

2. Ibukota Jawa Barat adalah Bandung.
ANS: Benar

3. Manakah yang termasuk buah-buahan?
A. Apel
B. Bayam
C. Mangga
D. Wortel
ANS: A, C

4. Pasangkanlah negara dengan ibukotanya!
KIRI
A. Indonesia
B. Jepang
C. Malaysia
KANAN
A. Jakarta
B. Tokyo
C. Kuala Lumpur
ANS: MATCH

5. Perhatikan gambar berikut. Apa nama logo ini?
Link: https://drive.google.com/file/d/1OtRkYlUrTr89sYj1Wj1hwTO7NjWXoLPf/view
A. Logo Tut Wuri Handayani
B. Logo OBT
C. Logo Sekolah
D. Logo Provinsi
ANS: B`;
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'TEMPLATE_EXAMVIEW.txt'; link.click();
  };

  const triggerImportQuestions = (examId: string) => { setImportTargetExamId(examId); setTimeout(() => questionFileRef.current?.click(), 100); };
  const triggerImportExamView = (examId: string) => { setImportTargetExamId(examId); setTimeout(() => examViewFileRef.current?.click(), 100); };
  
  const handleExportQuestions = (exam: Exam) => {
      const headers = ["No", "Tipe", "Jenis", "Soal", "Url Gambar", "Opsi A", "Opsi B", "Opsi C", "Opsi D", "Kunci", "Bobot"];
      const rows = exam.questions.map((q, idx) => {
          const options = q.options || ["", "", "", ""];
          const keyMap = ['A', 'B', 'C', 'D'];
          
          let keyString = '';
          if (q.type === 'PG' || q.type === 'TRUE_FALSE') {
              keyString = typeof q.correctIndex === 'number' ? keyMap[q.correctIndex] : 'A';
          } else if (q.type === 'PG_KOMPLEKS' && q.correctIndices) {
              keyString = q.correctIndices.map(i => keyMap[i]).join(',');
          } else if (q.type === 'MATCHING') {
              keyString = "MATCH";
          }

          // For matching, we export the pairs in Opsi A as we do in DB
          const opsiA = q.type === 'MATCHING' ? JSON.stringify(q.options) : options[0];

          return [
              q.nomor || String(idx + 1), 
              q.type, 
              "UMUM", 
              escapeCSV(q.text), 
              escapeCSV(q.imgUrl), 
              escapeCSV(opsiA), 
              escapeCSV(options[1]), 
              escapeCSV(options[2]), 
              escapeCSV(options[3]), 
              keyString, 
              String(q.points)
          ].join(",");
      });
      const blob = new Blob([headers.join(",") + "\n" + rows.join("\n")], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.setAttribute('download', `BANK_SOAL_${exam.subject}.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const onQuestionFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files?.[0] || !importTargetExamId) return;
      const file = e.target.files[0];
      const targetExam = exams.find(ex => ex.id === importTargetExamId);
      if (!targetExam) return;

      const processRows = (rows: any[]) => {
          const newQuestions: Question[] = rows.map((row, idx) => {
             let no, type, jenis, text, img, oa, ob, oc, od, key, points;
             if (Array.isArray(row)) {
                 if (row.length < 4) return null;
                 no = row[0]; type = row[1]; jenis = row[2]; text = row[3]; img = row[4]; oa = row[5]; ob = row[6]; oc = row[7]; od = row[8]; key = row[9]; points = row[10];
             } else return null;

             if (!text) return null;

             const qType = (type as QuestionType) || 'PG';
             const rawKey = key ? String(key).toUpperCase().trim() : 'A';
             const keyMap = ['A', 'B', 'C', 'D'];
             
             let cIndex: number | undefined = undefined;
             let cIndices: number[] | undefined = undefined;
             let options = [oa || '', ob || '', oc || '', od || ''];

             if (qType === 'PG' || qType === 'TRUE_FALSE') {
                 cIndex = keyMap.indexOf(rawKey);
                 if (cIndex === -1) cIndex = 0;
             } else if (qType === 'PG_KOMPLEKS') {
                 cIndices = rawKey.split(',').map(k => keyMap.indexOf(k.trim())).filter(i => i !== -1);
             } else if (qType === 'MATCHING') {
                 try {
                     if (oa && oa.startsWith('[')) options = JSON.parse(oa);
                 } catch(e) {}
             }

             return {
                  id: `imp-${idx}-${Date.now()}`,
                  nomor: no || String(idx + 1),
                  type: qType,
                  text: text || 'Soal',
                  imgUrl: img ? processImageUrl(String(img)) : undefined,
                  options: options,
                  correctIndex: cIndex,
                  correctIndices: cIndices,
                  points: parseInt(points || '10')
             };
          }).filter(Boolean) as Question[];

          if (newQuestions.length) { 
              db.addQuestions(targetExam.id, newQuestions).then(async () => {
                  const updatedExams = await db.getExams();
                  setExams(updatedExams);
                  if (viewingQuestionsExam) {
                      const updatedViewing = updatedExams.find(ex => ex.id === viewingQuestionsExam.id);
                      if (updatedViewing) setViewingQuestionsExam(updatedViewing);
                  }
                  showToast(`Berhasil import ${newQuestions.length} soal!`);
              }); 
          }
      };

      try {
          const fileText = await file.text();
          const rows = parseCSV(fileText).slice(1);
          processRows(rows);
      } catch (e: any) { console.error(e); showToast("Format Salah atau file corrupt.", 'error'); }
      e.target.value = '';
  };

  const triggerImportStudents = () => { setTimeout(() => studentFileRef.current?.click(), 100); };
  
  const onStudentFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files?.[0]) return;
      setIsProcessingImport(true);
      try {
          const fileText = await e.target.files[0].text();
          const rows = parseCSV(fileText).slice(1); 
          
          const newUsers = rows.map((row, idx) => {
              if (!row[0] || !row[0].trim()) return null;
              
              const nomorPeserta = row[0].trim();
              const name = row[1] ? row[1].trim() : 'Peserta';
              const school = row[2] ? row[2].trim() : 'UMUM';
              const kelas = row[3] ? row[3].trim() : '-';
              const password = row[4] ? row[4].trim() : '12345';

              return {
                  id: `temp-${idx}`,
                  name: name,
                  nomorPeserta: nomorPeserta,
                  username: nomorPeserta,
                  password: password,
                  school: school,
                  class: kelas,
                  role: UserRole.STUDENT
              };
          }).filter(Boolean) as User[];
          
          if (newUsers.length > 0) { 
              await db.importStudents(newUsers); 
              await loadData(); 
              showToast(`Berhasil import ${newUsers.length} peserta!`); 
          } else {
              showToast("File kosong atau format salah.", 'error');
          }
      } catch (e: any) { showToast("Gagal import peserta. Pastikan menggunakan Template CSV yang benar.", 'error'); }
      setIsProcessingImport(false);
      e.target.value = '';
  };

  const onExamViewFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files?.[0] || !importTargetExamId) return;
      const file = e.target.files[0];
      setIsProcessingImport(true);
      
      try {
          const text = await file.text();
          const lines = text.split('\n');
          const newQuestions: Question[] = [];
          
          let currentQ: any = null;
          let currentSection: 'NONE' | 'QUESTION' | 'KIRI' | 'KANAN' = 'NONE';
          let kiriOptions: string[] = [];
          let kananOptions: string[] = [];

          const saveCurrentQ = () => {
              if (currentQ) {
                  if (currentQ.type === 'MATCHING') {
                      const options: string[] = [];
                      const maxLen = Math.max(kiriOptions.length, kananOptions.length);
                      for (let i = 0; i < maxLen; i++) {
                          options.push(`${kiriOptions[i] || ''}|${kananOptions[i] || ''}`);
                      }
                      currentQ.options = options;
                  }
                  newQuestions.push(currentQ as Question);
              }
              currentQ = null;
              kiriOptions = [];
              kananOptions = [];
              currentSection = 'NONE';
          };

          for (let line of lines) {
              line = line.trim();
              if (!line) continue;

              // Detect new question: 1. or 1)
              const qMatch = line.match(/^(\d+)[\.\)]\s+(.*)/);
              if (qMatch) {
                  saveCurrentQ();
                  currentQ = {
                      id: `ev-${Date.now()}-${newQuestions.length}`,
                      nomor: qMatch[1],
                      type: 'PG',
                      text: qMatch[2],
                      options: [],
                      points: 10
                  };
                  currentSection = 'QUESTION';
                  continue;
              }

              if (!currentQ) continue;

              // Detect Matching sections
              if (line.toLowerCase() === 'kiri') {
                  currentQ.type = 'MATCHING';
                  currentSection = 'KIRI';
                  continue;
              }
              if (line.toLowerCase() === 'kanan') {
                  currentQ.type = 'MATCHING';
                  currentSection = 'KANAN';
                  continue;
              }

              // Detect Link: Link: https://...
              const lMatch = line.match(/^link:\s*(.*)/i);
              if (lMatch) {
                  currentQ.imgUrl = processImageUrl(lMatch[1]);
                  continue;
              }

              // Detect Answer: ans: a or ans: a, b or ans: benar
              const aMatch = line.match(/^ans:\s*(.*)/i);
              if (aMatch) {
                  const ansVal = aMatch[1].toLowerCase();
                  if (ansVal === 'benar' || ansVal === 'salah') {
                      currentQ.type = 'TRUE_FALSE';
                      currentQ.correctIndex = ansVal === 'benar' ? 0 : 1;
                      currentQ.options = ['Benar', 'Salah'];
                  } else if (ansVal.includes(',')) {
                      currentQ.type = 'PG_KOMPLEKS';
                      currentQ.correctIndices = ansVal.split(',').map(s => s.trim().toUpperCase().charCodeAt(0) - 65).filter(i => i >= 0 && i < 26);
                  } else {
                      currentQ.type = 'PG';
                      currentQ.correctIndex = ansVal.toUpperCase().charCodeAt(0) - 65;
                  }
                  continue;
              }

              // Detect Options: a. or A)
              const oMatch = line.match(/^([a-z])[\.\)]\s+(.*)/i);
              if (oMatch) {
                  const optText = oMatch[2];
                  if (currentSection === 'KIRI') {
                      kiriOptions.push(optText);
                  } else if (currentSection === 'KANAN') {
                      kananOptions.push(optText);
                  } else {
                      currentQ.options.push(optText);
                  }
                  continue;
              }

              // Append to question text if no other match
              if (currentSection === 'QUESTION') {
                  currentQ.text += '<br/>' + line;
              }
          }
          saveCurrentQ();

          if (newQuestions.length > 0) {
              await db.addQuestions(importTargetExamId, newQuestions);
              await loadData();
              showToast(`Berhasil import ${newQuestions.length} soal!`);
              setIsImportModalOpen(false);
          } else {
              showToast("Format tidak dikenali.", 'error');
          }
      } catch (e: any) {
          console.error(e);
          showToast("Gagal import file.", 'error');
      }
      setIsProcessingImport(false);
      e.target.value = '';
  };

  const handleExportDOC = (exam: Exam) => {
      let html = `
          <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
          <head><meta charset='utf-8'><title>${exam.title}</title></head>
          <body>
              <h1>${exam.title}</h1>
              <p>Token: ${exam.token} | Durasi: ${exam.durationMinutes} Menit</p>
              <hr/>
      `;

      exam.questions.forEach((q, i) => {
          html += `<div style="margin-bottom: 20px;">
              <p><b>${i + 1}. ${q.text}</b></p>`;
          
          if (q.type === 'PG' || q.type === 'PG_KOMPLEKS' || q.type === 'TRUE_FALSE') {
              const opts = q.type === 'TRUE_FALSE' ? ['Benar', 'Salah'] : q.options;
              opts.forEach((opt, idx) => {
                  html += `<p>${String.fromCharCode(65 + idx)}. ${opt}</p>`;
              });
          } else if (q.type === 'MATCHING') {
              html += `<ul>`;
              q.options.forEach(opt => {
                  const [l, r] = opt.split('|');
                  html += `<li>${l} --- ${r}</li>`;
              });
              html += `</ul>`;
          }
          html += `</div>`;
      });

      html += `</body></html>`;

      const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `SOAL_${exam.subject.replace(/\s/g, '_')}.doc`;
      link.click();
  };

  const handleExportPDF = (exam: Exam) => {
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;

      let totalPoints = 0;
      exam.questions.forEach(q => totalPoints += (q.points || 0));

      let content = `
          <html>
          <head>
              <title>Export Soal - ${exam.title}</title>
              <style>
                  @page { 
                      size: A4; 
                      margin: 1cm; 
                  }
                  body { 
                      font-family: 'Times New Roman', Times, serif; 
                      margin: 0; 
                      padding: 0; 
                      line-height: 1.0; 
                      font-size: 12px;
                      color: #000;
                  }
                  .header {
                      text-align: center;
                      border-bottom: 2px solid #000;
                      margin-bottom: 10px;
                      padding-bottom: 5px;
                  }
                  h1 { 
                      margin: 0;
                      font-size: 16px;
                      text-transform: uppercase;
                  }
                  .meta { 
                      margin-bottom: 15px; 
                      font-size: 11px;
                      display: flex;
                      justify-content: space-between;
                      font-weight: bold;
                  }
                  .question { 
                      margin-bottom: 15px; 
                      page-break-inside: avoid; 
                  }
                  .question-text {
                      margin-bottom: 5px;
                  }
                  .options { 
                      margin-left: 20px; 
                  }
                  .option-item {
                      margin-bottom: 2px;
                  }
                  .q-image { 
                      max-width: 100%; 
                      max-height: 250px; 
                      display: block; 
                      margin: 5px 0; 
                      border: 1px solid #eee;
                  }
                  .key-info {
                      font-size: 10px;
                      color: #333;
                      margin-top: 3px;
                      font-style: italic;
                      border-top: 1px dotted #ccc;
                      padding-top: 2px;
                      display: inline-block;
                  }
                  .total-footer {
                      margin-top: 20px;
                      border-top: 2px solid #000;
                      padding-top: 10px;
                      text-align: right;
                      font-weight: bold;
                  }
                  @media print { 
                      .no-print { display: none; } 
                  }
                  /* Reset some common HTML tags that might be in q.text */
                  p { margin: 0; }
                  ul, ol { margin: 5px 0; padding-left: 20px; }
              </style>
          </head>
          <body>
              <div class="no-print" style="position: fixed; top: 10px; right: 10px; z-index: 1000;">
                  <button onclick="window.print()" style="padding: 10px 20px; background: #2563eb; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">Cetak / Simpan PDF</button>
              </div>
              
              <div class="header">
                  <h1>${exam.title}</h1>
              </div>
              
              <div class="meta">
                  <span>Mata Pelajaran: ${exam.subject}</span>
                  <span>Token: ${exam.token}</span>
              </div>
      `;

      exam.questions.forEach((q, i) => {
          let keyStr = '-';
          if (q.type === 'PG' || q.type === 'TRUE_FALSE') {
              keyStr = String.fromCharCode(65 + (q.correctIndex || 0));
          } else if (q.type === 'PG_KOMPLEKS') {
              keyStr = (q.correctIndices || []).map(idx => String.fromCharCode(65 + idx)).join(', ');
          } else if (q.type === 'MATCHING') {
              keyStr = 'Matching';
          } else if (q.type === 'URAIAN') {
              keyStr = 'Uraian';
          }

          content += `
              <div class="question">
                  <div class="question-text">
                      <b>${i + 1}.</b> ${q.text}
                  </div>
          `;

          if (q.imgUrl) {
              content += `<img src="${q.imgUrl}" class="q-image" />`;
          }

          content += `<div class="options">`;
          
          if (q.type === 'PG' || q.type === 'PG_KOMPLEKS' || q.type === 'TRUE_FALSE') {
              const opts = q.type === 'TRUE_FALSE' ? ['Benar', 'Salah'] : q.options;
              opts.forEach((opt, idx) => {
                  content += `<div class="option-item">${String.fromCharCode(65 + idx)}. ${opt}</div>`;
              });
          } else if (q.type === 'MATCHING') {
              q.options.forEach(opt => {
                  const [l, r] = opt.split('|');
                  content += `<div class="option-item">[ ] ${l} <span style="margin: 0 10px;">.......</span> ${r}</div>`;
              });
          }
          
          content += `</div>`;
          content += `<div class="key-info">Kunci: ${keyStr} | Bobot: ${q.points}</div>`;
          content += `</div>`;
      });

      content += `
              <div class="total-footer">
                  TOTAL BOBOT: ${totalPoints}
              </div>
          </body>
          </html>
      `;

      printWindow.document.write(content);
      printWindow.document.close();
  };

  const insertMathTemplate = (latex: string) => {
      const quill = quillRef.current?.getEditor();
      if (quill) {
          const range = quill.getSelection(true);
          quill.insertEmbed(range.index, 'formula', latex);
          quill.setSelection(range.index + 1);
      }
  };

  const handleExportResultsExcel = () => {
      const filteredResults = results.filter(r => {
          const student = users.find(u => u.id === r.studentId);
          const mapping = student?.mappings?.[0];
          
          if (resultSchoolFilter !== 'ALL' && student?.school !== resultSchoolFilter) return false;
          if (resultRoomFilter !== 'ALL' && mapping?.room !== resultRoomFilter) return false;
          if (resultSessionFilter !== 'ALL' && mapping?.session !== resultSessionFilter) return false;
          if (resultClassFilter !== 'ALL' && student?.class !== resultClassFilter) return false;
          if (resultExamFilter !== 'ALL' && r.examTitle !== resultExamFilter) return false;
          
          return true;
      });

      if (filteredResults.length === 0) return showToast("Tidak ada data untuk diexport", 'info');

      // Generate HTML table for Excel (XLS format)
      let html = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
            <meta charset="utf-8">
            <!--[if gte mso 9]>
            <xml>
                <x:ExcelWorkbook>
                    <x:ExcelWorksheets>
                        <x:ExcelWorksheet>
                            <x:Name>Hasil Ujian</x:Name>
                            <x:WorksheetOptions>
                                <x:DisplayGridlines/>
                            </x:WorksheetOptions>
                        </x:ExcelWorksheet>
                    </x:ExcelWorksheets>
                </x:ExcelWorkbook>
            </xml>
            <![endif]-->
        </head>
        <body>
            <table border="1">
                <thead>
                    <tr style="background-color: #f3f4f6; font-weight: bold;">
                        <th>Nama Peserta</th>
                        <th>Nomor Peserta</th>
                        <th>Kelas</th>
                        <th>Sekolah</th>
                        <th>Mata Pelajaran</th>
                        <th>Nilai</th>
                        <th>Waktu Submit</th>
                    </tr>
                </thead>
                <tbody>
      `;

      filteredResults.forEach(r => {
          const student = users.find(u => u.id === r.studentId);
          html += `
            <tr>
                <td>${r.studentName}</td>
                <td style="mso-number-format:'\\@'">${student?.nomorPeserta || student?.username || '-'}</td>
                <td>${student?.class || '-'}</td>
                <td>${student?.school || '-'}</td>
                <td>${r.examTitle}</td>
                <td>${r.score}</td>
                <td>${new Date(r.submittedAt).toLocaleString()}</td>
            </tr>
          `;
      });

      html += `
                </tbody>
            </table>
        </body>
        </html>
      `;

      const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
      const link = document.createElement('a'); 
      link.href = URL.createObjectURL(blob); 
      link.setAttribute('download', `REKAP_HASIL_UJIAN_${new Date().toISOString().split('T')[0]}.xls`); 
      document.body.appendChild(link); 
      link.click(); 
      document.body.removeChild(link);
  };

  const getMonitoringUsers = (schoolFilter: string, roomFilter: string = 'ALL', sessionFilter: string = 'ALL') => {
      let filtered = users;
      
      // RBAC: Proktor can only see their school and room
      if (user.role === UserRole.PROKTOR) {
          if (user.school) filtered = filtered.filter(u => u.school === user.school);
          if (user.room) {
              filtered = filtered.filter(u => u.mappings?.some(m => m.room === user.room));
          }
      }

      if (schoolFilter !== 'ALL') filtered = filtered.filter(u => u.school === schoolFilter);
      if (roomFilter !== 'ALL') filtered = filtered.filter(u => u.mappings?.some(m => m.room === roomFilter));
      if (sessionFilter !== 'ALL') filtered = filtered.filter(u => u.mappings?.some(m => m.session === sessionFilter));
      
      if (monitoringSearch) filtered = filtered.filter(u => u.name.toLowerCase().includes(monitoringSearch.toLowerCase()) || u.nomorPeserta?.includes(monitoringSearch));
      return filtered;
  };

  // --- HELPER FOR STUDENT STATUS COLORS ---
  const getStudentStatusInfo = (u: User) => {
      if (u.status === 'blocked') return { color: 'bg-red-600 text-white border-red-700 animate-pulse', label: 'TERKUNCI (MELANGGAR)' };
      if (u.status === 'finished') return { color: 'bg-green-100 text-green-700 border-green-200', label: 'Selesai' };
      if (u.status === 'working') return { color: 'bg-blue-100 text-blue-700 border-blue-200', label: 'Mengerjakan' };
      return { color: 'bg-red-100 text-red-700 border-red-200', label: 'Belum Login' };
  };
  
  // -- BULK ACTION LOGIC --
  const toggleSelectAll = (filteredUsers: User[]) => {
      if (selectedStudentIds.length === filteredUsers.length) {
          setSelectedStudentIds([]);
      } else {
          setSelectedStudentIds(filteredUsers.map(u => u.id));
      }
  };

  const toggleSelectOne = (id: string) => {
      if (selectedStudentIds.includes(id)) {
          setSelectedStudentIds(prev => prev.filter(uid => uid !== id));
      } else {
          setSelectedStudentIds(prev => [...prev, id]);
      }
  };

  const handleBulkReset = async () => {
      if (!selectedStudentIds.length) return;
      showConfirm(`Reset login status untuk ${selectedStudentIds.length} peserta terpilih?`, async () => {
          setIsLoadingData(true);
          for (const id of selectedStudentIds) {
              await db.resetUserStatus(id);
          }
          setSelectedStudentIds([]);
          await loadData();
          showToast("Berhasil reset masal.");
      });
  };

  const handleGenerateToken = async () => {
      if (!monitoringExamId) return showToast("Pilih mata pelajaran terlebih dahulu!", 'error');
      
      const newToken = Math.random().toString(36).substring(2, 8).toUpperCase();
      
      setIsLoadingData(true);
      try {
          await db.updateExamToken(monitoringExamId, newToken);
          await loadData(); // Refresh exams to show new token
          showToast(`Token berhasil digenerate: ${newToken}`);
      } catch (e: any) {
          showToast(`Gagal generate token: ${e.message}`, 'error');
      } finally {
          setIsLoadingData(false);
      }
  };

  // Derived Values
  const schools = (Array.from(new Set(users.map(u => u.school || 'Unknown'))).filter(Boolean) as string[]).sort();
  const rooms = (Array.from(new Set(users.flatMap(u => u.mappings?.map(m => m.room) || []))).filter(Boolean) as string[]).sort();
  const sessions = (Array.from(new Set(users.flatMap(u => u.mappings?.map(m => m.session) || []))).filter(Boolean) as string[]).sort();
  const classes = (Array.from(new Set(users.map(u => u.class))).filter(Boolean) as string[]).sort();
  const resultExams = (Array.from(new Set(results.map(r => r.examTitle))).filter(Boolean) as string[]).sort();
  const totalSchools = schools.length;

  // Responsive Nav Item (Icons on Mobile, Full on Desktop)
  const NavItem = ({ id, label, icon: Icon }: { id: typeof activeTab, label: string, icon: any }) => (
      <button 
        onClick={() => { setActiveTab(id); setDashboardView('MAIN'); }} 
        className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-start space-x-3'} p-3 md:px-4 md:py-3 rounded-lg transition mb-1 text-sm font-medium ${activeTab === id ? 'bg-white/10 text-white shadow-inner ring-1 ring-white/20' : 'text-blue-100 hover:bg-white/5'}`}
        title={label}
      >
          <Icon size={20} className="flex-shrink-0" />
          {!isSidebarCollapsed && <span className="hidden md:block truncate">{label}</span>}
      </button>
  );
  
  // Monitoring Filtered Users
  let finalMonitoringUsers = getMonitoringUsers('ALL').filter(u => {
      const matchesRoom = dashboardRoomFilter === 'ALL' || u.mappings?.some(m => m.room === dashboardRoomFilter);
      const matchesSession = dashboardSessionFilter === 'ALL' || u.mappings?.some(m => m.session === dashboardSessionFilter);
      const matchesSchool = monitoringSchoolFilter === 'ALL' || u.school === monitoringSchoolFilter;
      const matchesClass = monitoringClassFilter === 'ALL' || u.class === monitoringClassFilter;
      const matchesSubject = monitoringSubjectFilter === 'ALL' || u.mappings?.some(m => m.examId === monitoringSubjectFilter);
      return matchesRoom && matchesSession && matchesSchool && matchesClass && matchesSubject;
  });

  if (monitoringSortConfig) {
      finalMonitoringUsers.sort((a, b) => {
          let aValue: any = '';
          let bValue: any = '';
          
          if (monitoringSortConfig.key === 'name') {
              aValue = a.name.toLowerCase();
              bValue = b.name.toLowerCase();
          } else if (monitoringSortConfig.key === 'nomorPeserta') {
              aValue = a.nomorPeserta || '';
              bValue = b.nomorPeserta || '';
          } else if (monitoringSortConfig.key === 'school') {
              aValue = a.school || '';
              bValue = b.school || '';
          } else if (monitoringSortConfig.key === 'room') {
              aValue = a.mappings?.[0]?.room || '';
              bValue = b.mappings?.[0]?.room || '';
          } else if (monitoringSortConfig.key === 'session') {
              aValue = a.mappings?.[0]?.session || '';
              bValue = b.mappings?.[0]?.session || '';
          } else if (monitoringSortConfig.key === 'status') {
              aValue = getStudentStatusInfo(a).label;
              bValue = getStudentStatusInfo(b).label;
          }

          if (aValue < bValue) return monitoringSortConfig.direction === 'asc' ? -1 : 1;
          if (aValue > bValue) return monitoringSortConfig.direction === 'asc' ? 1 : -1;
          return 0;
      });
  }

  const handleMonitoringSort = (key: string) => {
      let direction: 'asc' | 'desc' = 'asc';
      if (monitoringSortConfig && monitoringSortConfig.key === key && monitoringSortConfig.direction === 'asc') {
          direction = 'desc';
      }
      setMonitoringSortConfig({ key, direction });
  };

  // --- Calculate Available Schools for Mapping (Filtering Logic) ---
  const getSchoolsAvailability = () => {
      const busySchools = new Set<string>();
      
      exams.forEach(ex => {
          if (editingExam && ex.id === editingExam.id) return;
          if (ex.examDate === editDate && ex.session === editSession && ex.schoolAccess) {
              ex.schoolAccess.forEach(s => busySchools.add(s));
          }
      });

      const assigned = editSchoolAccess.sort();
      const available = schools.filter(s => 
          !assigned.includes(s) && 
          !busySchools.has(s) && 
          s.toLowerCase().includes(mappingSearch.toLowerCase())
      );
      const busyCount = busySchools.size;
      return { assigned, available, busyCount };
  };

  const { assigned: assignedSchools, available: availableSchools, busyCount } = isEditModalOpen ? getSchoolsAvailability() : { assigned: [], available: [], busyCount: 0 };

  // --- AGGREGATION FOR "JUMLAH SEKOLAH" DASHBOARD VIEW ---
  const getSchoolStats = (schoolName: string) => {
      const studentsInSchool = users.filter(u => u.school === schoolName);
      const notLogin = studentsInSchool.filter(u => u.status !== 'working' && u.status !== 'finished').length;
      const working = studentsInSchool.filter(u => u.status === 'working').length;
      const finished = studentsInSchool.filter(u => u.status === 'finished').length;
      
      // Get exam mapping for today
      const todayStr = localTodayStr;
      const todayExam = exams.find(e => e.examDate === todayStr && e.schoolAccess?.includes(schoolName));
      
      return { notLogin, working, finished, total: studentsInSchool.length, todayExamTitle: todayExam?.title || '-' };
  };

  const handleDownloadSchoolStats = () => {
      const headers = ["Nama Sekolah", "Total Peserta", "Belum Login", "Mengerjakan", "Selesai", "Mapel Hari Ini"];
      const rows = schools.map(s => {
          const stats = getSchoolStats(s);
          return [escapeCSV(s), stats.total, stats.notLogin, stats.working, stats.finished, escapeCSV(stats.todayExamTitle)].join(",");
      });
      const blob = new Blob([headers.join(",") + "\n" + rows.join("\n")], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.setAttribute('download', `REKAP_SEKOLAH_HARI_INI.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const handleSaveStudentMapping = async () => {
      if (mappingSelectedIds.length === 0) return showToast("Pilih peserta terlebih dahulu!", 'error');
      if (!mappingEditForm.examId) return showToast("Pilih Mata Pelajaran terlebih dahulu!", 'error');
      
      setIsLoadingData(true);
      try {
          let finalExamDate = mappingEditForm.examDate;
          if (mappingMode === 'TRYOUT') {
              finalExamDate = `${mappingEditForm.examDate}|${mappingEditForm.endDate}`;
          }

          await db.updateStudentMapping(mappingSelectedIds, {
              examId: mappingEditForm.examId,
              examDate: finalExamDate || undefined,
              room: mappingEditForm.room || undefined,
              session: mappingMode === 'TRYOUT' ? '-' : (mappingEditForm.session || undefined)
          });
          await loadData();
          setMappingSelectedIds([]);
          showToast(`Berhasil update mapping untuk ${mappingSelectedIds.length} peserta!`);
      } catch (e: any) {
          showToast(e.message || "Gagal update mapping", 'error');
      }
      setIsLoadingData(false);
  };

  const getMappingUsers = () => {
      let filtered = users.filter(u => u.role === UserRole.STUDENT);
      
      if (mappingSchoolFilter !== 'ALL') filtered = filtered.filter(u => u.school === mappingSchoolFilter);
      if (mappingClassFilter !== 'ALL') filtered = filtered.filter(u => u.class === mappingClassFilter);

      // Filter by room/session from mappings
      if (mappingRoomFilter !== 'ALL' || mappingSessionFilter !== 'ALL' || mappingEditForm.examId) {
          filtered = filtered.filter(u => {
              const m = u.mappings?.find(map => 
                  (!mappingEditForm.examId || map.examId === mappingEditForm.examId) &&
                  (mappingRoomFilter === 'ALL' || map.room === mappingRoomFilter) &&
                  (mappingSessionFilter === 'ALL' || map.session === mappingSessionFilter)
              );
              
              // If we are filtering by room/session, we only want students who HAVE a mapping matching that
              if (mappingRoomFilter !== 'ALL' || mappingSessionFilter !== 'ALL') return !!m;
              return true;
          });
      }

      // Sorting
      filtered.sort((a, b) => {
          let valA: any = '';
          let valB: any = '';

          if (mappingSort.column === 'room' || mappingSort.column === 'session' || mappingSort.column === 'examId') {
              const mA = a.mappings?.find(m => !mappingEditForm.examId || m.examId === mappingEditForm.examId);
              const mB = b.mappings?.find(m => !mappingEditForm.examId || m.examId === mappingEditForm.examId);
              
              if (mappingSort.column === 'room') { valA = mA?.room || ''; valB = mB?.room || ''; }
              else if (mappingSort.column === 'session') { valA = mA?.session || ''; valB = mB?.session || ''; }
              else if (mappingSort.column === 'examId') { valA = mA?.examId || ''; valB = mB?.examId || ''; }
          } else {
              valA = String(a[mappingSort.column] || '').toLowerCase();
              valB = String(b[mappingSort.column] || '').toLowerCase();
          }
          
          if (valA < valB) return mappingSort.direction === 'asc' ? -1 : 1;
          if (valA > valB) return mappingSort.direction === 'asc' ? 1 : -1;
          
          return 0;
      });

      return mappingLimit === 0 ? filtered : filtered.slice(0, mappingLimit);
  };

  const handleSort = (col: keyof User | 'room' | 'session' | 'examId') => {
      if (mappingSort.column === col) {
          setMappingSort({ column: col, direction: mappingSort.direction === 'asc' ? 'desc' : 'asc' });
      } else {
          setMappingSort({ column: col, direction: 'asc' });
      }
  };

  const handleResultSort = (col: string) => {
      if (resultSort.column === col) {
          setResultSort({ column: col, direction: resultSort.direction === 'asc' ? 'desc' : 'asc' });
      } else {
          setResultSort({ column: col, direction: 'asc' });
      }
  };

  const toggleSelectAllMapping = (checked: boolean) => {
      if (checked) {
          const currentIds = getMappingUsers().map(u => u.id);
          setMappingSelectedIds(Array.from(new Set([...mappingSelectedIds, ...currentIds])));
      } else {
          const currentIds = getMappingUsers().map(u => u.id);
          setMappingSelectedIds(mappingSelectedIds.filter(id => !currentIds.includes(id)));
      }
  };

  const getRecapData = () => {
      const recap: Record<string, Record<string, Record<string, number>>> = {}; // School -> Room -> Session -> Count
      
      users.forEach(u => {
          if (u.role === UserRole.STUDENT && u.school && u.mappings) {
              u.mappings.forEach(m => {
                  if (!mappingEditForm.examId || m.examId === mappingEditForm.examId) {
                      if (!recap[u.school!]) recap[u.school!] = {};
                      if (!recap[u.school!][m.room]) recap[u.school!][m.room] = {};
                      if (!recap[u.school!][m.room][m.session]) recap[u.school!][m.room][m.session] = 0;
                      recap[u.school!][m.room][m.session]++;
                  }
              });
          }
      });

      // Sort rooms and sessions within each school
      const sortedRecap: Record<string, Record<string, Record<string, number>>> = {};
      Object.keys(recap).sort().forEach(school => {
          sortedRecap[school] = {};
          Object.keys(recap[school]).sort().forEach(room => {
              sortedRecap[school][room] = {};
              Object.keys(recap[school][room]).sort().forEach(session => {
                  sortedRecap[school][room][session] = recap[school][room][session];
              });
          });
      });
      
      return sortedRecap;
  };

  // --- RENDER CONTENT BASED ON DASHBOARD VIEW ---
   const renderDashboardContent = () => {
    if (dashboardView === 'STUDENTS_DETAIL') {
        const filteredSchools = dashboardSchoolFilter === 'ALL' ? schools : [dashboardSchoolFilter];
        
        return (
            <div className="space-y-6 animate-in slide-in-from-right duration-300">
                <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex-wrap gap-4">
                    <div className="flex items-center gap-2">
                        <button onClick={() => setDashboardView('MAIN')} className="p-2 hover:bg-gray-100 rounded-full transition"><ArrowLeft size={20}/></button>
                        <h3 className="font-bold text-lg text-gray-800">Detail Status Peserta (Realtime)</h3>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        <select className="border rounded p-2 text-sm min-w-[150px]" value={dashboardSchoolFilter} onChange={e => setDashboardSchoolFilter(e.target.value)}>
                            <option value="ALL">Semua Sekolah</option>
                            {schools.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <select className="border rounded p-2 text-sm min-w-[120px]" value={dashboardRoomFilter} onChange={e => setDashboardRoomFilter(e.target.value)}>
                            <option value="ALL">Semua Ruang</option>
                            {rooms.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <select className="border rounded p-2 text-sm min-w-[120px]" value={dashboardSessionFilter} onChange={e => setDashboardSessionFilter(e.target.value)}>
                            <option value="ALL">Semua Sesi</option>
                            {sessions.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 font-bold border-b text-gray-600 uppercase text-xs">
                                <tr>
                                    <th className="p-4">Nama Peserta</th>
                                    <th className="p-4">Sekolah</th>
                                    <th className="p-4">Kelas</th>
                                    <th className="p-4 text-center">Ruang</th>
                                    <th className="p-4 text-center">Sesi</th>
                                    <th className="p-4 text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {users
                                    .filter(u => {
                                        const matchesSchool = dashboardSchoolFilter === 'ALL' || u.school === dashboardSchoolFilter;
                                        const matchesRoom = dashboardRoomFilter === 'ALL' || u.mappings?.some(m => m.room === dashboardRoomFilter);
                                        const matchesSession = dashboardSessionFilter === 'ALL' || u.mappings?.some(m => m.session === dashboardSessionFilter);
                                        return matchesSchool && matchesRoom && matchesSession;
                                    })
                                    .map(u => {
                                        const status = getStudentStatusInfo(u);
                                        const mapping = u.mappings?.[0];
                                        return (
                                            <tr key={u.id} className="hover:bg-gray-50 transition">
                                                <td className="p-4 font-bold text-gray-700">{u.name}</td>
                                                <td className="p-4 text-gray-500">{u.school}</td>
                                                <td className="p-4 text-gray-500">{u.class || '-'}</td>
                                                <td className="p-4 text-center">
                                                    <span className="text-xs font-bold bg-green-50 text-green-700 px-2 py-1 rounded border border-green-100">{mapping?.room || '-'}</span>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <span className="text-xs font-bold bg-purple-50 text-purple-700 px-2 py-1 rounded border border-purple-100">{mapping?.session || '-'}</span>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold border uppercase ${status.color}`}>
                                                        {status.label}
                                                    </span>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                {users.filter(u => {
                                    const matchesSchool = dashboardSchoolFilter === 'ALL' || u.school === dashboardSchoolFilter;
                                    const matchesRoom = dashboardRoomFilter === 'ALL' || u.mappings?.some(m => m.room === dashboardRoomFilter);
                                    const matchesSession = dashboardSessionFilter === 'ALL' || u.mappings?.some(m => m.session === dashboardSessionFilter);
                                    return matchesSchool && matchesRoom && matchesSession;
                                }).length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-gray-400 italic">Tidak ada data peserta yang sesuai filter.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    }

    if (dashboardView === 'SCHOOLS_DETAIL') {
        const filteredSchoolsList = dashboardSchoolFilter === 'ALL' ? schools : [dashboardSchoolFilter];

        return (
            <div className="space-y-6 animate-in slide-in-from-right duration-300">
                <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100 gap-4">
                    <div className="flex items-center gap-2">
                        <button onClick={() => setDashboardView('MAIN')} className="p-2 hover:bg-gray-100 rounded-full transition"><ArrowLeft size={20}/></button>
                        <h3 className="font-bold text-lg text-gray-800">Rekap Mapping & Status Sekolah</h3>
                    </div>
                    <div className="flex gap-2 w-full md:w-auto">
                         <select className="border rounded p-2 text-sm flex-1 md:min-w-[200px]" value={dashboardSchoolFilter} onChange={e => setDashboardSchoolFilter(e.target.value)}>
                            <option value="ALL">Semua Sekolah</option>
                            {schools.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <button onClick={handleDownloadSchoolStats} className="bg-green-600 text-white px-3 py-2 rounded text-sm font-bold flex items-center hover:bg-green-700"><Download size={16} className="md:mr-2"/><span className="hidden md:inline">CSV</span></button>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 font-bold border-b text-gray-600 uppercase text-xs">
                                <tr>
                                    <th className="p-4">Nama Sekolah</th>
                                    <th className="p-4 text-center">Total Peserta</th>
                                    <th className="p-4 text-center text-red-600">Belum Login</th>
                                    <th className="p-4 text-center text-blue-600">Mengerjakan</th>
                                    <th className="p-4 text-center text-green-600">Selesai</th>
                                    <th className="p-4">Jadwal Mapel Hari Ini</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {sessions.map(session => {
                                    const sessionSchools = filteredSchoolsList.filter(school => {
                                        const schoolUsers = users.filter(u => u.school === school);
                                        return schoolUsers.some(u => u.mappings?.some(m => m.session === session));
                                    });

                                    if (sessionSchools.length === 0) return null;

                                    let sessionTotal = 0;
                                    let sessionNotLogin = 0;
                                    let sessionWorking = 0;
                                    let sessionFinished = 0;

                                    return (
                                        <React.Fragment key={session}>
                                            <tr className="bg-gray-100/50">
                                                <td colSpan={6} className="p-3 font-black text-blue-800 uppercase text-xs tracking-wider">
                                                    {session}
                                                </td>
                                            </tr>
                                            {sessionSchools.map(school => {
                                                const stats = getSchoolStats(school);
                                                // Filter stats for this session only? 
                                                // The requirement says "Rekap Mapping & Status Sekolah ditampilkan persesi"
                                                // So I should probably filter the stats by session too.
                                                
                                                const sessionUsers = users.filter(u => u.school === school && u.mappings?.some(m => m.session === session));
                                                const sTotal = sessionUsers.length;
                                                const sNotLogin = sessionUsers.filter(u => u.status !== 'working' && u.status !== 'finished').length;
                                                const sWorking = sessionUsers.filter(u => u.status === 'working').length;
                                                const sFinished = sessionUsers.filter(u => u.status === 'finished').length;

                                                sessionTotal += sTotal;
                                                sessionNotLogin += sNotLogin;
                                                sessionWorking += sWorking;
                                                sessionFinished += sFinished;

                                                return (
                                                    <tr key={`${session}-${school}`} className="hover:bg-gray-50">
                                                        <td className="p-4 font-bold text-gray-700 pl-8">{school}</td>
                                                        <td className="p-4 text-center font-mono">{sTotal}</td>
                                                        <td className="p-4 text-center font-mono text-red-600 font-bold bg-red-50">{sNotLogin}</td>
                                                        <td className="p-4 text-center font-mono text-blue-600 font-bold bg-blue-50">{sWorking}</td>
                                                        <td className="p-4 text-center font-mono text-green-600 font-bold bg-green-50">{sFinished}</td>
                                                        <td className="p-4 text-xs font-bold text-gray-500">{stats.todayExamTitle}</td>
                                                    </tr>
                                                );
                                            })}
                                            <tr className="bg-blue-50/30 font-bold border-t-2 border-blue-100">
                                                <td className="p-4 text-blue-800 uppercase text-xs pl-8">TOTAL {session}</td>
                                                <td className="p-4 text-center font-mono">{sessionTotal}</td>
                                                <td className="p-4 text-center font-mono text-red-600">{sessionNotLogin}</td>
                                                <td className="p-4 text-center font-mono text-blue-600">{sessionWorking}</td>
                                                <td className="p-4 text-center font-mono text-green-600">{sessionFinished}</td>
                                                <td className="p-4"></td>
                                            </tr>
                                        </React.Fragment>
                                    );
                                })}
                                {filteredSchoolsList.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-gray-400 italic">Tidak ada data sekolah.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    }

    if (dashboardView === 'EXAMS_DETAIL') {
        const relevantUsers = users.filter(u => {
             const hasAccess = exams.some(e => e.schoolAccess?.includes(u.school || ''));
             return hasAccess && (dashboardSchoolFilter === 'ALL' || u.school === dashboardSchoolFilter);
        });

        const finishedUsers = relevantUsers.filter(u => u.status === 'finished');
        const unfinishedUsers = relevantUsers.filter(u => u.status !== 'finished');

        return (
            <div className="space-y-6 animate-in slide-in-from-right duration-300">
                <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex-wrap gap-4">
                    <div className="flex items-center gap-2">
                         <button onClick={() => setDashboardView('MAIN')} className="p-2 hover:bg-gray-100 rounded-full transition"><ArrowLeft size={20}/></button>
                         <h3 className="font-bold text-lg text-gray-800">Detail Status Penyelesaian</h3>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        <select className="border rounded p-2 text-sm min-w-[200px]" value={dashboardSchoolFilter} onChange={e => setDashboardSchoolFilter(e.target.value)}>
                            <option value="ALL">Semua Sekolah Termapping</option>
                            {schools.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <select className="border rounded p-2 text-sm min-w-[120px]" value={dashboardRoomFilter} onChange={e => setDashboardRoomFilter(e.target.value)}>
                            <option value="ALL">Semua Ruang</option>
                            {rooms.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <select className="border rounded p-2 text-sm min-w-[120px]" value={dashboardSessionFilter} onChange={e => setDashboardSessionFilter(e.target.value)}>
                            <option value="ALL">Semua Sesi</option>
                            {sessions.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                        <div className="p-4 bg-green-50 border-b border-green-100 flex justify-between items-center">
                            {(() => {
                                const filteredFinished = users.filter(u => {
                                    const isFinished = u.status === 'finished';
                                    const matchesSchool = dashboardSchoolFilter === 'ALL' || u.school === dashboardSchoolFilter;
                                    const matchesRoom = dashboardRoomFilter === 'ALL' || u.mappings?.some(m => m.room === dashboardRoomFilter);
                                    const matchesSession = dashboardSessionFilter === 'ALL' || u.mappings?.some(m => m.session === dashboardSessionFilter);
                                    return isFinished && matchesSchool && matchesRoom && matchesSession;
                                });
                                return (
                                    <>
                                        <h4 className="font-bold text-green-800 flex items-center"><CheckCircle size={18} className="mr-2"/> Sudah Selesai ({filteredFinished.length})</h4>
                                    </>
                                );
                            })()}
                        </div>
                        <div className="p-0 overflow-y-auto max-h-[500px]">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-gray-50 font-bold border-b text-gray-500">
                                    <tr><th className="p-3">Nama</th><th className="p-3">Sekolah</th><th className="p-3">Ruang/Sesi</th></tr>
                                </thead>
                                <tbody className="divide-y">
                                    {users.filter(u => {
                                        const isFinished = u.status === 'finished';
                                        const matchesSchool = dashboardSchoolFilter === 'ALL' || u.school === dashboardSchoolFilter;
                                        const matchesRoom = dashboardRoomFilter === 'ALL' || u.mappings?.some(m => m.room === dashboardRoomFilter);
                                        const matchesSession = dashboardSessionFilter === 'ALL' || u.mappings?.some(m => m.session === dashboardSessionFilter);
                                        return isFinished && matchesSchool && matchesRoom && matchesSession;
                                    }).map(u => (
                                        <tr key={u.id}>
                                            <td className="p-3 font-medium">{u.name}</td>
                                            <td className="p-3 text-gray-500">{u.school}</td>
                                            <td className="p-3 text-gray-400">{u.mappings?.[0]?.room || '-'}/{u.mappings?.[0]?.session || '-'}</td>
                                        </tr>
                                    ))}
                                    {users.filter(u => {
                                        const isFinished = u.status === 'finished';
                                        const matchesSchool = dashboardSchoolFilter === 'ALL' || u.school === dashboardSchoolFilter;
                                        const matchesRoom = dashboardRoomFilter === 'ALL' || u.mappings?.some(m => m.room === dashboardRoomFilter);
                                        const matchesSession = dashboardSessionFilter === 'ALL' || u.mappings?.some(m => m.session === dashboardSessionFilter);
                                        return isFinished && matchesSchool && matchesRoom && matchesSession;
                                    }).length === 0 && <tr><td colSpan={3} className="p-4 text-center text-gray-400">Tidak ada data.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                        <div className="p-4 bg-red-50 border-b border-red-100 flex justify-between items-center">
                             {(() => {
                                const filteredUnfinished = users.filter(u => {
                                    const isUnfinished = u.status !== 'finished';
                                    const matchesSchool = dashboardSchoolFilter === 'ALL' || u.school === dashboardSchoolFilter;
                                    const matchesRoom = dashboardRoomFilter === 'ALL' || u.mappings?.some(m => m.room === dashboardRoomFilter);
                                    const matchesSession = dashboardSessionFilter === 'ALL' || u.mappings?.some(m => m.session === dashboardSessionFilter);
                                    return isUnfinished && matchesSchool && matchesRoom && matchesSession;
                                });
                                return (
                                    <>
                                        <h4 className="font-bold text-red-800 flex items-center"><XCircle size={18} className="mr-2"/> Belum Selesai ({filteredUnfinished.length})</h4>
                                    </>
                                );
                            })()}
                        </div>
                        <div className="p-0 overflow-y-auto max-h-[500px]">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-gray-50 font-bold border-b text-gray-500">
                                    <tr><th className="p-3">Nama</th><th className="p-3">Sekolah</th><th className="p-3">Status</th><th className="p-3">Ruang/Sesi</th></tr>
                                </thead>
                                <tbody className="divide-y">
                                    {users.filter(u => {
                                        const isUnfinished = u.status !== 'finished';
                                        const matchesSchool = dashboardSchoolFilter === 'ALL' || u.school === dashboardSchoolFilter;
                                        const matchesRoom = dashboardRoomFilter === 'ALL' || u.mappings?.some(m => m.room === dashboardRoomFilter);
                                        const matchesSession = dashboardSessionFilter === 'ALL' || u.mappings?.some(m => m.session === dashboardSessionFilter);
                                        return isUnfinished && matchesSchool && matchesRoom && matchesSession;
                                    }).map(u => {
                                        const st = getStudentStatusInfo(u);
                                        return (
                                            <tr key={u.id}>
                                                <td className="p-3 font-medium">{u.name}</td>
                                                <td className="p-3 text-gray-500">{u.school}</td>
                                                <td className="p-3"><span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${st.color}`}>{st.label}</span></td>
                                                <td className="p-3 text-gray-400">{u.mappings?.[0]?.room || '-'}/{u.mappings?.[0]?.session || '-'}</td>
                                            </tr>
                                        )
                                    })}
                                    {users.filter(u => {
                                        const isUnfinished = u.status !== 'finished';
                                        const matchesSchool = dashboardSchoolFilter === 'ALL' || u.school === dashboardSchoolFilter;
                                        const matchesRoom = dashboardRoomFilter === 'ALL' || u.mappings?.some(m => m.room === dashboardRoomFilter);
                                        const matchesSession = dashboardSessionFilter === 'ALL' || u.mappings?.some(m => m.session === dashboardSessionFilter);
                                        return isUnfinished && matchesSchool && matchesRoom && matchesSession;
                                    }).length === 0 && <tr><td colSpan={4} className="p-4 text-center text-gray-400">Tidak ada data.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // --- BAR CHART DATA PREPARATION (ROOM & SESSION BASED) ---
    const todayStr = graphDate; 
    const isAllSessions = graphFilterMode === 'ALL';
    
    // Get all unique Room + Session combinations from user mappings
    const groupsFromMappings = new Set<string>();
    users.forEach(u => {
        u.mappings?.forEach(m => {
            if (isAllSessions || m.examDate === todayStr) {
                if (m.room && m.session) {
                    groupsFromMappings.add(`${m.room}|${m.session}`);
                }
            }
        });
    });
    
    const sortedGroups = Array.from(groupsFromMappings).sort((a, b) => {
        const [roomA, sessionA] = a.split('|');
        const [roomB, sessionB] = b.split('|');
        if (roomA !== roomB) return roomA.localeCompare(roomB);
        return sessionA.localeCompare(sessionB);
    });
    
    const sessionChartData = sortedGroups.map(groupKey => {
        const [roomName, sessionName] = groupKey.split('|');
        
        // Find users mapped to this specific room and session
        const groupUsers = users.filter(u => 
            u.mappings?.some(m => 
                m.room === roomName && 
                m.session === sessionName && 
                (isAllSessions || m.examDate === todayStr)
            )
        );
        
        const finishedCount = groupUsers.filter(u => u.status === 'finished').length;
        const workingCount = groupUsers.filter(u => u.status === 'working').length;
        const notLoginCount = groupUsers.filter(u => u.status !== 'working' && u.status !== 'finished').length;
        
        return {
            name: `${roomName} - ${sessionName}`,
            'Belum Login': notLoginCount,
            'Mengerjakan': workingCount,
            'Selesai': finishedCount
        };
    });

    // --- DEFAULT MAIN DASHBOARD VIEW ---
    return (
        <div className="space-y-6 animate-in fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div onClick={() => setDashboardView('STUDENTS_DETAIL')} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition cursor-pointer group">
                    <div className="flex justify-between items-start mb-4">
                        <div className="bg-blue-50 p-3 rounded-xl group-hover:scale-110 transition-transform">
                            <Users className="text-blue-600" size={24}/>
                        </div>
                        <ArrowRight className="text-gray-300 group-hover:text-gray-600 transition-colors" size={16}/>
                    </div>
                    <div className="space-y-1">
                        <h3 className="text-3xl font-bold text-gray-800">{users.filter(u => u.status === 'working').length}</h3>
                        <p className="text-sm font-medium text-gray-500">Peserta Online</p>
                        <p className="text-[10px] text-gray-400 mt-2">{users.filter(u => u.status === 'working').length} sedang mengerjakan</p>
                    </div>
                </div>

                <div onClick={() => setDashboardView('EXAMS_DETAIL')} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition cursor-pointer group">
                    <div className="flex justify-between items-start mb-4">
                        <div className="bg-purple-50 p-3 rounded-xl group-hover:scale-110 transition-transform">
                            <BookOpen className="text-purple-600" size={24}/>
                        </div>
                        <ArrowRight className="text-gray-300 group-hover:text-gray-600 transition-colors" size={16}/>
                    </div>
                    <div className="space-y-1">
                        <h3 className="text-3xl font-bold text-gray-800">{exams.length}</h3>
                        <p className="text-sm font-medium text-gray-500">Total Mapel</p>
                        <p className="text-[10px] text-gray-400 mt-2">{exams.reduce((acc, curr) => acc + (curr.questionCount || 0), 0)} total soal tersedia</p>
                    </div>
                </div>

                <div onClick={() => setDashboardView('EXAMS_DETAIL')} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition cursor-pointer group">
                    <div className="flex justify-between items-start mb-4">
                        <div className="bg-green-50 p-3 rounded-xl group-hover:scale-110 transition-transform">
                            <CheckCircle2 className="text-green-600" size={24}/>
                        </div>
                        <ArrowRight className="text-gray-300 group-hover:text-gray-600 transition-colors" size={16}/>
                    </div>
                    <div className="space-y-1">
                        <h3 className="text-3xl font-bold text-gray-800">{results.length}</h3>
                        <p className="text-sm font-medium text-gray-500">Ujian Selesai</p>
                        <p className="text-[10px] text-gray-400 mt-2">Hasil ujian tersimpan</p>
                    </div>
                </div>

                <div onClick={() => setActiveTab('MONITORING')} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition cursor-pointer group">
                    <div className="flex justify-between items-start mb-4">
                        <div className="bg-red-50 p-3 rounded-xl group-hover:scale-110 transition-transform">
                            <TriangleAlert className="text-red-600" size={24}/>
                        </div>
                        <ArrowRight className="text-gray-300 group-hover:text-gray-600 transition-colors" size={16}/>
                    </div>
                    <div className="space-y-1">
                        <h3 className="text-3xl font-bold text-gray-800">{results.filter(r => r.cheatingAttempts > 0).length}</h3>
                        <p className="text-sm font-medium text-gray-500">Pelanggaran</p>
                        <p className="text-[10px] text-gray-400 mt-2">Deteksi kecurangan sistem</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                    <h3 className="font-bold text-gray-800 mb-6 flex items-center">
                        <Activity className="mr-2 text-blue-600" size={18}/> Status Sistem
                    </h3>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                            <div className="flex items-center gap-3">
                                <Database className="text-gray-400" size={16}/>
                                <span className="text-sm font-medium text-gray-600">Koneksi Database</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                                <span className="text-xs font-bold text-green-600">Stabil</span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                            <div className="flex items-center gap-3">
                                <ShieldCheck className="text-gray-400" size={16}/>
                                <span className="text-sm font-medium text-gray-600">Anti-Cheat Engine</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                <span className="text-xs font-bold text-green-600">Aktif</span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                            <div className="flex items-center gap-3">
                                <Monitor className="text-gray-400" size={16}/>
                                <span className="text-sm font-medium text-gray-600">Server Response</span>
                            </div>
                            <span className="text-xs font-bold text-blue-600">24ms</span>
                        </div>
                    </div>
                    
                    <div className="mt-8 p-4 bg-blue-50 rounded-xl border border-blue-100">
                        <div className="flex items-start gap-3">
                            <Clock className="text-blue-600 mt-0.5" size={18}/>
                            <div>
                                <h4 className="text-xs font-bold text-blue-800">Waktu Server</h4>
                                <p className="text-[10px] text-blue-600 mt-1">{new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                                <p className="text-lg font-mono font-bold text-blue-700 mt-1">{new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                    <h3 className="font-bold text-gray-800 mb-6 flex items-center">
                        <Activity className="mr-2 text-purple-600" size={18}/> Aktivitas Terkini
                    </h3>
                    <div className="space-y-4">
                        {results.length === 0 ? (
                            <div className="text-center text-gray-400 italic p-8">Belum ada aktivitas ujian.</div>
                        ) : (
                            results.slice(0, 5).map(r => (
                                <div key={r.id} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-xl transition border border-transparent hover:border-gray-100">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs">
                                            {(r.studentName || 'NN').substring(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-gray-800">{r.studentName || 'Peserta'}</h4>
                                            <p className="text-[10px] text-gray-400">Menyelesaikan {r.examTitle || 'Ujian'}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-sm font-bold text-green-600">{r.score}</span>
                                        <p className="text-[10px] text-gray-400">{new Date(r.submittedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    {results.length > 0 && (
                        <button onClick={() => setActiveTab('HASIL_UJIAN')} className="w-full mt-6 py-3 text-sm font-bold text-purple-600 hover:bg-purple-50 rounded-xl transition border border-dashed border-purple-200">
                            Lihat Semua Hasil
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
  };

  return (
    <div className="flex h-screen bg-gray-100 font-sans overflow-hidden print:h-auto print:overflow-visible">
      <input type="file" ref={studentFileRef} className="hidden" accept=".csv" onChange={onStudentFileChange} />
      <input type="file" ref={questionFileRef} className="hidden" accept=".csv" onChange={onQuestionFileChange} />
      <input type="file" ref={examViewFileRef} className="hidden" accept=".txt" onChange={onExamViewFileChange} />

      {/* RESPONSIVE SIDEBAR: Collapsible */}
      <aside className={`${isSidebarCollapsed ? 'w-16' : 'w-16 md:w-64'} flex-shrink-0 text-white flex flex-col shadow-xl z-20 transition-all duration-300 print:hidden`} style={{ backgroundColor: themeColor }}>
          <div className={`p-4 md:p-6 border-b border-white/10 flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
              <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-3'}`}>
                  <BookOpen size={28} className="text-white drop-shadow-md flex-shrink-0" />
                  {!isSidebarCollapsed && (
                      <div className="hidden md:block overflow-hidden whitespace-nowrap">
                          <h1 className="font-bold text-lg tracking-wide">
                              {user.role === UserRole.PROKTOR 
                                  ? `PROKTOR ${user.username.split('-').pop() || '000'}` 
                                  : 'ADMIN OBT'}
                          </h1>
                          <p className="text-xs text-blue-100 opacity-80">
                              {user.role === UserRole.PROKTOR 
                                  ? (
                                      <span className="flex flex-col">
                                          <span className="font-bold">{user.room || 'Ruang -'}</span>
                                          <span className="opacity-70 text-[10px] uppercase">{user.school || 'Sekolah -'}</span>
                                      </span>
                                  )
                                  : 'Online Based Test'}
                          </p>
                      </div>
                  )}
              </div>
              {!isSidebarCollapsed && (
                  <button onClick={() => setIsSidebarCollapsed(true)} className="hidden md:block text-white/50 hover:text-white transition">
                      <ChevronLeft size={20}/>
                  </button>
              )}
              {isSidebarCollapsed && (
                  <button onClick={() => setIsSidebarCollapsed(false)} className="hidden md:block text-white/50 hover:text-white transition mt-2">
                      <ChevronRight size={20}/>
                  </button>
              )}
          </div>
          <nav className="flex-1 p-2 md:p-4 overflow-y-auto custom-scrollbar">
              <NavItem id="DASHBOARD" label="Dashboard" icon={LayoutDashboard} />
              <NavItem id="MONITORING" label="Monitoring Ujian" icon={Activity} />
              <NavItem id="HASIL_UJIAN" label="Hasil Ujian" icon={ClipboardList} />
              
              {(user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN || user.role === UserRole.GURU) && (
                  <>
                      <div className="my-2 border-t border-white/10"></div>
                      <NavItem id="BANK_SOAL" label="Bank Soal" icon={Database} />
                  </>
              )}
              
              {(user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) && (
                  <NavItem id="MAPPING" label="Mapping Sekolah" icon={Map} />
              )}

              {(user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN || user.role === UserRole.PROKTOR) && (
                  <NavItem id="PESERTA" label="Data Peserta" icon={RotateCcw} />
              )}

              {(user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) && (
                  <NavItem id="STAFF" label="Manajemen Staff" icon={Users} />
              )}
              
              {(user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN || user.role === UserRole.PROKTOR) && (
                  <NavItem id="CETAK_KARTU" label="Cetak Kartu" icon={Printer} />
              )}
              
              {(user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) && (
                  <>
                      <div className="my-2 border-t border-white/10"></div>
                      <NavItem id="ANTI_CHEAT" label="Sistem Anti-Curang" icon={ShieldAlert} />
                      <NavItem id="TROUBLESHOOTING" label="Troubleshooting" icon={Wrench} />
                  </>
              )}
          </nav>
          <div className="p-2 md:p-4 border-t border-white/10 bg-black/10">
               <button onClick={onLogout} className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-center md:space-x-2'} bg-red-500/20 hover:bg-red-500/40 text-red-100 p-2 md:py-2 rounded text-xs font-bold transition border border-red-500/30`} title="Keluar">
                   <LogOut size={16} /> {!isSidebarCollapsed && <span className="hidden md:inline">Keluar</span>}
               </button>
          </div>
      </aside>

      <main ref={mainRef} className="flex-1 overflow-y-auto p-4 md:p-8 bg-gray-50/50 print:overflow-visible print:h-auto print:absolute print:top-0 print:left-0 print:w-full print:m-0 print:p-0 print:bg-white">
          {/* HEADER */}
          <header className="flex flex-col md:flex-row justify-between items-center mb-6 md:mb-8 bg-white p-4 rounded-xl shadow-sm border border-gray-100 print:hidden gap-4">
               <h2 className="text-2xl font-bold text-gray-800 flex items-center">{activeTab.replace('_', ' ')}</h2>
               {isLoadingData && <span className="text-xs text-blue-500 animate-pulse flex items-center"><Loader2 size={12} className="animate-spin mr-1"/> Memuat Data...</span>}
          </header>

          {/* DASHBOARD (Main & Sub-views handled by renderDashboardContent) */}
          {activeTab === 'DASHBOARD' && renderDashboardContent()}

          {/* MONITORING - UPDATED WITH COLOR CODING */}
          {activeTab === 'MONITORING' && (
               <div className="bg-white rounded-xl shadow-sm border p-4 md:p-6 animate-in fade-in print:hidden">
                   
                   {/* EXAM ACTIVATION & TOKEN GENERATION */}
                   <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6">
                       <h4 className="font-bold text-blue-800 mb-3 flex items-center">
                           <Key size={18} className="mr-2"/> Aktivasi Ujian & Token
                       </h4>
                       <div className="flex flex-col md:flex-row gap-4 items-end">
                           <div className="flex-1 w-full">
                               <label className="block text-xs font-bold text-blue-600 uppercase mb-1">Pilih Mata Pelajaran</label>
                               <select 
                                   className="w-full border rounded-lg p-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                                   value={monitoringExamId}
                                   onChange={(e) => setMonitoringExamId(e.target.value)}
                               >
                                   <option value="">-- Pilih Mapel --</option>
                                   {exams.map(ex => (
                                       <option key={ex.id} value={ex.id}>{ex.title} (Token: {ex.token})</option>
                                   ))}
                               </select>
                           </div>
                       </div>
                       {monitoringExamId && (
                           <div className="mt-3 flex flex-col md:flex-row md:items-center gap-4 text-sm">
                               <div className="flex items-center gap-2">
                                   <span className="text-gray-600">Token Aktif:</span>
                                   <span className="font-mono font-bold text-xl bg-white px-3 py-1 rounded border border-blue-200 text-blue-700 tracking-widest">
                                       {exams.find(e => e.id === monitoringExamId)?.token || '-'}
                                   </span>
                                   {(user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) && (
                                       <button 
                                           onClick={() => handleGenerateNewToken(monitoringExamId)}
                                           className="p-2 bg-white border border-blue-200 rounded-lg text-blue-600 hover:bg-blue-50 transition shadow-sm"
                                           title="Generate Token Baru"
                                       >
                                           <RotateCcw size={16} />
                                       </button>
                                   )}
                               </div>
                               <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded border border-blue-200 shadow-sm">
                                   <input 
                                       type="checkbox" 
                                       id="sendToStudents"
                                       className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                                       checked={settings.showTokenToStudents || false}
                                       onChange={(e) => handleToggleTokenVisibility(e.target.checked)}
                                   />
                                   <label htmlFor="sendToStudents" className="text-xs font-bold text-blue-800 cursor-pointer select-none">
                                       Kirim ke Peserta
                                   </label>
                                </div>
                           </div>
                       )}
                   </div>

                   <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                       <div className="flex items-center gap-4 flex-wrap">
                           <h3 className="font-bold text-lg flex items-center"><Activity size={20} className="mr-2 text-blue-600"/> Live Status Peserta</h3>
                           <div className="flex gap-2 flex-wrap">
                               <select className="border rounded p-1.5 text-xs font-bold bg-gray-50" value={monitoringSchoolFilter} onChange={e => setMonitoringSchoolFilter(e.target.value)}>
                                   <option value="ALL">Semua Sekolah</option>
                                   {schools.map(s => <option key={s} value={s}>{s}</option>)}
                               </select>
                               <select className="border rounded p-1.5 text-xs font-bold bg-gray-50" value={monitoringClassFilter} onChange={e => setMonitoringClassFilter(e.target.value)}>
                                   <option value="ALL">Semua Kelas</option>
                                   {classes.map(c => <option key={c} value={c}>{c}</option>)}
                               </select>
                               <select className="border rounded p-1.5 text-xs font-bold bg-gray-50" value={monitoringSubjectFilter} onChange={e => setMonitoringSubjectFilter(e.target.value)}>
                                   <option value="ALL">Semua Mapel</option>
                                   {exams.map(ex => <option key={ex.id} value={ex.id}>{ex.title}</option>)}
                               </select>
                               <select className="border rounded p-1.5 text-xs font-bold bg-gray-50" value={dashboardRoomFilter} onChange={e => setDashboardRoomFilter(e.target.value)}>
                                   <option value="ALL">Semua Ruang</option>
                                   {rooms.map(r => <option key={r} value={r}>{r}</option>)}
                               </select>
                               <select className="border rounded p-1.5 text-xs font-bold bg-gray-50" value={dashboardSessionFilter} onChange={e => setDashboardSessionFilter(e.target.value)}>
                                   <option value="ALL">Semua Sesi</option>
                                   {sessions.map(s => <option key={s} value={s}>{s}</option>)}
                               </select>
                               <button 
                                   onClick={handleForceFinishAll}
                                   className="bg-red-600 text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-red-700 transition shadow-sm flex items-center"
                               >
                                   <Power size={14} className="mr-1"/> Paksa Selesai Semua
                               </button>
                           </div>
                       </div>
                       {selectedStudentIds.length > 0 && (
                           <button onClick={handleBulkReset} className="bg-orange-500 text-white px-3 py-1.5 rounded text-sm font-bold flex items-center shadow-md animate-in fade-in hover:bg-orange-600">
                               <Flame size={16} className="mr-1"/> Reset {selectedStudentIds.length} Peserta Terpilih
                           </button>
                       )}
                   </div>
                   
                   <div className="overflow-x-auto border rounded bg-white">
                       <table className="w-full text-sm text-left">
                           <thead className="bg-gray-50 font-bold border-b">
                                <tr>
                                    <th className="p-3 w-10 text-center">
                                        <input 
                                            type="checkbox" 
                                            className="w-4 h-4 rounded cursor-pointer"
                                            checked={finalMonitoringUsers.length > 0 && selectedStudentIds.length === finalMonitoringUsers.length}
                                            onChange={() => toggleSelectAll(finalMonitoringUsers)}
                                        />
                                    </th>
                                    <th className="p-3 cursor-pointer hover:bg-gray-100" onClick={() => handleMonitoringSort('name')}>Nama {monitoringSortConfig?.key === 'name' ? (monitoringSortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                                    <th className="p-3 cursor-pointer hover:bg-gray-100" onClick={() => handleMonitoringSort('nomorPeserta')}>Nomor Peserta {monitoringSortConfig?.key === 'nomorPeserta' ? (monitoringSortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                                    <th className="p-3 cursor-pointer hover:bg-gray-100" onClick={() => handleMonitoringSort('school')}>Sekolah {monitoringSortConfig?.key === 'school' ? (monitoringSortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                                    <th className="p-3 text-center cursor-pointer hover:bg-gray-100" onClick={() => handleMonitoringSort('room')}>Ruang {monitoringSortConfig?.key === 'room' ? (monitoringSortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                                    <th className="p-3 text-center cursor-pointer hover:bg-gray-100" onClick={() => handleMonitoringSort('session')}>Sesi {monitoringSortConfig?.key === 'session' ? (monitoringSortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                                    <th className="p-3 cursor-pointer hover:bg-gray-100" onClick={() => handleMonitoringSort('status')}>Status {monitoringSortConfig?.key === 'status' ? (monitoringSortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                                    <th className="p-3 text-center">Kontrol</th>
                                    <th className="p-3 text-center">Hapus</th>
                                </tr>
                           </thead>
                           <tbody className="divide-y">
                                {finalMonitoringUsers
                                   .map(u => {
                                   const statusInfo = getStudentStatusInfo(u);
                                   const mapping = u.mappings?.[0];
                                   return (
                                       <tr key={u.id} className="hover:bg-gray-50">
                                           <td className="p-3 text-center">
                                               <input 
                                                    type="checkbox" 
                                                    className="w-4 h-4 rounded cursor-pointer"
                                                    checked={selectedStudentIds.includes(u.id)}
                                                    onChange={() => toggleSelectOne(u.id)}
                                               />
                                           </td>
                                           <td className="p-3">{u.name}</td>
                                           <td className="p-3 font-mono">{u.nomorPeserta}</td>
                                           <td className="p-3">{u.school}</td>
                                           <td className="p-3 text-center">
                                               <span className="text-[10px] font-bold bg-green-50 text-green-700 px-2 py-0.5 rounded border border-green-100">{mapping?.room || '-'}</span>
                                           </td>
                                           <td className="p-3 text-center">
                                               <span className="text-[10px] font-bold bg-purple-50 text-purple-700 px-2 py-0.5 rounded border border-purple-100">{mapping?.session || '-'}</span>
                                           </td>
                                           <td className="p-3">
                                               <span className={`px-2 py-1 rounded text-xs font-bold border ${statusInfo.color}`}>
                                                   {statusInfo.label}
                                               </span>
                                           </td>
                                           <td className="p-3 text-center">
                                               <button 
                                                    title="Buka Freeze (Reset Status)" 
                                                    onClick={async () => { await db.resetUserStatus(u.id); showToast('Status peserta di-reset (Unfreeze).'); loadData(); }} 
                                                    className="text-orange-600 bg-orange-50 border border-orange-200 p-1.5 rounded hover:bg-orange-100 transition"
                                                >
                                                    <Flame size={16} />
                                               </button>
                                           </td>
                                           <td className="p-3 text-center">
                                               {user.role !== UserRole.PROKTOR && (
                                                   <button 
                                                       onClick={() => {
                                                           showConfirm('Hapus data hasil ujian peserta ini secara permanen?', async () => { 
                                                               await db.deleteUserResults(u.id);
                                                               await db.resetUserStatus(u.id);
                                                               showToast('Data hasil ujian dihapus dan status di-reset.');
                                                               loadData(); 
                                                           });
                                                       }}
                                                       className="text-red-600 bg-red-50 border border-red-200 p-1.5 rounded hover:bg-red-100 transition"
                                                       title="Hapus Hasil Ujian"
                                                   >
                                                       <Trash2 size={16} />
                                                   </button>
                                               )}
                                           </td>
                                       </tr>
                                   )
                               })}
                               {finalMonitoringUsers.length === 0 && (
                                   <tr><td colSpan={9} className="p-4 text-center text-gray-500">Tidak ada peserta yang sedang online.</td></tr>
                               )}
                           </tbody>
                       </table>
                   </div>
               </div>
          )}
          
          {/* ... Rest of existing tabs ... */}
          {/* BANK SOAL */}
          {activeTab === 'BANK_SOAL' && (
              <div className="space-y-6 animate-in fade-in print:hidden">
                  <div className="flex justify-between items-center">
                      <h3 className="font-bold text-lg">Bank Soal & Materi</h3>
                      <button onClick={() => setIsCreateExamModalOpen(true)} className="bg-blue-600 text-white px-4 py-2 rounded font-bold text-sm hover:bg-blue-700 flex items-center shadow-sm"><Plus size={16} className="mr-2"/> Tambah Mapel Baru</button>
                  </div>
                  {viewingQuestionsExam ? (
                      <div className="bg-white p-6 rounded-xl shadow-sm border">
                          <button onClick={() => setViewingQuestionsExam(null)} className="text-blue-600 mb-4 text-sm font-bold flex items-center hover:underline">← Kembali ke Daftar</button>
                          <h4 className="text-xl font-bold mb-4 border-b pb-2 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                              <div className="flex items-center gap-3">
                                  <span>{viewingQuestionsExam.title}</span>
                                  <span className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-bold">{viewingQuestionsExam.questions.length} Soal</span>
                                  <span className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-full font-bold">Total Skor: {viewingQuestionsExam.questions.reduce((sum, q) => sum + (q.points || 0), 0)}</span>
                              </div>
                              <div className="flex flex-wrap gap-4 items-center">
                                  <div className="flex items-center gap-2">
                                      <label className="text-xs font-bold text-gray-600">Durasi (Menit):</label>
                                      <input 
                                          type="number" 
                                          min="1"
                                          className="border rounded p-1 w-16 text-xs text-center"
                                          value={viewingQuestionsExam.durationMinutes}
                                          onChange={(e) => handleUpdateDuration(Number(e.target.value))}
                                      />
                                  </div>
                                  <label className="flex items-center gap-2 text-xs font-bold text-gray-600 cursor-pointer hover:text-blue-600 transition">
                                      <input 
                                          type="checkbox" 
                                          checked={viewingQuestionsExam.shuffleQuestions} 
                                          onChange={(e) => handleToggleShuffle('shuffleQuestions', e.target.checked)}
                                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                      />
                                      Acak Soal
                                  </label>
                                  <label className="flex items-center gap-2 text-xs font-bold text-gray-600 cursor-pointer hover:text-blue-600 transition">
                                      <input 
                                          type="checkbox" 
                                          checked={viewingQuestionsExam.shuffleOptions} 
                                          onChange={(e) => handleToggleShuffle('shuffleOptions', e.target.checked)}
                                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                      />
                                      Acak Opsi
                                  </label>
                                  <div className="flex items-center gap-2 border-l pl-4 ml-2">
                                      <label className="text-xs font-bold text-gray-600">Set Semua Bobot:</label>
                                      <input 
                                          type="number" 
                                          min="0"
                                          className="border rounded p-1 w-16 text-xs text-center"
                                          id="globalPointsInput"
                                          defaultValue="10"
                                      />
                                      <button 
                                          onClick={() => {
                                              const val = Number((document.getElementById('globalPointsInput') as HTMLInputElement).value);
                                              handleUpdateAllQuestionPoints(val);
                                          }}
                                          className="bg-orange-500 text-white px-2 py-1 rounded text-xs font-bold hover:bg-orange-600"
                                      >
                                          Terapkan
                                      </button>
                                  </div>
                              </div>
                          </h4>
                          <div className="flex flex-wrap gap-2 mb-6 bg-gray-50 p-4 rounded-lg border">
                               <button onClick={() => {
                                   setTargetExamForAdd(viewingQuestionsExam); 
                                   setEditingQuestionId(null);
                                   setNqText('');
                                   setNqImg('');
                                   setNqOptions(['', '', '', '']);
                                   setNqCorrectIndex(0);
                                   setNqCorrectIndices([]);
                                   setNqMatchingPairs([{left: '', right: ''}]);
                                   setNqPoints(10);
                                   setIsAddQuestionModalOpen(true);
                               }} className="bg-green-600 text-white px-4 py-2 rounded text-sm font-bold flex items-center hover:bg-green-700 transition"><Plus size={16} className="mr-2"/> Input Manual</button>
                               <button onClick={() => setIsAiModalOpen(true)} className="bg-purple-600 text-white px-4 py-2 rounded text-sm font-bold flex items-center hover:bg-purple-700 transition shadow-sm"><Sparkles size={16} className="mr-2"/> Generate AI</button>
                               <div className="h-8 w-px bg-gray-300 mx-2"></div>
                               <button onClick={() => { setImportTargetExamId(viewingQuestionsExam.id); setIsImportModalOpen(true); }} className="bg-orange-500 text-white px-4 py-2 rounded text-sm font-bold flex items-center hover:bg-orange-600 transition"><Upload size={16} className="mr-2"/> Import Soal</button>
                               <button onClick={() => { setExportTargetExam(viewingQuestionsExam); setIsExportModalOpen(true); }} className="bg-blue-500 text-white px-4 py-2 rounded text-sm font-bold flex items-center hover:bg-blue-600 transition"><Download size={16} className="mr-2"/> Export Soal</button>
                               <button onClick={() => { setPreviewQuestion(null); setIsFullExamPreviewOpen(true); }} className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-bold flex items-center hover:bg-blue-700 transition shadow-sm"><Eye size={16} className="mr-2"/> Preview Ujian</button>
                          </div>
                          <div className="space-y-3">
                              {viewingQuestionsExam.questions.map((q, i) => (
                                  <div key={q.id} className="p-4 border rounded-lg bg-white hover:bg-gray-50 transition flex justify-between items-start shadow-sm group overflow-hidden">
                                      <div className="flex-1 pr-4 overflow-hidden">
                                          <div className="flex items-center gap-2 mb-3">
                                              <span className="font-bold bg-gray-200 w-8 h-8 flex items-center justify-center rounded-full text-sm">{i+1}</span>
                                              <span className="text-xs font-bold px-2 py-0.5 bg-blue-100 text-blue-700 rounded">{q.type}</span>
                                              <div className="flex items-center gap-1 bg-orange-100 text-orange-700 rounded px-2 py-0.5">
                                                  <span className="text-xs font-bold">Bobot:</span>
                                                  <input 
                                                      type="number" 
                                                      min="0"
                                                      className="w-12 text-xs font-bold bg-transparent border-b border-orange-300 focus:outline-none focus:border-orange-500 text-center" 
                                                      value={q.points} 
                                                      onChange={(e) => handleUpdateQuestionPoints(q.id, Number(e.target.value))}
                                                  />
                                              </div>
                                          </div>
                                          
                                          <div className="mb-4 overflow-hidden bg-white rounded-lg border border-gray-100">
                                              <ReactQuill 
                                                  theme="snow" 
                                                  value={q.text} 
                                                  readOnly={true} 
                                                  modules={{ toolbar: false }}
                                                  className="read-only-quill-preview-list"
                                              />
                                          </div>
                                          
                                          {/* Preview Options */}
                                          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                                              {(q.type === 'PG' || q.type === 'PG_KOMPLEKS' || q.type === 'TRUE_FALSE') && (
                                                  (q.type === 'TRUE_FALSE' ? ['Benar', 'Salah'] : q.options).map((opt, idx) => {
                                                      const isCorrect = q.type === 'PG_KOMPLEKS' ? q.correctIndices?.includes(idx) : q.correctIndex === idx;
                                                      return (
                                                          <div key={idx} className={`text-[11px] p-2 rounded border flex items-center gap-2 ${isCorrect ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-100 text-gray-500'}`}>
                                                              <span className={`w-5 h-5 flex items-center justify-center rounded-full font-bold border ${isCorrect ? 'bg-green-500 text-white border-green-600' : 'bg-white border-gray-200'}`}>
                                                                  {String.fromCharCode(65+idx)}
                                                              </span>
                                                              <span className="truncate">{opt}</span>
                                                              {isCorrect && <Check size={12} className="ml-auto"/>}
                                                          </div>
                                                      );
                                                  })
                                              )}
                                              {q.type === 'MATCHING' && q.options.map((opt, idx) => {
                                                  const [l, r] = opt.split('|');
                                                  return (
                                                      <div key={idx} className="text-[11px] p-2 rounded border bg-blue-50 border-blue-100 text-blue-700 flex items-center gap-2">
                                                          <span className="font-bold">{l}</span>
                                                          <span className="text-blue-300">↔</span>
                                                          <span>{r}</span>
                                                      </div>
                                                  );
                                              })}
                                              {q.type === 'URAIAN' && (
                                                  <div className="text-[11px] p-2 rounded border border-dashed border-gray-200 text-gray-400 italic">
                                                      Jawaban Uraian / Esai
                                                  </div>
                                              )}
                                          </div>
                                      </div>
                                      <div className="flex flex-col gap-2 transition">
                                          <div className="flex gap-1 mb-2">
                                              <button 
                                                  disabled={i === 0}
                                                  onClick={() => handleMoveQuestion(q.id, 'up')} 
                                                  className="p-1.5 text-gray-400 hover:text-blue-600 bg-gray-50 hover:bg-blue-50 rounded border disabled:opacity-30 disabled:cursor-not-allowed"
                                                  title="Pindah ke Atas"
                                              >
                                                  <ChevronUp size={16}/>
                                              </button>
                                              <button 
                                                  disabled={i === viewingQuestionsExam.questions.length - 1}
                                                  onClick={() => handleMoveQuestion(q.id, 'down')} 
                                                  className="p-1.5 text-gray-400 hover:text-blue-600 bg-gray-50 hover:bg-blue-50 rounded border disabled:opacity-30 disabled:cursor-not-allowed"
                                                  title="Pindah ke Bawah"
                                              >
                                                  <ChevronDown size={16}/>
                                              </button>
                                          </div>
                                          <div className="flex gap-2">
                                              <button onClick={() => handleEditQuestion(q)} className="p-2 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition border border-blue-100" title="Edit Soal">
                                                  <Edit size={18}/>
                                              </button>
                                              <button onClick={() => handleDeleteQuestion(q.id)} className="p-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition border border-red-100" title="Hapus Soal">
                                                  <Trash size={18}/>
                                              </button>
                                          </div>
                                      </div>
                                  </div>
                              ))}
                          </div>
                      </div>
                  ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {exams.map(ex => (
                              <div key={ex.id} className="bg-white p-5 rounded-xl border hover:shadow-lg transition cursor-pointer group relative" onClick={() => setViewingQuestionsExam(ex)}>
                                  <div className="flex justify-between items-start mb-4">
                                      <div className="bg-blue-50 p-3 rounded-lg group-hover:bg-blue-100 transition"><Database size={24} className="text-blue-600"/></div>
                                  <div className="flex flex-col items-end gap-1">
                                      <span className="text-xs font-bold bg-blue-50 px-2 py-1 rounded text-blue-600">{ex.questionCount} Soal</span>
                                      <span className="text-xs font-bold bg-green-50 px-2 py-1 rounded text-green-600">Skor: {ex.questions?.reduce((sum, q) => sum + (q.points || 0), 0) || 0}</span>
                                      <button 
                                          onClick={(e) => { e.stopPropagation(); handleDeleteExam(ex.id); }}
                                          className="mt-1 text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition"
                                          title="Hapus Mapel"
                                      >
                                          <Trash size={16}/>
                                      </button>
                                  </div>
                                  </div>
                                  <h4 className="font-bold text-gray-800 text-lg mb-1">{ex.subject}</h4>
                                  <p className="text-sm text-gray-500 line-clamp-1">Token: {ex.token}</p>
                              </div>
                          ))}
                      </div>
                  )}
              </div>
          )}

          {/* MAPPING SEKOLAH */}
          {activeTab === 'MAPPING' && (
              <div className="space-y-6 animate-in fade-in print:hidden">
                  <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                      <div 
                        className="p-6 flex justify-between items-center cursor-pointer hover:bg-gray-50 transition"
                        onClick={() => setIsMappingAccordionOpen(!isMappingAccordionOpen)}
                      >
                          <h3 className="font-bold text-lg flex items-center"><Map size={20} className="mr-2 text-blue-600"/> Mapping Jadwal & Ruang Peserta</h3>
                          <div className="flex items-center gap-4">
                              <div className="flex gap-2 no-print" onClick={e => e.stopPropagation()}>
                                  <button onClick={() => setIsSessionModalOpen(true)} className="bg-blue-600 text-white px-4 py-2 rounded font-bold text-sm hover:bg-blue-700 flex items-center shadow-sm">
                                      <Clock size={16} className="mr-2"/> Pengaturan Waktu Sesi
                                  </button>
                                  <button onClick={() => setIsRecapModalOpen(true)} className="bg-purple-600 text-white px-4 py-2 rounded font-bold text-sm hover:bg-purple-700 flex items-center shadow-sm">
                                      <BarChart3 size={16} className="mr-2"/> Rekap Peserta
                                  </button>
                              </div>
                              {isMappingAccordionOpen ? <ChevronUp size={20} className="text-gray-400"/> : <ChevronDown size={20} className="text-gray-400"/>}
                          </div>
                      </div>

                      {isMappingAccordionOpen && (
                          <div className="p-6 pt-0 border-t border-gray-100">
                              <div className="mt-6">

                      {/* FILTERS */}
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-gray-50 p-4 rounded-lg border mb-6">
                          <div>
                              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Sekolah</label>
                              <select className="w-full border rounded p-2 text-sm" value={mappingSchoolFilter} onChange={e => setMappingSchoolFilter(e.target.value)}>
                                  <option value="ALL">Semua Sekolah</option>
                                  {schools.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                          </div>
                          <div>
                              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Kelas</label>
                              <select className="w-full border rounded p-2 text-sm" value={mappingClassFilter} onChange={e => setMappingClassFilter(e.target.value)}>
                                  <option value="ALL">Semua Kelas</option>
                                  {Array.from(new Set(users.map(u => u.class).filter(Boolean))).sort().map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                          </div>
                          <div>
                              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Ruang</label>
                              <select className="w-full border rounded p-2 text-sm" value={mappingRoomFilter} onChange={e => setMappingRoomFilter(e.target.value)}>
                                  <option value="ALL">Semua Ruang</option>
                                  {Array.from(new Set(users.flatMap(u => u.mappings?.map(m => m.room) || []).filter(Boolean))).sort().map(r => <option key={r} value={r}>{r}</option>)}
                              </select>
                          </div>
                          <div>
                              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Sesi</label>
                              <select className="w-full border rounded p-2 text-sm" value={mappingSessionFilter} onChange={e => setMappingSessionFilter(e.target.value)}>
                                  <option value="ALL">Semua Sesi</option>
                                  {Array.from(new Set(users.flatMap(u => u.mappings?.map(m => m.session) || []).filter(Boolean))).sort().map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                          </div>
                      </div>

                      {/* BULK EDIT FORM */}
                      <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl mb-6">
                          <h4 className="text-sm font-bold text-blue-800 mb-3 flex items-center">
                              <Edit size={16} className="mr-2"/> Pengaturan Massal ({mappingSelectedIds.length} Peserta Terpilih)
                          </h4>
                          <div className="mb-4 flex gap-4">
                              <label className="flex items-center gap-2 cursor-pointer">
                                  <input type="radio" name="mappingMode" checked={mappingMode === 'OBT'} onChange={() => setMappingMode('OBT')} className="w-4 h-4 text-blue-600" />
                                  <span className="text-sm font-medium text-gray-700">Online Based Test</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer">
                                  <input type="radio" name="mappingMode" checked={mappingMode === 'TRYOUT'} onChange={() => setMappingMode('TRYOUT')} className="w-4 h-4 text-blue-600" />
                                  <span className="text-sm font-medium text-gray-700">Try Out Online</span>
                              </label>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                              <div>
                                  <label className="block text-[10px] font-bold text-blue-600 uppercase mb-1">Mata Pelajaran</label>
                                  <select className="w-full border rounded p-2 text-sm bg-white" value={mappingEditForm.examId} onChange={e => setMappingEditForm({...mappingEditForm, examId: e.target.value})}>
                                      <option value="">Pilih Mapel...</option>
                                      {exams.map(ex => <option key={ex.id} value={ex.id}>{ex.title}</option>)}
                                  </select>
                              </div>
                              <div>
                                  <label className="block text-[10px] font-bold text-blue-600 uppercase mb-1">{mappingMode === 'TRYOUT' ? 'Tanggal Mulai' : 'Tanggal'}</label>
                                  <input type="date" className="w-full border rounded p-2 text-sm bg-white" value={mappingEditForm.examDate} onChange={e => setMappingEditForm({...mappingEditForm, examDate: e.target.value})} />
                              </div>
                              {mappingMode === 'TRYOUT' ? (
                                  <div>
                                      <label className="block text-[10px] font-bold text-blue-600 uppercase mb-1">Tanggal Selesai</label>
                                      <input type="date" className="w-full border rounded p-2 text-sm bg-white" value={mappingEditForm.endDate} onChange={e => setMappingEditForm({...mappingEditForm, endDate: e.target.value})} />
                                  </div>
                              ) : (
                                  <div>
                                      <label className="block text-[10px] font-bold text-blue-600 uppercase mb-1">Sesi</label>
                                      <select className="w-full border rounded p-2 text-sm bg-white" value={mappingEditForm.session} onChange={e => setMappingEditForm({...mappingEditForm, session: e.target.value})}>
                                          <option value="">Pilih Sesi...</option>
                                          <option value="Sesi 1">Sesi 1</option>
                                          <option value="Sesi 2">Sesi 2</option>
                                          <option value="Sesi 3">Sesi 3</option>
                                          <option value="Sesi 4">Sesi 4</option>
                                      </select>
                                  </div>
                              )}
                              <div>
                                  <label className="block text-[10px] font-bold text-blue-600 uppercase mb-1">Ruang</label>
                                  <select 
                                      className="w-full border rounded p-2 text-sm bg-white" 
                                      value={mappingEditForm.room} 
                                      onChange={e => setMappingEditForm({...mappingEditForm, room: e.target.value})}
                                  >
                                      <option value="">Pilih Ruang...</option>
                                      {Array.from(new Set(staffList.filter(s => s.role === UserRole.PROKTOR).map(s => s.room))).filter(Boolean).sort().map(r => (
                                          <option key={r} value={r}>{r}</option>
                                      ))}
                                  </select>
                              </div>
                              <button onClick={handleSaveStudentMapping} disabled={isLoadingData || mappingSelectedIds.length === 0} className="bg-blue-600 text-white py-2 rounded font-bold text-sm hover:bg-blue-700 disabled:opacity-50 shadow-md">
                                  Simpan Mapping
                              </button>
                          </div>
                      </div>

                      {/* STUDENT TABLE */}
                      <div className="overflow-x-auto border rounded-xl bg-white">
                          <table className="w-full text-sm text-left">
                              <thead className="bg-gray-50 font-bold border-b text-gray-600">
                                  <tr>
                                      <th className="p-3 w-10">
                                          <input 
                                              type="checkbox" 
                                              className="w-4 h-4 rounded border-gray-300 text-blue-600"
                                              checked={getMappingUsers().length > 0 && getMappingUsers().every(u => mappingSelectedIds.includes(u.id))}
                                              onChange={e => toggleSelectAllMapping(e.target.checked)}
                                          />
                                      </th>
                                      <th className="p-3 cursor-pointer hover:text-blue-600" onClick={() => handleSort('name')}>Nama {mappingSort.column === 'name' && (mappingSort.direction === 'asc' ? '↑' : '↓')}</th>
                                      <th className="p-3 cursor-pointer hover:text-blue-600" onClick={() => handleSort('class')}>Kelas {mappingSort.column === 'class' && (mappingSort.direction === 'asc' ? '↑' : '↓')}</th>
                                      <th className="p-3 cursor-pointer hover:text-blue-600" onClick={() => handleSort('school')}>Sekolah {mappingSort.column === 'school' && (mappingSort.direction === 'asc' ? '↑' : '↓')}</th>
                                      <th className="p-3 cursor-pointer hover:text-blue-600" onClick={() => handleSort('examId')}>Mapel {mappingSort.column === 'examId' && (mappingSort.direction === 'asc' ? '↑' : '↓')}</th>
                                      <th className="p-3 cursor-pointer hover:text-blue-600" onClick={() => handleSort('room')}>Ruang {mappingSort.column === 'room' && (mappingSort.direction === 'asc' ? '↑' : '↓')}</th>
                                      <th className="p-3 cursor-pointer hover:text-blue-600" onClick={() => handleSort('session')}>Sesi {mappingSort.column === 'session' && (mappingSort.direction === 'asc' ? '↑' : '↓')}</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y">
                                  {getMappingUsers().map(u => {
                                      const m = u.mappings?.find(map => !mappingEditForm.examId || map.examId === mappingEditForm.examId);
                                      return (
                                          <tr key={u.id} className={`hover:bg-gray-50 transition ${mappingSelectedIds.includes(u.id) ? 'bg-blue-50/30' : ''}`}>
                                              <td className="p-3">
                                                  <input 
                                                      type="checkbox" 
                                                      className="w-4 h-4 rounded border-gray-300 text-blue-600"
                                                      checked={mappingSelectedIds.includes(u.id)}
                                                      onChange={e => {
                                                          if (e.target.checked) setMappingSelectedIds([...mappingSelectedIds, u.id]);
                                                          else setMappingSelectedIds(mappingSelectedIds.filter(id => id !== u.id));
                                                      }}
                                                  />
                                              </td>
                                              <td className="p-3 font-medium">{u.name}</td>
                                              <td className="p-3 text-gray-500">{u.class || '-'}</td>
                                              <td className="p-3 text-xs text-gray-400">{u.school}</td>
                                              <td className="p-3">
                                                  {m?.examId ? (
                                                      <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded">{exams.find(ex => ex.id === m.examId)?.title || 'Unknown'}</span>
                                                  ) : '-'}
                                              </td>
                                              <td className="p-3">
                                                  {m?.room ? <span className="text-xs font-bold text-green-700 bg-green-50 px-2 py-1 rounded">{m.room}</span> : '-'}
                                              </td>
                                              <td className="p-3">
                                                  {m?.session ? <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2 py-1 rounded">{m.session}</span> : '-'}
                                              </td>
                                          </tr>
                                      );
                                  })}
                                  {getMappingUsers().length === 0 && (
                                      <tr>
                                          <td colSpan={7} className="p-10 text-center text-gray-400 italic">Tidak ada data peserta yang sesuai filter.</td>
                                      </tr>
                                  )}
                              </tbody>
                          </table>
                      </div>

                      {/* PAGINATION / LIMIT */}
                      <div className="mt-6 flex justify-between items-center text-xs text-gray-500">
                          <div>Menampilkan <b>{getMappingUsers().length}</b> dari <b>{users.filter(u => u.role === UserRole.STUDENT).length}</b> Peserta</div>
                          <div className="flex items-center gap-2">
                              <span>Tampilkan:</span>
                              <select className="border rounded p-1" value={mappingLimit} onChange={e => setMappingLimit(Number(e.target.value))}>
                                  <option value={0}>Semua (All)</option>
                                  <option value={5}>5</option>
                                  <option value={10}>10</option>
                                  <option value={25}>25</option>
                                  <option value={50}>50</option>
                                  <option value={100}>100</option>
                              </select>
                          </div>
                      </div>
                          </div>
                      </div>
                  )}
              </div>

                  {/* DAFTAR RIWAYAT MAPPING */}
                  <div className="bg-white rounded-xl shadow-sm border p-6">
                      <div className="flex items-center mb-6">
                          <History size={20} className="mr-2 text-purple-600"/>
                          <h3 className="font-bold text-lg">Daftar Riwayat Mapping</h3>
                      </div>

                      <div className="overflow-x-auto border rounded-xl">
                          <table className="w-full text-sm text-left">
                              <thead className="bg-gray-50 font-bold border-b text-gray-600">
                                  <tr>
                                      <th className="p-3">Hari / Tanggal</th>
                                      <th className="p-3">Sesi / Waktu</th>
                                      <th className="p-3">Mata Pelajaran</th>
                                      <th className="p-3">Lembaga | Ruang</th>
                                      <th className="p-3 text-center">Jml Peserta</th>
                                      <th className="p-3 text-center">Aksi</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y">
                                  {getMappingHistory().map((h, idx) => {
                                      const exam = exams.find(e => e.id === h.examId);
                                      const timeRange = settings.sessionTimes?.[h.session] || '-';
                                      
                                      let dayName = '';
                                      let formattedDate = '';
                                      
                                      if (h.date?.includes('|')) {
                                          const [start, end] = h.date.split('|');
                                          const startDateObj = new Date(start);
                                          const endDateObj = new Date(end);
                                          dayName = 'Try Out';
                                          formattedDate = `${startDateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} - ${endDateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`;
                                      } else {
                                          const dateObj = new Date(h.date);
                                          dayName = dateObj.toLocaleDateString('id-ID', { weekday: 'long' });
                                          formattedDate = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
                                      }
                                      
                                      return (
                                          <tr key={idx} className="hover:bg-gray-50">
                                              <td className="p-3">
                                                  <div className="font-bold text-gray-800">{dayName}</div>
                                                  <div className="text-xs text-gray-500">{formattedDate}</div>
                                              </td>
                                              <td className="p-3">
                                                  <div className="font-bold text-purple-700">{h.session}</div>
                                                  <div className="text-xs text-gray-400">{timeRange}</div>
                                              </td>
                                              <td className="p-3">
                                                  <div className="font-bold text-blue-700">{exam?.title || 'Unknown'}</div>
                                                  <div className="text-xs text-gray-400">{exam?.subject || '-'}</div>
                                              </td>
                                              <td className="p-3">
                                                  <div className="font-medium">{h.school}</div>
                                                  <div className="text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded inline-block mt-1">Ruang: {h.room}</div>
                                              </td>
                                              <td className="p-3 text-center">
                                                  <span className="bg-slate-100 px-3 py-1 rounded-full font-bold text-slate-700">{h.count}</span>
                                              </td>
                                              <td className="p-3 text-center">
                                                  <div className="flex justify-center gap-1">
                                                      <button 
                                                          onClick={() => handleOpenEditMapping(h)}
                                                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                          title="Edit Mapping"
                                                      >
                                                          <Edit size={16} />
                                                      </button>
                                                      <button 
                                                          onClick={() => handleDeleteMappingGroup(h)}
                                                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                          title="Hapus Mapping"
                                                      >
                                                          <Trash2 size={16} />
                                                      </button>
                                                  </div>
                                              </td>
                                          </tr>
                                      );
                                  })}
                                  {getMappingHistory().length === 0 && (
                                      <tr>
                                          <td colSpan={5} className="p-10 text-center text-gray-400 italic">Belum ada riwayat mapping.</td>
                                      </tr>
                                  )}
                              </tbody>
                          </table>
                      </div>
                  </div>
              </div>
          )}

          {/* PESERTA */}
          {activeTab === 'PESERTA' && (
               <div className="bg-white rounded-xl shadow-sm border p-6 animate-in fade-in print:hidden">
                   <div className="flex justify-between items-center mb-6">
                       <h3 className="font-bold text-lg">Data Peserta</h3>
                       <div className="flex gap-2">
                           {(user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN || user.role === UserRole.PROKTOR) && (
                                <button 
                                   disabled={user.role === UserRole.PROKTOR}
                                   onClick={() => { setEditingStudent(null); setNewStudent({ role: UserRole.STUDENT, status: 'idle' }); setIsAddStudentModalOpen(true); }} 
                                   className={`bg-purple-600 text-white px-3 py-2 rounded text-sm font-bold flex items-center shadow-sm ${user.role === UserRole.PROKTOR ? 'opacity-50 cursor-not-allowed' : 'hover:bg-purple-700'}`}
                                >
                                   <Plus size={16} className="mr-2"/> Tambah Peserta
                                </button>
                            )}
                           {(user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN || user.role === UserRole.PROKTOR) && (
                                <button 
                                   disabled={user.role === UserRole.PROKTOR}
                                   onClick={downloadStudentTemplate} 
                                   className={`bg-green-600 text-white px-3 py-2 rounded text-sm font-bold flex items-center ${user.role === UserRole.PROKTOR ? 'opacity-50 cursor-not-allowed' : 'hover:bg-green-700'}`}
                                >
                                   <FileText size={16} className="mr-2"/> Template CSV
                                </button>
                            )}
                           {(user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN || user.role === UserRole.PROKTOR) && (
                                <button 
                                   disabled={user.role === UserRole.PROKTOR}
                                   onClick={triggerImportStudents} 
                                   className={`bg-blue-600 text-white px-3 py-2 rounded text-sm font-bold flex items-center shadow-sm ${user.role === UserRole.PROKTOR ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'}`}
                                >
                                   <Upload size={16} className="mr-2"/> Import Data
                                </button>
                            )}
                            {(user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN || user.role === UserRole.PROKTOR) && (
                                <button 
                                   onClick={handlePrintCards} 
                                   className="bg-orange-600 text-white px-3 py-2 rounded text-sm font-bold flex items-center shadow-sm hover:bg-orange-700"
                                >
                                   <Printer size={16} className="mr-2"/> Cetak Kartu
                                </button>
                            )}
                       </div>
                   </div>
                   <div className="mb-4 flex gap-4 bg-gray-50 p-4 rounded-lg border flex-wrap">
                       <div className="flex-1 relative">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                            <input placeholder="Cari nama atau Nomor Peserta..." className="border rounded pl-9 pr-3 py-2 text-sm w-full" value={monitoringSearch} onChange={e => setMonitoringSearch(e.target.value)} />
                       </div>
                       <select className="border rounded p-2 text-sm min-w-[200px]" value={selectedSchoolFilter} onChange={e => setSelectedSchoolFilter(e.target.value)}>
                           <option value="ALL">Semua Sekolah</option>
                           {schools.map(s => <option key={s} value={s}>{s}</option>)}
                       </select>
                   </div>
                   <div className="overflow-x-auto border rounded bg-white">
                       <table className="w-full text-sm text-left">
                           <thead className="bg-gray-50 font-bold border-b"><tr><th className="p-3">Nama</th><th className="p-3">Nomor Peserta</th><th className="p-3">Sekolah</th><th className="p-3">NPSN</th><th className="p-3">Kelas</th><th className="p-3 text-center">Kontrol</th></tr></thead>
                           <tbody className="divide-y">
                               {getMonitoringUsers(selectedSchoolFilter, selectedRoomFilter, selectedSessionFilter).map(u => (
                                   <tr key={u.id} className="hover:bg-gray-50">
                                       <td className="p-3">{u.name}</td><td className="p-3 font-mono">{u.nomorPeserta}</td><td className="p-3">{u.school}</td><td className="p-3 text-xs text-gray-500">{u.npsn || '-'}</td><td className="p-3">{u.class || '-'}</td>
                                       <td className="p-3 text-center flex justify-center gap-2">
                                            {user.role !== UserRole.PROKTOR && (
                                                <button title="Edit Data Peserta" onClick={() => handleEditStudent(u)} className="text-blue-600 bg-blue-50 border border-blue-200 p-1.5 rounded hover:bg-blue-100 transition"><Edit size={14}/></button>
                                            )}
                                           <button title="Reset Login (Unlock)" onClick={async () => { await db.resetUserStatus(u.id); showToast('Status login peserta di-reset (Unlock).'); loadData(); }} className="text-yellow-600 bg-yellow-50 border border-yellow-200 p-1.5 rounded hover:bg-yellow-100 transition"><Unlock size={14}/></button>
                                           <button title="Reset Password (12345)" onClick={async () => { showConfirm('Reset password jadi 12345?', async () => { await db.resetUserPassword(u.id); showToast('Password di-reset menjadi 12345'); }) }} className="text-blue-600 bg-blue-50 border border-blue-200 p-1.5 rounded hover:bg-blue-100 transition"><Key size={14}/></button>
                                            {user.role !== UserRole.PROKTOR && (
                                                <button title="Hapus Peserta" onClick={() => {showConfirm('Hapus peserta?', async () => { await db.deleteUser(u.id); loadData(); })}} className="text-red-600 bg-red-50 border border-red-200 p-1.5 rounded hover:bg-red-100 transition"><Trash2 size={14}/></button>
                                            )}
                                       </td>
                                   </tr>
                               ))}
                           </tbody>
                       </table>
                   </div>
               </div>
          )}

          {/* HASIL UJIAN */}
          {activeTab === 'HASIL_UJIAN' && (
               <div className="bg-white rounded-xl shadow-sm border p-6 animate-in fade-in print:hidden">
                   <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                       <div>
                           <h3 className="font-bold text-lg">Hasil Ujian</h3>
                           <div className="flex mt-2 bg-gray-100 p-1 rounded-lg w-fit">
                               <button 
                                   onClick={() => setResultSubTab('TABLE')}
                                   className={`px-4 py-1.5 rounded-md text-sm font-bold transition ${resultSubTab === 'TABLE' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                               >
                                   Rekap Hasil
                               </button>
                               <button 
                                   onClick={() => setResultSubTab('REVIEW')}
                                   className={`px-4 py-1.5 rounded-md text-sm font-bold transition ${resultSubTab === 'REVIEW' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                               >
                                   Review Jawaban
                               </button>
                           </div>
                       </div>
                       {resultSubTab === 'TABLE' && (
                           <button onClick={handleExportResultsExcel} className="bg-green-600 text-white px-4 py-2 rounded font-bold text-sm flex items-center hover:bg-green-700 shadow-sm w-full md:w-auto justify-center">
                               <FileSpreadsheet size={16} className="mr-2"/> Export Excel (.xls)
                           </button>
                       )}
                   </div>
                   
                   {resultSubTab === 'TABLE' ? (
                       <>
                           <div className="mb-6 bg-gray-50 p-4 rounded-xl border flex flex-wrap items-center gap-4">
                      <div className="flex items-center gap-2">
                          <Filter size={18} className="text-gray-500"/>
                          <span className="text-sm font-bold text-gray-700">Filter:</span>
                      </div>
                      
                      <select className="border rounded-lg p-2 text-sm min-w-[180px] bg-white" value={resultSchoolFilter} onChange={e => setResultSchoolFilter(e.target.value)}>
                           <option value="ALL">Semua Sekolah</option>
                           {schools.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>

                      <select className="border rounded-lg p-2 text-sm min-w-[140px] bg-white" value={resultClassFilter} onChange={e => setResultClassFilter(e.target.value)}>
                           <option value="ALL">Semua Kelas</option>
                           {classes.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>

                      <select className="border rounded-lg p-2 text-sm min-w-[140px] bg-white" value={resultRoomFilter} onChange={e => setResultRoomFilter(e.target.value)}>
                           <option value="ALL">Semua Ruang</option>
                           {rooms.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>

                      <select className="border rounded-lg p-2 text-sm min-w-[140px] bg-white" value={resultSessionFilter} onChange={e => setResultSessionFilter(e.target.value)}>
                           <option value="ALL">Semua Sesi</option>
                           {sessions.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>

                      <select className="border rounded-lg p-2 text-sm min-w-[180px] bg-white" value={resultExamFilter} onChange={e => setResultExamFilter(e.target.value)}>
                           <option value="ALL">Semua Mapel</option>
                           {resultExams.map(ex => <option key={ex} value={ex}>{ex}</option>)}
                      </select>
                  </div>

                  <div className="overflow-x-auto border rounded-xl bg-white shadow-sm">
                      <table className="w-full text-sm text-left">
                          <thead className="bg-gray-50 font-bold border-b">
                              <tr>
                                  <th className="p-4 cursor-pointer hover:text-blue-600" onClick={() => handleResultSort('studentName')}>Nama {resultSort.column === 'studentName' && (resultSort.direction === 'asc' ? '↑' : '↓')}</th>
                                  <th className="p-4 cursor-pointer hover:text-blue-600" onClick={() => handleResultSort('nomorPeserta')}>Nomor Peserta {resultSort.column === 'nomorPeserta' && (resultSort.direction === 'asc' ? '↑' : '↓')}</th>
                                  <th className="p-4 cursor-pointer hover:text-blue-600" onClick={() => handleResultSort('class')}>Kelas {resultSort.column === 'class' && (resultSort.direction === 'asc' ? '↑' : '↓')}</th>
                                  <th className="p-4 cursor-pointer hover:text-blue-600" onClick={() => handleResultSort('school')}>Sekolah {resultSort.column === 'school' && (resultSort.direction === 'asc' ? '↑' : '↓')}</th>
                                  <th className="p-4 cursor-pointer hover:text-blue-600" onClick={() => handleResultSort('examTitle')}>Mapel {resultSort.column === 'examTitle' && (resultSort.direction === 'asc' ? '↑' : '↓')}</th>
                                  <th className="p-4 cursor-pointer hover:text-blue-600" onClick={() => handleResultSort('score')}>Nilai {resultSort.column === 'score' && (resultSort.direction === 'asc' ? '↑' : '↓')}</th>
                                  <th className="p-4 cursor-pointer hover:text-blue-600" onClick={() => handleResultSort('submittedAt')}>Waktu Submit {resultSort.column === 'submittedAt' && (resultSort.direction === 'asc' ? '↑' : '↓')}</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y">
                              {results
                                .filter(r => {
                                    const st = users.find(u => u.id === r.studentId);
                                    const mapping = st?.mappings?.[0];
                                    
                                    if (resultSchoolFilter !== 'ALL' && st?.school !== resultSchoolFilter) return false;
                                    if (resultClassFilter !== 'ALL' && st?.class !== resultClassFilter) return false;
                                    if (resultRoomFilter !== 'ALL' && mapping?.room !== resultRoomFilter) return false;
                                    if (resultSessionFilter !== 'ALL' && mapping?.session !== resultSessionFilter) return false;
                                    if (resultExamFilter !== 'ALL' && r.examTitle !== resultExamFilter) return false;
                                    
                                    return true;
                                })
                                .sort((a, b) => {
                                    const stA = users.find(u => u.id === a.studentId);
                                    const stB = users.find(u => u.id === b.studentId);
                                    let valA: any = '';
                                    let valB: any = '';
                                    
                                    switch (resultSort.column) {
                                        case 'studentName': valA = a.studentName; valB = b.studentName; break;
                                        case 'nomorPeserta': valA = stA?.nomorPeserta || stA?.username || ''; valB = stB?.nomorPeserta || stB?.username || ''; break;
                                        case 'class': valA = stA?.class || ''; valB = stB?.class || ''; break;
                                        case 'school': valA = stA?.school || ''; valB = stB?.school || ''; break;
                                        case 'examTitle': valA = a.examTitle; valB = b.examTitle; break;
                                        case 'score': valA = a.score; valB = b.score; break;
                                        case 'submittedAt': valA = new Date(a.submittedAt).getTime(); valB = new Date(b.submittedAt).getTime(); break;
                                    }
                                    
                                    if (valA < valB) return resultSort.direction === 'asc' ? -1 : 1;
                                    if (valA > valB) return resultSort.direction === 'asc' ? 1 : -1;
                                    return 0;
                                })
                                .map(r => {
                                  const student = users.find(u => u.id === r.studentId);
                                  return (
                                    <tr key={r.id} className="hover:bg-gray-50 transition">
                                        <td className="p-4 font-medium text-gray-900">{r.studentName}</td>
                                        <td className="p-4 font-mono text-gray-600">{student?.nomorPeserta || student?.username || '-'}</td>
                                        <td className="p-4 text-gray-600">{student?.class || '-'}</td>
                                        <td className="p-4 text-gray-600">{student?.school || '-'}</td>
                                        <td className="p-4 text-gray-700">{r.examTitle}</td>
                                        <td className="p-4">
                                            <span className="font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">{r.score}</span>
                                        </td>
                                        <td className="p-4 text-gray-500 text-xs">{new Date(r.submittedAt).toLocaleString()}</td>
                                    </tr>
                                  );
                                })
                              }
                              {results.length === 0 && (
                                  <tr><td colSpan={7} className="p-8 text-center text-gray-400 italic">Belum ada data hasil ujian.</td></tr>
                              )}
                          </tbody>
                      </table>
                  </div>
                       </>
                   ) : (
                       <div className="animate-in slide-in-from-right duration-300">
                           {selectedReviewResult ? (
                               <div>
                                   <button 
                                       onClick={() => setSelectedReviewResult(null)}
                                       className="mb-6 flex items-center text-blue-600 font-bold hover:underline"
                                   >
                                       <ChevronLeft size={20} className="mr-1"/> Kembali ke Daftar
                                   </button>
                                   
                                   <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 mb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                       <div>
                                           <h4 className="text-2xl font-black text-blue-900">{selectedReviewResult.studentName}</h4>
                                           <p className="text-blue-700 font-medium">{selectedReviewResult.examTitle} • {users.find(u => u.id === selectedReviewResult.studentId)?.class || '-'}</p>
                                       </div>
                                       <div className="bg-white px-6 py-3 rounded-2xl shadow-sm border border-blue-200 text-center">
                                           <p className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-1">Skor Akhir</p>
                                           <p className="text-4xl font-black text-blue-600">{selectedReviewResult.score}</p>
                                       </div>
                                   </div>

                                   <div className="space-y-6">
                                       {(() => {
                                           const exam = exams.find(e => e.id === selectedReviewResult.examId);
                                           if (!exam) return <p className="text-center p-8 text-gray-400 italic">Data soal tidak ditemukan.</p>;
                                           
                                           const hasQuestionIds = Array.isArray(selectedReviewResult.answers) && selectedReviewResult.answers.length > 0 && selectedReviewResult.answers[0] && typeof selectedReviewResult.answers[0] === 'object' && 'questionId' in selectedReviewResult.answers[0];
                                           
                                           const displayItems = hasQuestionIds 
                                               ? (selectedReviewResult.answers || []).map((ans: any) => ({ q: exam.questions.find(eq => eq.id === ans.questionId), ans }))
                                               : exam.questions.map((q, idx) => ({ q, ans: null }));

                                           return displayItems.map((item, idx) => {
                                               const q = item.q;
                                               if (!q) return null;
                                               
                                               let studentAnswer = item.ans;
                                               
                                               // Fallback for legacy data (Raw Array)
                                               if (!studentAnswer && Array.isArray(selectedReviewResult.answers)) {
                                                   const rawAnswer = selectedReviewResult.answers[idx];
                                                   // Ensure it's not a formatted object (check for questionId)
                                                   if (rawAnswer !== undefined && (typeof rawAnswer !== 'object' || rawAnswer === null || Array.isArray(rawAnswer) || !('questionId' in rawAnswer))) {
                                                       // Re-calculate isCorrect for legacy data
                                                       let isCorrect = false;
                                                       if (rawAnswer === null || rawAnswer === undefined) {
                                                           isCorrect = false;
                                                       } else if ((q.type === 'PG' || q.type === 'TRUE_FALSE') && rawAnswer === q.correctIndex) {
                                                           isCorrect = true;
                                                       } else if (q.type === 'PG_KOMPLEKS' && q.correctIndices) {
                                                           const selected = Array.isArray(rawAnswer) ? [...rawAnswer].sort() : [];
                                                           const correct = [...q.correctIndices].sort();
                                                           if (JSON.stringify(selected) === JSON.stringify(correct)) isCorrect = true;
                                                       } else if (q.type === 'MATCHING' && q.matchingCorrectMap) {
                                                           let allCorrect = true;
                                                           const leftSides = Object.keys(q.matchingCorrectMap);
                                                           for (const left of leftSides) {
                                                               if (!rawAnswer || rawAnswer[left] !== q.matchingCorrectMap[left]) {
                                                                   allCorrect = false;
                                                                   break;
                                                               }
                                                           }
                                                           if (allCorrect) isCorrect = true;
                                                       }

                                                       studentAnswer = {
                                                           questionId: q.id,
                                                           answer: rawAnswer,
                                                           isCorrect: isCorrect
                                                       };
                                                   }
                                               }

                                               const isCorrect = studentAnswer?.isCorrect;
                                               
                                               // Comparison Result Logic with Fallback
                                               let compAnswer = comparisonResult?.answers?.find((a: any) => a && a.questionId === q.id);
                                               if (!compAnswer && comparisonResult && Array.isArray(comparisonResult.answers)) {
                                                   const originalIdx = exam.questions.findIndex(eq => eq.id === q.id);
                                                   const rawCompAnswer = comparisonResult.answers[originalIdx];
                                                   if (rawCompAnswer !== undefined && (typeof rawCompAnswer !== 'object' || rawCompAnswer === null || Array.isArray(rawCompAnswer) || !('questionId' in rawCompAnswer))) {
                                                       let isCompCorrect = false;
                                                       // Re-calculate logic (simplified for brevity, same as above)
                                                       if (rawCompAnswer === null || rawCompAnswer === undefined) {
                                                           isCompCorrect = false;
                                                       } else if ((q.type === 'PG' || q.type === 'TRUE_FALSE') && rawCompAnswer === q.correctIndex) {
                                                           isCompCorrect = true;
                                                       } else if (q.type === 'PG_KOMPLEKS' && q.correctIndices) {
                                                           const selected = Array.isArray(rawCompAnswer) ? [...rawCompAnswer].sort() : [];
                                                           const correct = [...q.correctIndices].sort();
                                                           if (JSON.stringify(selected) === JSON.stringify(correct)) isCompCorrect = true;
                                                       } else if (q.type === 'MATCHING' && q.matchingCorrectMap) {
                                                           let allCorrect = true;
                                                           const leftSides = Object.keys(q.matchingCorrectMap);
                                                           for (const left of leftSides) {
                                                               if (!rawCompAnswer || rawCompAnswer[left] !== q.matchingCorrectMap[left]) {
                                                                   allCorrect = false;
                                                                   break;
                                                               }
                                                           }
                                                           if (allCorrect) isCompCorrect = true;
                                                       }
                                                       compAnswer = {
                                                           questionId: q.id,
                                                           answer: rawCompAnswer,
                                                           isCorrect: isCompCorrect
                                                       };
                                                   }
                                               }
                                               const isCompCorrect = compAnswer?.isCorrect;
                                               
                                               return (
                                                   <div key={q.id} className={`p-6 rounded-2xl border-2 transition-all ${comparisonResult ? 'border-gray-100 bg-white' : (isCorrect ? 'border-green-100 bg-green-50/30' : 'border-red-100 bg-red-50/30')}`}>
                                                       <div className="flex justify-between items-start mb-4">
                                                           <div className="flex items-center gap-3">
                                                               <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white ${comparisonResult ? 'bg-gray-400' : (isCorrect ? 'bg-green-500' : 'bg-red-500')}`}>
                                                                   {idx + 1}
                                                               </span>
                                                               {!comparisonResult && (
                                                                   <span className={`text-xs font-bold px-3 py-1 rounded-full uppercase ${isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                                       {isCorrect ? 'BENAR' : 'SALAH'}
                                                                   </span>
                                                               )}
                                                               {comparisonResult && (
                                                                   <div className="flex gap-2">
                                                                       <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                                           {(selectedReviewResult.studentName || 'Peserta').split(' ')[0]}: {isCorrect ? '✓' : '✗'}
                                                                       </span>
                                                                       <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${isCompCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                                           {(comparisonResult?.studentName || 'Peserta').split(' ')[0]}: {isCompCorrect ? '✓' : '✗'}
                                                                       </span>
                                                                   </div>
                                                               )}
                                                           </div>
                                                           <span className="text-xs font-bold text-gray-400">Bobot: {q.points}</span>
                                                       </div>
                                                       
                                                       <div className="mb-4 text-gray-800 font-medium ql-snow">
                                                           <ReactQuill theme="snow" value={q.text} readOnly={true} modules={{ toolbar: false }} className="read-only-quill-preview" />
                                                       </div>
                                                       
                                                       {q.imgUrl && <img src={q.imgUrl} alt="Question" className="max-w-md rounded-xl mb-4 border shadow-sm" />}
                                                       
                                                       <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                           {(q.type === 'PG' || q.type === 'PG_KOMPLEKS' || q.type === 'TRUE_FALSE') && (
                                                               (q.type === 'TRUE_FALSE' ? ['Benar', 'Salah'] : q.options).map((opt, i) => {
                                                                   const isStudentChoice = q.type === 'PG_KOMPLEKS' 
                                                                       ? (Array.isArray(studentAnswer?.answer) 
                                                                           ? (studentAnswer.answer.length > 0 && typeof studentAnswer.answer[0] === 'string' 
                                                                               ? studentAnswer.answer.includes(opt) 
                                                                               : studentAnswer.answer.includes(i))
                                                                           : (typeof studentAnswer?.answer === 'string' && studentAnswer?.answer?.includes(','))
                                                                               ? studentAnswer?.answer.split(',').map((s: string) => parseInt(s.trim())).includes(i)
                                                                               : studentAnswer?.answer == i)
                                                                       : (typeof studentAnswer?.answer === 'string' 
                                                                           ? studentAnswer.answer === opt 
                                                                           : studentAnswer?.answer == i);
                                                                   
                                                                   const isCompChoice = q.type === 'PG_KOMPLEKS'
                                                                       ? (Array.isArray(compAnswer?.answer) 
                                                                           ? (compAnswer.answer.length > 0 && typeof compAnswer.answer[0] === 'string' 
                                                                               ? compAnswer.answer.includes(opt) 
                                                                               : compAnswer.answer.includes(i))
                                                                           : (typeof compAnswer?.answer === 'string' && compAnswer?.answer?.includes(','))
                                                                               ? compAnswer?.answer.split(',').map((s: string) => parseInt(s.trim())).includes(i)
                                                                               : compAnswer?.answer == i)
                                                                       : (typeof compAnswer?.answer === 'string' 
                                                                           ? compAnswer.answer === opt 
                                                                           : compAnswer?.answer == i);

                                                                   const isCorrectChoice = q.type === 'PG_KOMPLEKS'
                                                                       ? q.correctIndices?.includes(i)
                                                                       : q.correctIndex === i;
                                                                   
                                                                   let bgColor = 'bg-white border-gray-200';
                                                                    if (isStudentChoice && !isCorrectChoice) bgColor = 'bg-red-50 border-red-200 ring-1 ring-red-300';
                                                                    if (isCorrectChoice) bgColor = 'bg-green-50 border-green-200 ring-1 ring-green-300';

                                                                   
                                                                   
                                                                   return (
                                                                       <div key={i} className={`p-3 rounded-xl border flex items-center gap-3 relative overflow-hidden ${bgColor}`}>
                                                                           <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border ${isCorrectChoice ? 'bg-green-500 text-white border-green-600' : (isStudentChoice ? 'bg-red-500 text-white border-red-600' : 'bg-white text-gray-400')}`}>
                                                                               {String.fromCharCode(65 + i)}
                                                                           </div>
                                                                           <span className={`text-sm ${isCorrectChoice ? 'font-bold text-green-900' : (isStudentChoice ? 'font-bold text-red-900' : 'text-gray-700')}`}>{opt}</span>
                                                                           
                                                                           <div className="ml-auto flex flex-col items-end gap-1">
                                                                                {isCorrectChoice && (
                                                                                    <span className="text-[8px] font-black px-1.5 py-0.5 rounded uppercase bg-green-600 text-white">
                                                                                        Kunci
                                                                                    </span>
                                                                                )}

                                                                               {isStudentChoice && (
                                                                                   <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${isCorrectChoice ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                                                                                       {(selectedReviewResult.studentName || 'Peserta').split(' ')[0]}
                                                                                   </span>
                                                                               )}
                                                                               {isCompChoice && (
                                                                                   <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${isCorrectChoice ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                                                                                       {(comparisonResult?.studentName || 'Peserta').split(' ')[0]}
                                                                                   </span>
                                                                               )}
                                                                           </div>
                                                                       </div>
                                                                   );
                                                               })
                                                           )}
                                                           {q.type === 'MATCHING' && (
                                                               <div className="col-span-2 space-y-2">
                                                                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                       <div>
                                                                           <p className="text-[10px] font-black text-gray-400 uppercase mb-2">Jawaban {(selectedReviewResult.studentName || 'Peserta').split(' ')[0]}:</p>
                                                                           <div className="space-y-1">
                                                                               {q.options.map((opt, i) => {
                                                                                   const [left] = opt.split('|');
                                                                                   const studentMatch = studentAnswer?.answer?.[left];
                                                                                   const correctMatch = q.options.find(o => o.startsWith(left + '|'))?.split('|')[1];
                                                                                   const isMatchCorrect = studentMatch === correctMatch;

                                                                                   return (
                                                                                       <div key={i} className={`flex items-center gap-2 p-2 rounded-lg border text-xs ${isMatchCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                                                                           <div className="flex-1 font-bold">{left}</div>
                                                                                           <div className="text-gray-400">→</div>
                                                                                           <div className="flex-1 font-bold">{studentMatch || '-'}</div>
                                                                                       </div>
                                                                                   );
                                                                               })}
                                                                           </div>
                                                                       </div>
                                                                       {comparisonResult && (
                                                                           <div>
                                                                               <p className="text-[10px] font-black text-gray-400 uppercase mb-2">Jawaban {(comparisonResult.studentName || 'Peserta').split(' ')[0]}:</p>
                                                                               <div className="space-y-1">
                                                                                   {q.options.map((opt, i) => {
                                                                                       const [left] = opt.split('|');
                                                                                       const compMatch = compAnswer?.answer?.[left];
                                                                                       const correctMatch = q.options.find(o => o.startsWith(left + '|'))?.split('|')[1];
                                                                                       const isMatchCorrect = compMatch === correctMatch;

                                                                                       return (
                                                                                           <div key={i} className={`flex items-center gap-2 p-2 rounded-lg border text-xs ${isMatchCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                                                                               <div className="flex-1 font-bold">{left}</div>
                                                                                               <div className="text-gray-400">→</div>
                                                                                               <div className="flex-1 font-bold">{compMatch || '-'}</div>
                                                                                           </div>
                                                                                       );
                                                                                   })}
                                                                               </div>
                                                                           </div>
                                                                       )}
                                                                   </div>
                                                                   <div className="mt-2 p-2 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                                                       <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Kunci Jawaban:</p>
                                                                       <div className="flex flex-wrap gap-2">
                                                                           {q.options.map((opt, i) => (
                                                                               <span key={i} className="text-[10px] bg-white px-2 py-0.5 rounded border font-bold text-gray-600">
                                                                                   {opt.replace('|', ' → ')}
                                                                               </span>
                                                                           ))}
                                                                       </div>
                                                                   </div>
                                                               </div>
                                                           )}
                                                           {q.type === 'URAIAN' && (
                                                               <div className="col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                   <div className="p-3 bg-white border rounded-xl">
                                                                       <p className="text-[10px] font-black text-gray-400 uppercase mb-1">{(selectedReviewResult.studentName || 'Peserta').split(' ')[0]}:</p>
                                                                       <div className="text-sm italic text-gray-700">{studentAnswer?.answer || '(Kosong)'}</div>
                                                                   </div>
                                                                   {comparisonResult && (
                                                                       <div className="p-3 bg-white border rounded-xl">
                                                                           <p className="text-[10px] font-black text-gray-400 uppercase mb-1">{(comparisonResult.studentName || 'Peserta').split(' ')[0]}:</p>
                                                                           <div className="text-sm italic text-gray-700">{compAnswer?.answer || '(Kosong)'}</div>
                                                                       </div>
                                                                   )}
                                                               </div>
                                                           )}
                                                       </div>
                                                   </div>
                                               );
                                           });
                                       })()}
                                   </div>
                               </div>
                           ) : (
                               <div>
                                   <div className="mb-8 bg-gray-50 p-6 rounded-2xl border border-gray-100 flex flex-wrap items-center gap-6 shadow-sm">
                                       <div className="flex items-center gap-3">
                                           <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
                                               <Filter size={20}/>
                                           </div>
                                           <span className="font-black text-gray-800 uppercase tracking-tight">Filter Review</span>
                                       </div>
                                       
                                       <div className="flex-1 min-w-[200px]">
                                           <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">Mata Pelajaran</label>
                                           <select 
                                               className="w-full border-2 border-gray-200 rounded-xl p-2.5 text-sm font-bold bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all" 
                                               value={reviewExamFilter} 
                                               onChange={e => setReviewExamFilter(e.target.value)}
                                           >
                                               <option value="ALL">Semua Mapel</option>
                                               {resultExams.map(ex => <option key={ex} value={ex}>{ex}</option>)}
                                           </select>
                                       </div>

                                       <div className="flex-1 min-w-[150px]">
                                           <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">Kelas</label>
                                           <select 
                                               className="w-full border-2 border-gray-200 rounded-xl p-2.5 text-sm font-bold bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all" 
                                               value={reviewClassFilter} 
                                               onChange={e => setReviewClassFilter(e.target.value)}
                                           >
                                               <option value="ALL">Semua Kelas</option>
                                               {classes.map(c => <option key={c} value={c}>{c}</option>)}
                                           </select>
                                       </div>
                                   </div>

                                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                       {results
                                           .filter(r => {
                                               const student = users.find(u => u.id === r.studentId);
                                               if (reviewExamFilter !== 'ALL' && r.examTitle !== reviewExamFilter) return false;
                                               if (reviewClassFilter !== 'ALL' && student?.class !== reviewClassFilter) return false;
                                               return true;
                                           })
                                           .map(r => {
                                               const student = users.find(u => u.id === r.studentId);
                                               return (
                                                   <div 
                                                       key={r.id} 
                                                       onClick={() => setSelectedReviewResult(r)}
                                                       className="group bg-white border-2 border-gray-100 rounded-2xl p-4 hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/5 transition-all cursor-pointer flex items-center justify-between gap-4"
                                                   >
                                                       <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-full -mr-12 -mt-12 group-hover:bg-blue-100 transition-colors" />
                                                       
                                                       <div className="relative">
                                                           <div className="flex justify-between items-start mb-3">
                                                               <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400 group-hover:bg-blue-500 group-hover:text-white transition-all">
                                                                   <Users size={24}/>
                                                               </div>
                                                               <div className="text-right">
                                                                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Skor</p>
                                                                   <p className="text-2xl font-black text-blue-600">{r.score}</p>
                                                               </div>
                                                           </div>
                                                           
                                                           <h5 className="font-black text-gray-900 text-lg leading-tight mb-1 group-hover:text-blue-600 transition-colors">{r.studentName}</h5>
                                                           <p className="text-xs font-bold text-gray-500 mb-4">{student?.nomorPeserta || '-'} • {student?.class || '-'}</p>
                                                           
                                                           <div className="pt-4 border-t border-gray-50 flex justify-between items-center">
                                                               <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter truncate max-w-[150px]">{r.examTitle}</span>
                                                               <span className="text-blue-600 font-bold text-xs flex items-center group-hover:translate-x-1 transition-transform">
                                                                   Review <ChevronRight size={14} className="ml-1"/>
                                                               </span>
                                                           </div>
                                                       </div>
                                                   </div>
                                               );
                                           })
                                       }
                                       {results.length === 0 && (
                                           <div className="col-span-full p-12 text-center bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
                                               <p className="text-gray-400 font-bold italic">Belum ada data untuk direview.</p>
                                           </div>
                                       )}
                                   </div>
                               </div>
                           )}
                       </div>
                   )}
               </div>
          )}

          {/* CETAK KARTU - "JOS JIS" MODE A4 PRECISE */}
          {activeTab === 'CETAK_KARTU' && (
              <div className="bg-white rounded-xl shadow-sm border p-6 animate-in fade-in print:shadow-none print:border-none print:p-0">
                  {/* Toolbar - Hidden when Printing */}
                  <div className="flex flex-col md:flex-row justify-between items-center mb-6 no-print gap-4 print:hidden">
                      <h3 className="font-bold text-lg">Cetak Kartu Peserta</h3>
                      <div className="flex flex-wrap gap-4 items-center bg-gray-50 p-3 rounded-lg border">
                          <div>
                              <label className="block text-xs font-bold text-gray-500 mb-1">Filter Sekolah</label>
                              <select className="border rounded p-1.5 text-sm w-48" value={cardSchoolFilter} onChange={e => setCardSchoolFilter(e.target.value)}>
                                  <option value="ALL">Semua Sekolah</option>
                                  {schools.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-gray-500 mb-1">Model Kartu</label>
                              <select className="border rounded p-1.5 text-sm w-48" value={cardModel} onChange={e => setCardModel(e.target.value as any)}>
                                  <option value="MODEL_1">Model 1 (Standar)</option>
                                  <option value="MODEL_2">Model 2 (Minimalis)</option>
                              </select>
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-gray-500 mb-1">Tanggal Cetak</label>
                              <input type="date" className="border rounded p-1.5 text-sm" value={printDate} onChange={e => setPrintDate(e.target.value)}/>
                          </div>
                          <button onClick={() => window.print()} className="bg-blue-600 text-white px-4 py-2 rounded font-bold text-sm flex items-center hover:bg-blue-700 h-full mt-4 md:mt-0 shadow-lg transform active:scale-95 transition-all">
                              <Download size={16} className="mr-2"/> Download PDF / Cetak
                          </button>
                      </div>
                  </div>

                  {/* Printable Area - ID used in CSS to show ONLY this */}
                  <div id="printable-area">
                    <div className="print-grid">
                        {getMonitoringUsers(cardSchoolFilter).map(u => (
                            <div key={u.id} className="card-container bg-white relative flex overflow-hidden">
                                
                                {/* Watermark Background */}
                                <div className="absolute inset-0 opacity-5 flex items-center justify-center pointer-events-none z-0">
                                     <img src={FIXED_LOGO_URL} className="w-32 h-32 object-contain grayscale" />
                                </div>
                                
                                <div className="z-10 flex w-full h-full relative">
                                    {cardModel === 'MODEL_1' ? (
                                        <>
                                            {/* Left Column: Logo & Photo & Signature */}
                                            <div className="w-[30%] border-r-2 border-dashed border-gray-400 flex flex-col items-center justify-between p-2 text-center bg-gray-50/30">
                                                <div className="mt-1">
                                                    <img src={FIXED_LOGO_URL} className="w-10 h-10 object-contain mix-blend-multiply" alt="Logo"/>
                                                </div>
                                                
                                                <div className="w-full flex-1 flex flex-col items-center justify-center my-1">
                                                    <div className="w-[20mm] h-[25mm] border border-gray-400 bg-white flex items-center justify-center shadow-inner">
                                                        <span className="text-[8px] text-gray-300 font-bold transform -rotate-12 whitespace-nowrap">FOTO 3x4</span>
                                                    </div>
                                                </div>

                                                <div className="mb-1 w-full border-t border-gray-400 pt-1">
                                                    <div className="h-4"></div> {/* Space for signature */}
                                                    <p className="text-[7px] font-bold text-gray-500 uppercase">Tanda Tangan</p>
                                                </div>
                                            </div>

                                            {/* Right Column: Details */}
                                            <div className="flex-1 p-2 flex flex-col justify-between">
                                                {/* Header */}
                                                <div className="border-b-2 border-gray-800 pb-1 mb-1">
                                                    <h2 className="font-black text-sm text-gray-900 leading-none mb-0.5 uppercase">KARTU PESERTA</h2>
                                                    <p className="text-[8px] font-bold text-gray-600 tracking-widest uppercase">{appName || 'ONLINE BASED TEST'}</p>
                                                </div>

                                                {/* Info Table */}
                                                <div className="flex-1 space-y-0.5 text-[9px] text-gray-900 font-medium mt-0.5">
                                                    <div className="flex items-start">
                                                        <span className="w-14 font-bold text-gray-500">NAMA</span>
                                                        <span className="font-bold uppercase flex-1 leading-tight truncate">: {u.name}</span>
                                                    </div>
                                                    <div className="flex items-center">
                                                        <span className="w-14 font-bold text-gray-500">Nomor Peserta</span>
                                                        <span className="font-mono font-bold">: {u.nomorPeserta || u.username}</span>
                                                    </div>
                                                    <div className="flex items-center">
                                                        <span className="w-14 font-bold text-gray-500">KELAS</span>
                                                        <span className="font-bold">: {u.class || '-'}</span>
                                                    </div>
                                                    <div className="flex items-center">
                                                        <span className="w-14 font-bold text-gray-500">PASS</span>
                                                        <span className="font-mono font-bold bg-gray-100 px-1 border border-gray-200 rounded">: {u.password}</span>
                                                    </div>
                                                    <div className="flex items-start">
                                                        <span className="w-14 font-bold text-gray-500">SEKOLAH</span>
                                                        <span className="flex-1 truncate leading-tight">: {u.school || '-'}</span>
                                                    </div>
                                                    <div className="flex items-center">
                                                        <span className="w-14 font-bold text-gray-500">SESI</span>
                                                        <span>: {u.mappings?.[0]?.session ? `${u.mappings[0].session.replace('Sesi ', '')} (${sessionTimes[u.mappings[0].session] || '-'})` : '-'}</span>
                                                    </div>
                                                </div>

                                                {/* Footer */}
                                                <div className="mt-1 pt-1 border-t border-gray-200 flex justify-between items-end">
                                                    <div className="text-[7px] text-gray-400 italic max-w-[100px] leading-tight">
                                                        *Bawa kartu saat ujian.
                                                    </div>
                                                    <div className="text-center min-w-[80px]">
                                                        <p className="text-[7px] text-gray-600 mb-2 leading-none">
                                                            Pasuruan, {new Date(printDate).toLocaleDateString('id-ID', { month: 'short', year: 'numeric', day: 'numeric' })}
                                                        </p>
                                                        <p className="text-[7px] font-bold underline">Panitia Pelaksana</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex flex-col w-full h-full border-2 border-blue-800 bg-white">
                                            <div className="bg-blue-800 text-white p-2 flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <img src={FIXED_LOGO_URL} className="w-6 h-6 object-contain bg-white rounded-full p-0.5" alt="Logo"/>
                                                    <div>
                                                        <h2 className="font-black text-[10px] leading-none uppercase">KARTU PESERTA</h2>
                                                        <p className="text-[6px] tracking-widest uppercase opacity-80">{appName || 'ONLINE BASED TEST'}</p>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex-1 p-2 flex gap-2">
                                                <div className="flex-1 space-y-1 text-[9px] text-gray-900 font-medium">
                                                    <div className="flex items-start">
                                                        <span className="w-16 font-bold text-gray-600">NAMA</span>
                                                        <span className="font-bold uppercase flex-1 leading-tight truncate">: {u.name}</span>
                                                    </div>
                                                    <div className="flex items-center">
                                                        <span className="w-16 font-bold text-gray-600">NO. PESERTA</span>
                                                        <span className="font-mono font-bold">: {u.nomorPeserta || u.username}</span>
                                                    </div>
                                                    <div className="flex items-center">
                                                        <span className="w-16 font-bold text-gray-600">PASSWORD</span>
                                                        <span className="font-mono font-bold bg-gray-100 px-1 border border-gray-200 rounded">: {u.password}</span>
                                                    </div>
                                                    <div className="flex items-center">
                                                        <span className="w-16 font-bold text-gray-600">KELAS/SESI</span>
                                                        <span className="font-bold">: {u.class || '-'} / {u.mappings?.[0]?.session ? u.mappings[0].session.replace('Sesi ', '') : '-'}</span>
                                                    </div>
                                                    <div className="flex items-start">
                                                        <span className="w-16 font-bold text-gray-600">SEKOLAH</span>
                                                        <span className="flex-1 truncate leading-tight">: {u.school || '-'}</span>
                                                    </div>
                                                </div>
                                                <div className="w-[20mm] flex flex-col items-center justify-between">
                                                    <div className="w-[20mm] h-[25mm] border border-gray-400 bg-gray-50 flex items-center justify-center shadow-inner">
                                                        <span className="text-[8px] text-gray-400 font-bold transform -rotate-12 whitespace-nowrap">FOTO</span>
                                                    </div>
                                                    <div className="w-full text-center mt-1">
                                                        <p className="text-[6px] text-gray-600 leading-none mb-3">Panitia</p>
                                                        <div className="border-b border-gray-400 w-full"></div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                  </div>
              </div>
          )}

          {/* SYSTEM ANTI CHEAT PANEL */}
          {activeTab === 'ANTI_CHEAT' && (
              <div className="space-y-6 animate-in fade-in print:hidden">
                  <div className="flex justify-between items-center">
                      <h3 className="font-bold text-lg flex items-center"><ShieldAlert size={24} className="mr-2 text-red-600"/> Konfigurasi Sistem Anti-Curang</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Configuration Card */}
                      <div className="bg-white rounded-xl shadow-sm border p-6">
                          <h4 className="font-bold text-gray-800 mb-4 border-b pb-2">Pengaturan Deteksi & Alert</h4>
                          <div className="space-y-4">
                              <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border">
                                  <div>
                                      <p className="font-bold text-sm text-gray-700">Status Sistem</p>
                                      <p className="text-xs text-gray-500">Aktifkan deteksi pindah tab/window.</p>
                                  </div>
                                  <button 
                                      onClick={() => setAcActive(!acActive)}
                                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${acActive ? 'bg-green-500' : 'bg-gray-300'}`}
                                  >
                                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${acActive ? 'translate-x-6' : 'translate-x-1'}`} />
                                  </button>
                              </div>

                              <div>
                                  <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center"><Clock size={14} className="mr-2"/> Durasi Freeze (Detik)</label>
                                  <input 
                                      type="number" 
                                      min="0"
                                      value={acFreeze}
                                      onChange={(e) => setAcFreeze(parseInt(e.target.value))}
                                      className="w-full border rounded-lg p-2 text-sm"
                                  />
                              </div>

                              <div>
                                  <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center"><AlertTriangle size={14} className="mr-2"/> Pesan Peringatan</label>
                                  <textarea 
                                      value={acText}
                                      onChange={(e) => setAcText(e.target.value)}
                                      className="w-full border rounded-lg p-2 text-sm h-20"
                                      placeholder="Pesan yang muncul saat layar dikunci..."
                                  />
                              </div>

                              <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border">
                                  <div className="flex items-center gap-3">
                                      <Volume2 size={18} className="text-gray-600"/>
                                      <p className="font-bold text-sm text-gray-700">Bunyi Alert (Beep)</p>
                                  </div>
                                  <button 
                                      onClick={() => setAcSound(!acSound)}
                                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${acSound ? 'bg-blue-500' : 'bg-gray-300'}`}
                                  >
                                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${acSound ? 'translate-x-6' : 'translate-x-1'}`} />
                                  </button>
                              </div>

                              <div className="border-t pt-4 mt-4">
                                  <h5 className="text-sm font-bold text-gray-800 mb-3 flex items-center"><Lock size={14} className="mr-2 text-red-600"/> Fitur Anti-Submit Cepat</h5>
                                  
                                  <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border mb-3">
                                      <div className="flex-1">
                                          <p className="font-bold text-sm text-gray-700">Aktifkan Anti-Submit</p>
                                          <p className="text-[10px] text-gray-500">Peserta tidak bisa kirim jawaban sebelum waktu tertentu.</p>
                                      </div>
                                      <button 
                                          onClick={() => setAcAntiSubmit(!acAntiSubmit)}
                                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${acAntiSubmit ? 'bg-red-500' : 'bg-gray-300'}`}
                                      >
                                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${acAntiSubmit ? 'translate-x-6' : 'translate-x-1'}`} />
                                      </button>
                                  </div>

                                  {acAntiSubmit && (
                                      <div className="bg-red-50 p-3 rounded-lg border border-red-100 animate-in slide-in-from-top-2 duration-200">
                                          <label className="block text-xs font-bold text-red-700 mb-1">Waktu Tunggu (Menit Sebelum Akhir)</label>
                                          <div className="flex items-center gap-2">
                                              <input 
                                                  type="number" 
                                                  min="1"
                                                  value={acAntiSubmitTime}
                                                  onChange={(e) => setAcAntiSubmitTime(parseInt(e.target.value))}
                                                  className="flex-1 border rounded p-1.5 text-sm"
                                              />
                                              <span className="text-xs font-bold text-red-600">Menit</span>
                                          </div>
                                          <p className="text-[9px] text-red-500 mt-1 italic">
                                              *Contoh: Jika durasi 60 menit & diisi 10, maka peserta baru bisa kirim setelah 50 menit pengerjaan.
                                          </p>
                                      </div>
                                  )}
                              </div>
                              
                              <button onClick={handleSaveAntiCheat} className="w-full bg-slate-800 text-white py-2.5 rounded-lg font-bold text-sm hover:bg-slate-900 transition flex items-center justify-center">
                                  <Save size={16} className="mr-2"/> Simpan Konfigurasi
                              </button>
                          </div>
                      </div>

                      {/* Cheating Recap Card */}
                      <div className="bg-white rounded-xl shadow-sm border p-6 flex flex-col h-full">
                          <h4 className="font-bold text-gray-800 mb-4 border-b pb-2 flex items-center text-red-600"><UserX size={18} className="mr-2"/> Riwayat Pelanggaran Peserta</h4>
                          <div className="flex-1 overflow-y-auto">
                               {results.filter(r => r.cheatingAttempts > 0).length === 0 ? (
                                   <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                                       <ShieldAlert size={48} className="mb-2 opacity-50"/>
                                       <p className="text-sm">Belum ada data pelanggaran.</p>
                                   </div>
                               ) : (
                                   <table className="w-full text-sm text-left">
                                       <thead className="bg-red-50 text-red-800 font-bold">
                                           <tr>
                                               <th className="p-2 rounded-tl-lg">Nama Peserta</th>
                                               <th className="p-2">Mapel</th>
                                               <th className="p-2 text-center">Status</th>
                                               <th className="p-2 text-center">Pelanggaran</th>
                                               <th className="p-2 rounded-tr-lg text-right">Nilai</th>
                                           </tr>
                                       </thead>
                                       <tbody className="divide-y">
                                           {results
                                              .filter(r => r.cheatingAttempts > 0)
                                              .sort((a, b) => b.cheatingAttempts - a.cheatingAttempts)
                                              .map(r => (
                                                  <tr key={r.id} className="hover:bg-red-50/50">
                                                      <td className="p-2">
                                                          <div className="font-bold text-gray-800">{r.studentName}</div>
                                                          <div className="text-xs text-gray-500">{users.find(u => u.id === r.studentId)?.school || '-'}</div>
                                                      </td>
                                                      <td className="p-2 text-xs text-gray-600">{r.examTitle}</td>
                                                      <td className="p-2 text-center">
                                                          {r.status === 'working' && <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">Sedang Ujian</span>}
                                                          {r.status === 'finished' && <span className="text-[10px] font-bold px-2 py-0.5 bg-green-100 text-green-700 rounded-full">Selesai</span>}
                                                          {r.status === 'locked' && <span className="text-[10px] font-bold px-2 py-0.5 bg-red-600 text-white rounded-full animate-pulse">TERKUNCI</span>}
                                                      </td>
                                                      <td className="p-2 text-center">
                                                          <span className="inline-flex items-center justify-center px-2 py-1 bg-red-100 text-red-700 rounded-full font-bold text-xs">
                                                              {r.cheatingAttempts}x
                                                          </span>
                                                      </td>
                                                      <td className="p-2 text-right font-bold text-gray-700">{r.status === 'working' ? '-' : r.score}</td>
                                                  </tr>
                                              ))
                                           }
                                       </tbody>
                                   </table>
                               )}
                          </div>
                      </div>
                  </div>
              </div>
          )}

          {/* TROUBLESHOOTING PANEL */}
          {activeTab === 'TROUBLESHOOTING' && (
              <div className="space-y-6 animate-in fade-in print:hidden">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="font-bold text-lg flex items-center"><Wrench size={24} className="mr-2 text-gray-600"/> Troubleshooting</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      <div className="bg-white rounded-xl shadow-sm border p-6 flex flex-col items-center text-center hover:shadow-md transition">
                          <div className="bg-orange-100 p-4 rounded-full mb-4">
                              <LogOut size={32} className="text-orange-600" />
                          </div>
                          <h4 className="font-bold text-gray-800 mb-2">Reset Status Login</h4>
                          <p className="text-sm text-gray-500 mb-6">Memaksa semua peserta keluar (logout). Berguna jika ada peserta yang nyangkut status loginnya.</p>
                          <button 
                              onClick={handleResetAllLogins}
                              className="mt-auto w-full bg-orange-500 text-white py-2 rounded-lg font-bold hover:bg-orange-600 transition shadow-sm"
                          >
                              Reset Semua Login
                          </button>
                      </div>

                      <div className="bg-white rounded-xl shadow-sm border p-6 flex flex-col items-center text-center hover:shadow-md transition">
                          <div className="bg-green-100 p-4 rounded-full mb-4">
                              <ShieldAlert size={32} className="text-green-600" />
                          </div>
                          <h4 className="font-bold text-gray-800 mb-2">Reset Pelanggaran</h4>
                          <p className="text-sm text-gray-500 mb-6">Mengembalikan jumlah pelanggaran (kecurangan) semua peserta menjadi 0.</p>
                          <button 
                              onClick={handleResetAllViolations}
                              className="mt-auto w-full bg-green-600 text-white py-2 rounded-lg font-bold hover:bg-green-700 transition shadow-sm"
                          >
                              Reset Semua Pelanggaran
                          </button>
                      </div>

                      <div className="bg-white rounded-xl shadow-sm border p-6 flex flex-col items-center text-center hover:shadow-md transition">
                          <div className="bg-blue-100 p-4 rounded-full mb-4">
                              <Unlock size={32} className="text-blue-600" />
                          </div>
                          <h4 className="font-bold text-gray-800 mb-2">Buka Blokir Massal</h4>
                          <p className="text-sm text-gray-500 mb-6">Membuka blokir untuk semua peserta yang akunnya terkunci akibat pelanggaran.</p>
                          <button 
                              onClick={handleUnblockAll}
                              className="mt-auto w-full bg-blue-600 text-white py-2 rounded-lg font-bold hover:bg-blue-700 transition shadow-sm"
                          >
                              Buka Semua Blokir
                          </button>
                      </div>
                  </div>
              </div>
          )}

          {/* MANAJEMEN STAFF & RUANG */}
          {activeTab === 'STAFF' && (
              <div className="space-y-6 animate-in fade-in print:hidden">
                  {/* Judul Kegiatan Section */}
                  <div className="bg-white rounded-xl shadow-sm border p-6">
                      <h3 className="font-bold text-lg mb-4 flex items-center"><Settings size={20} className="mr-2 text-blue-600"/> Pengaturan Umum</h3>
                      <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 flex flex-col md:flex-row md:items-center gap-6">
                          <div className="min-w-[200px]">
                              <label className="block text-sm font-bold text-blue-800 mb-1">Judul Kegiatan</label>
                              <p className="text-xs text-blue-600">Ganti nama aplikasi di header.</p>
                          </div>
                          <div className="flex-1">
                              <textarea 
                                  className="border border-blue-300 rounded-lg px-4 py-2.5 text-sm w-full focus:ring-2 focus:ring-blue-500 outline-none bg-white font-bold text-blue-900 shadow-sm resize-none"
                                  defaultValue={settings.appName}
                                  onBlur={(e) => handleAppNameChange(e.target.value)}
                                  placeholder="Masukkan Judul Kegiatan"
                                  rows={3}
                              ></textarea>
                              <p className="text-[10px] text-blue-600 mt-1">Gunakan Enter untuk baris baru pada cetak kartu.</p>
                          </div>
                      </div>
                  </div>

                  {/* Manajemen Ruang & Proktor Section */}
                  <div className="bg-white rounded-xl shadow-sm border p-6">
                      <div className="flex justify-between items-center mb-6">
                          <h3 className="font-bold text-lg flex items-center"><Database size={20} className="mr-2 text-blue-600"/> Manajemen Ruang & Proktor</h3>
                      </div>

                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-6 shadow-sm">
                          <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center">
                              <Plus size={16} className="mr-2"/> Tambah Ruang Baru
                          </h4>
                          <div className="flex flex-col md:flex-row gap-3 items-end">
                              <div className="w-full md:w-72">
                                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Nama Sekolah</label>
                                  <select 
                                      className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none" 
                                      value={newRoomSchool} 
                                      onChange={e => setNewRoomSchool(e.target.value)}
                                  >
                                      <option value="">Pilih Sekolah...</option>
                                      {schools.map(s => <option key={s} value={s}>{s}</option>)}
                                  </select>
                              </div>
                              <div className="flex-1">
                                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Nama Ruang</label>
                                  <input 
                                      placeholder="Contoh: Ruang 01, LAB KOMPUTER" 
                                      className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none" 
                                      value={newRoomName} 
                                      onChange={e => setNewRoomName(e.target.value)} 
                                  />
                              </div>
                              <button 
                                  onClick={handleCreateRoomProktor} 
                                  disabled={isLoadingData || !newRoomName.trim() || !newRoomSchool.trim()} 
                                  className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-bold text-sm hover:bg-blue-700 disabled:opacity-50 shadow-md transition flex items-center"
                              >
                                  {isLoadingData ? <Loader2 size={16} className="animate-spin mr-2"/> : <Plus size={16} className="mr-2"/>}
                                  Tambah Ruang
                              </button>
                          </div>
                          <p className="text-[10px] text-gray-400 mt-2 font-medium italic">* Akun proktor akan digenerate otomatis dengan format NPSN-001.</p>
                      </div>

                      <div className="overflow-x-auto border rounded-xl bg-white shadow-sm">
                          <table className="w-full text-sm text-left">
                              <thead className="bg-gray-50 font-bold border-b text-gray-600">
                                  <tr>
                                      <th className="p-3 cursor-pointer hover:text-blue-600" onClick={() => handleStaffSort('name')}>
                                          Nama Proktor {staffSort.column === 'name' && (staffSort.direction === 'asc' ? '↑' : '↓')}
                                      </th>
                                      <th className="p-3 cursor-pointer hover:text-blue-600" onClick={() => handleStaffSort('school')}>
                                          Sekolah {staffSort.column === 'school' && (staffSort.direction === 'asc' ? '↑' : '↓')}
                                      </th>
                                      <th className="p-3 cursor-pointer hover:text-blue-600" onClick={() => handleStaffSort('room')}>
                                          Ruang {staffSort.column === 'room' && (staffSort.direction === 'asc' ? '↑' : '↓')}
                                      </th>
                                      <th className="p-3 cursor-pointer hover:text-blue-600" onClick={() => handleStaffSort('username')}>
                                          Username {staffSort.column === 'username' && (staffSort.direction === 'asc' ? '↑' : '↓')}
                                      </th>
                                      <th className="p-3">Password</th>
                                      <th className="p-3 text-center">Aksi</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y">
                                  {getSortedStaff().map(s => (
                                      <tr key={s.id} className="hover:bg-gray-50 transition">
                                          <td className="p-3 font-medium">{s.name}</td>
                                          <td className="p-3 text-xs text-gray-500">{s.school}</td>
                                          <td className="p-3">
                                              <span className="text-xs font-bold text-green-700 bg-green-50 px-2 py-1 rounded border border-green-100">{s.room || '-'}</span>
                                          </td>
                                          <td className="p-3 font-mono text-xs text-blue-600 font-bold">{s.username}</td>
                                          <td className="p-3 font-mono text-xs bg-gray-50 px-2 py-1 rounded border border-gray-200">{s.password}</td>
                                          <td className="p-3 text-center">
                                              <button 
                                                  onClick={() => showConfirm(`Hapus proktor ruang ${s.room}?`, async () => { await db.deleteStaff(s.id); loadData(); })}
                                                  className="text-red-500 hover:text-red-700 p-1.5 rounded hover:bg-red-50 transition"
                                                  title="Hapus Ruang"
                                              >
                                                  <Trash size={18}/>
                                              </button>
                                          </td>
                                      </tr>
                                  ))}
                                  {getSortedStaff().length === 0 && (
                                      <tr>
                                          <td colSpan={6} className="p-10 text-center text-gray-400 italic">Belum ada data ruang/proktor.</td>
                                      </tr>
                                  )}
                              </tbody>
                          </table>
                      </div>
                  </div>
              </div>
          )}

      </main>

      {/* EDIT MODAL FOR MAPPING / SCHEDULE */}
      {isEditModalOpen && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-md print:hidden">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-0 animate-in zoom-in-95 max-h-[90vh] overflow-hidden flex flex-col">
                  {/* Modal Header - Jos Jis Gradient */}
                  <div className="p-5 text-white flex justify-between items-center" style={{ background: `linear-gradient(to right, ${themeColor}, #60a5fa)` }}>
                        <div>
                            <h3 className="font-bold text-xl flex items-center"><Map className="mr-2" size={24}/> Mapping Jadwal & Akses</h3>
                            <p className="text-white/80 text-sm">{editingExam?.title}</p>
                        </div>
                        <button onClick={() => setIsEditModalOpen(false)} className="bg-white/20 hover:bg-white/30 p-2 rounded-full transition"><X size={20}/></button>
                  </div>

                  <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
                      {/* Token & Schedule Section */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                           {/* Left Column: Token */}
                           <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Token Ujian</label>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16}/>
                                        <input 
                                            className="border-2 border-gray-300 rounded-lg py-2 pl-9 pr-2 w-full font-mono uppercase font-bold text-lg tracking-wider focus:border-blue-500 focus:outline-none transition text-center" 
                                            value={editToken} 
                                            onChange={e => setEditToken(e.target.value.toUpperCase())}
                                        />
                                    </div>
                                    <button onClick={() => setEditToken(Math.random().toString(36).substring(2,8).toUpperCase())} className="bg-white border-2 border-gray-300 hover:border-blue-400 hover:text-blue-600 px-3 rounded-lg transition"><Shuffle size={20}/></button>
                                </div>
                           </div>

                           {/* Right Column: Date & Session */}
                           <div className="space-y-3">
                                <div className="flex gap-3">
                                     <div className="flex-1">
                                         <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Tanggal</label>
                                         <input type="date" className="border rounded-lg p-2 w-full text-sm font-medium" value={editDate} onChange={e => setEditDate(e.target.value)}/>
                                     </div>
                                     <div className="w-24">
                                         <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Durasi</label>
                                         <div className="relative">
                                             <input type="number" className="border rounded-lg p-2 w-full text-sm font-medium pr-8" value={editDuration} onChange={e => setEditDuration(Number(e.target.value))}/>
                                             <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">m</span>
                                         </div>
                                     </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Sesi</label>
                                    <select className="border rounded-lg p-2 w-full text-sm font-medium bg-white" value={editSession} onChange={e => setEditSession(e.target.value)}>
                                        <option value="Sesi 1">Sesi 1 (Pagi)</option>
                                        <option value="Sesi 2">Sesi 2 (Siang)</option>
                                        <option value="Sesi 3">Sesi 3 (Sore)</option>
                                    </select>
                                </div>
                           </div>
                      </div>

                      {/* --- JOS JIS MAPPING UI --- */}
                      
                      {/* 1. Indicators Dashboard */}
                      <div className="grid grid-cols-3 gap-3 mb-4">
                          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-center">
                              <p className="text-[10px] uppercase font-bold text-blue-400">Total Akses</p>
                              <p className="text-2xl font-extrabold text-blue-600 leading-none mt-1">{editSchoolAccess.length}</p>
                          </div>
                          <div className="bg-green-50 border border-green-100 rounded-lg p-3 text-center">
                              <p className="text-[10px] uppercase font-bold text-green-400">Tersedia</p>
                              <p className="text-2xl font-extrabold text-green-600 leading-none mt-1">{availableSchools.length}</p>
                          </div>
                          <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 text-center">
                              <p className="text-[10px] uppercase font-bold text-orange-400">Sibuk/Bentrok</p>
                              <p className="text-2xl font-extrabold text-orange-600 leading-none mt-1">{busyCount}</p>
                          </div>
                      </div>

                      {/* 2. Selected Schools Area (Chips) */}
                      <div className="mb-4">
                          <div className="flex justify-between items-center mb-2">
                               <label className="text-sm font-bold text-gray-700 flex items-center">
                                   <CheckSquare size={16} className="mr-2 text-blue-600"/> Sekolah Terpilih (Akses Diberikan)
                               </label>
                               {editSchoolAccess.length > 0 && (
                                   <button onClick={() => setEditSchoolAccess([])} className="text-xs text-red-500 font-bold hover:underline">Hapus Semua</button>
                               )}
                          </div>
                          <div className="bg-white border-2 border-blue-100 rounded-xl p-3 min-h-[80px] flex flex-wrap gap-2 content-start shadow-inner">
                               {editSchoolAccess.length === 0 && (
                                   <p className="text-sm text-gray-400 italic w-full text-center py-4">Belum ada sekolah yang dipilih.</p>
                               )}
                               {editSchoolAccess.map(s => (
                                   <div key={s} className="group bg-blue-600 text-white pl-3 pr-1 py-1 rounded-full text-xs font-bold flex items-center shadow-sm animate-in zoom-in duration-200">
                                       <span>{s}</span>
                                       <button onClick={() => toggleSchoolAccess(s)} className="ml-2 p-1 hover:bg-white/20 rounded-full transition">
                                           <X size={12}/>
                                       </button>
                                   </div>
                               ))}
                          </div>
                      </div>

                      {/* 3. Available Schools Area (List) */}
                      <div>
                           <div className="flex justify-between items-center mb-2">
                               <label className="text-sm font-bold text-gray-700 flex items-center">
                                   <Plus size={16} className="mr-2 text-green-600"/> Tambah Akses (Tersedia Sesi Ini)
                               </label>
                               {availableSchools.length > 0 && (
                                   <button onClick={() => addAllAvailableSchools(availableSchools)} className="text-xs text-blue-600 font-bold hover:underline">Pilih Semua ({availableSchools.length})</button>
                               )}
                           </div>
                           
                           {/* Filter Search */}
                           <div className="relative mb-2">
                               <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                               <input 
                                   className="w-full border rounded-lg py-2 pl-9 pr-3 text-xs bg-gray-50 focus:bg-white transition outline-none focus:ring-1 focus:ring-blue-400"
                                   placeholder="Cari nama sekolah..."
                                   value={mappingSearch}
                                   onChange={e => setMappingSearch(e.target.value)}
                               />
                           </div>

                           <div className="border rounded-xl bg-gray-50 overflow-hidden max-h-48 overflow-y-auto custom-scrollbar">
                               {availableSchools.length === 0 ? (
                                   <div className="p-6 text-center text-gray-400 text-xs">
                                       <Info size={24} className="mx-auto mb-2 opacity-50"/>
                                       <p>Tidak ada sekolah tersedia untuk ditambahkan.</p>
                                       {busyCount > 0 && <p className="mt-1 text-orange-400">({busyCount} sekolah sedang ujian mapel lain)</p>}
                                   </div>
                               ) : (
                                   availableSchools.map(s => (
                                       <div 
                                            key={s} 
                                            onClick={() => toggleSchoolAccess(s)}
                                            className="flex items-center justify-between p-3 border-b last:border-0 hover:bg-blue-50 cursor-pointer transition group bg-white"
                                       >
                                           <div className="flex items-center space-x-3">
                                               <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold text-xs group-hover:bg-blue-200 group-hover:text-blue-700 transition">
                                                   <School size={14}/>
                                               </div>
                                               <span className="text-sm font-medium text-gray-700 group-hover:text-blue-800">{s}</span>
                                           </div>
                                           <div className="w-5 h-5 rounded border border-gray-300 flex items-center justify-center group-hover:border-blue-500">
                                               <Plus size={12} className="text-white group-hover:text-blue-600"/>
                                           </div>
                                       </div>
                                   ))
                               )}
                           </div>

                           {/* Busy Warning Footer */}
                           {busyCount > 0 && (
                               <div className="mt-2 bg-orange-50 border border-orange-100 rounded-lg p-2 flex items-center gap-2 text-xs text-orange-700">
                                   <AlertTriangle size={14} className="flex-shrink-0"/>
                                   <span><strong>{busyCount} Sekolah</strong> disembunyikan karena sudah ada jadwal ujian lain di sesi ini.</span>
                               </div>
                           )}
                      </div>
                  </div>

                  {/* Footer Actions */}
                  <div className="p-4 bg-gray-50 border-t flex gap-3">
                      <button onClick={() => setIsEditModalOpen(false)} className="flex-1 py-3 text-gray-500 font-bold text-sm hover:bg-gray-200 rounded-xl transition">Batal</button>
                      <button onClick={handleSaveMapping} className="flex-[2] py-3 bg-blue-600 text-white font-bold text-sm rounded-xl hover:bg-blue-700 shadow-lg hover:shadow-xl transition transform active:scale-95 flex items-center justify-center">
                          <Save size={18} className="mr-2"/> Simpan Perubahan
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* CREATE EXAM MODAL */}
      {isCreateExamModalOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="font-bold text-lg">Tambah Mata Pelajaran Baru</h3>
                      <button onClick={() => setIsCreateExamModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X/></button>
                  </div>
                  <div className="space-y-4">
                      <div>
                          <label className="block text-sm font-bold text-gray-700 mb-1">Nama Mata Pelajaran</label>
                          <input 
                              autoFocus
                              className="w-full border rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" 
                              placeholder="Contoh: Matematika, Bahasa Indonesia" 
                              value={newExamTitle} 
                              onChange={e => setNewExamTitle(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && handleCreateExam()}
                          />
                      </div>
                      <div className="flex gap-3 pt-2">
                          <button onClick={() => setIsCreateExamModalOpen(false)} className="flex-1 py-2.5 border border-gray-300 text-gray-600 rounded-lg font-bold text-sm hover:bg-gray-50 transition">Batal</button>
                          <button 
                              onClick={handleCreateExam} 
                              disabled={isLoadingData || !newExamTitle.trim()}
                              className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700 shadow-md transition disabled:opacity-50"
                          >
                              {isLoadingData ? <Loader2 size={18} className="animate-spin mx-auto"/> : 'Simpan'}
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* ADD MANUAL QUESTION MODAL */}
      {isAddQuestionModalOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl p-6 h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95">
                  <div className="flex justify-between items-center mb-4 flex-shrink-0">
                      <h3 className="font-bold text-lg">{editingQuestionId ? 'Edit Soal' : 'Tambah Soal Manual'}</h3>
                      <button onClick={() => {
                          setIsAddQuestionModalOpen(false);
                          setEditingQuestionId(null);
                          setNqText('');
                          setNqImg('');
                          setNqOptions(['', '', '', '']);
                          setNqCorrectIndex(0);
                          setNqCorrectIndices([]);
                          setNqMatchingPairs([{left: '', right: ''}]);
                          setNqPoints(10);
                      }} className="text-gray-400 hover:text-gray-600 transition"><X/></button>
                  </div>
                  
                  <div className="flex-1 overflow-hidden flex gap-6">
                      {/* Left: Editor Form */}
                      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                              <div>
                                  <label className="block text-xs font-bold text-gray-500 mb-1">Tipe Soal</label>
                                  <select className="border rounded p-2 w-full text-sm" value={nqType} onChange={e => setNqType(e.target.value as QuestionType)}>
                                      <option value="PG">Pilihan Ganda</option>
                                      <option value="PG_KOMPLEKS">Pilihan Ganda Kompleks</option>
                                      <option value="MATCHING">Menjodohkan</option>
                                      <option value="TRUE_FALSE">Benar / Salah</option>
                                      <option value="URAIAN">Uraian</option>
                                  </select>
                              </div>
                              <div>
                                  <label className="block text-xs font-bold text-gray-500 mb-1">Bobot Nilai</label>
                                  <input type="number" className="border rounded p-2 w-full text-sm" value={nqPoints} onChange={e => setNqPoints(Number(e.target.value))} />
                              </div>
                          </div>

                          <div>
                              <label className="block text-xs font-bold text-gray-500 mb-1">Teks Soal</label>
                              <style>{`
                                  .ql-tooltip { z-index: 9999 !important; }
                                  .ql-container.ql-snow { border-bottom-left-radius: 0.5rem; border-bottom-right-radius: 0.5rem; }
                                  .ql-toolbar.ql-snow { border-top-left-radius: 0.5rem; border-top-right-radius: 0.5rem; border-bottom: 0; }
                              `}</style>
                              <ReactQuill 
                                  ref={quillRef}
                                  theme="snow" 
                                  value={nqText} 
                                  onChange={setNqText} 
                                  modules={quillModules}
                                  className="bg-white h-48 mb-12" 
                              />
                          </div>

                          <div>
                              <label className="block text-xs font-bold text-gray-500 mb-1">Google Drive Image ID (Opsional)</label>
                              <div className="flex gap-2">
                                  <div className="bg-gray-100 border rounded-l p-2 text-xs text-gray-500 flex items-center">https://lh3.googleusercontent.com/d/</div>
                                  <input 
                                      className="border rounded-r p-2 flex-1 text-sm focus:ring-2 outline-none" 
                                      placeholder="Masukkan ID File saja (Contoh: 1UXDrh...)" 
                                      value={nqImg} 
                                      onChange={e => setNqImg(e.target.value)}
                                  />
                              </div>
                          </div>

                          {nqType === 'PG' && (
                              <div className="space-y-2">
                                  <label className="block text-xs font-bold text-gray-500 mb-1">Opsi Jawaban & Kunci</label>
                                  {nqOptions.map((opt, i) => (
                                      <div key={i} className="flex items-center gap-2">
                                          <span className="font-bold w-6 text-sm">{String.fromCharCode(65+i)}.</span>
                                          <input className="border rounded p-2 flex-1 text-sm" value={opt} onChange={e => {const n = [...nqOptions]; n[i] = e.target.value; setNqOptions(n);}} placeholder={`Opsi ${String.fromCharCode(65+i)}`}/>
                                          <input type="radio" name="correct" checked={nqCorrectIndex === i} onChange={() => setNqCorrectIndex(i)} className="w-4 h-4 text-blue-600"/>
                                      </div>
                                  ))}
                              </div>
                          )}

                          {nqType === 'PG_KOMPLEKS' && (
                              <div className="space-y-2">
                                  <label className="block text-xs font-bold text-gray-500 mb-1">Opsi Jawaban & Kunci (Bisa lebih dari satu)</label>
                                  {nqOptions.map((opt, i) => (
                                      <div key={i} className="flex items-center gap-2">
                                          <span className="font-bold w-6 text-sm">{String.fromCharCode(65+i)}.</span>
                                          <input className="border rounded p-2 flex-1 text-sm" value={opt} onChange={e => {const n = [...nqOptions]; n[i] = e.target.value; setNqOptions(n);}} placeholder={`Opsi ${String.fromCharCode(65+i)}`}/>
                                          <input 
                                              type="checkbox" 
                                              checked={nqCorrectIndices.includes(i)} 
                                              onChange={(e) => {
                                                  if (e.target.checked) setNqCorrectIndices([...nqCorrectIndices, i]);
                                                  else setNqCorrectIndices(nqCorrectIndices.filter(idx => idx !== i));
                                              }} 
                                              className="w-4 h-4 text-blue-600"
                                          />
                                      </div>
                                  ))}
                              </div>
                          )}

                          {nqType === 'TRUE_FALSE' && (
                              <div className="space-y-2">
                                  <label className="block text-xs font-bold text-gray-500 mb-1">Pilih Jawaban Benar</label>
                                  <div className="flex gap-4">
                                      <label className="flex items-center gap-2 cursor-pointer bg-gray-50 p-3 rounded-lg border flex-1">
                                          <input type="radio" name="tf" checked={nqCorrectIndex === 0} onChange={() => setNqCorrectIndex(0)} />
                                          <span className="font-bold">BENAR</span>
                                      </label>
                                      <label className="flex items-center gap-2 cursor-pointer bg-gray-50 p-3 rounded-lg border flex-1">
                                          <input type="radio" name="tf" checked={nqCorrectIndex === 1} onChange={() => setNqCorrectIndex(1)} />
                                          <span className="font-bold">SALAH</span>
                                      </label>
                                  </div>
                              </div>
                          )}

                          {nqType === 'MATCHING' && (
                              <div className="space-y-2">
                                  <div className="flex justify-between items-center">
                                      <label className="block text-xs font-bold text-gray-500">Pasangan Menjodohkan</label>
                                      <button onClick={() => setNqMatchingPairs([...nqMatchingPairs, {left: '', right: ''}])} className="text-blue-600 text-xs font-bold flex items-center hover:underline"><Plus size={12} className="mr-1"/> Tambah Baris</button>
                                  </div>
                                  {nqMatchingPairs.map((pair, i) => (
                                      <div key={i} className="flex items-center gap-2">
                                          <input className="border rounded p-2 flex-1 text-sm" value={pair.left} onChange={e => {const n = [...nqMatchingPairs]; n[i].left = e.target.value; setNqMatchingPairs(n);}} placeholder="Kiri (Soal)"/>
                                          <span className="text-gray-400">↔</span>
                                          <input className="border rounded p-2 flex-1 text-sm" value={pair.right} onChange={e => {const n = [...nqMatchingPairs]; n[i].right = e.target.value; setNqMatchingPairs(n);}} placeholder="Kanan (Jawaban)"/>
                                          <button onClick={() => setNqMatchingPairs(nqMatchingPairs.filter((_, idx) => idx !== i))} className="text-red-500 p-1 hover:bg-red-50 rounded"><Trash size={14}/></button>
                                      </div>
                                  ))}
                              </div>
                          )}
                      </div>

                      {/* Right: Live Preview & Existing Questions */}
                      <div className="w-1/3 border-l pl-6 overflow-y-auto custom-scrollbar bg-gray-50/50 rounded-r-xl p-4">
                          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 flex items-center">
                              <Eye size={14} className="mr-2 text-blue-600"/> Live Preview
                          </h4>
                          <div className="bg-white p-4 rounded-xl border shadow-sm mb-8">
                              {nqImg && (
                                  <img src={processImageUrl(nqImg)} alt="Preview" className="max-w-full h-auto rounded-lg mb-4 mx-auto border" />
                              )}
                              <div className="text-sm ql-editor !p-0 mb-4 prose prose-sm max-w-none overflow-x-auto" dangerouslySetInnerHTML={{ __html: nqText || '<p className="text-gray-300 italic">Teks soal akan muncul di sini...</p>' }}></div>
                              
                              <div className="space-y-2">
                                  {(nqType === 'PG' || nqType === 'PG_KOMPLEKS' || nqType === 'TRUE_FALSE') && (
                                      (nqType === 'TRUE_FALSE' ? ['Benar', 'Salah'] : nqOptions).map((opt, i) => {
                                          const isCorrect = nqType === 'PG_KOMPLEKS' ? nqCorrectIndices.includes(i) : nqCorrectIndex === i;
                                          return (
                                              <div key={i} className={`p-2 rounded-lg border text-[11px] flex items-center gap-2 transition ${isCorrect ? 'bg-green-50 border-green-200' : 'bg-white border-gray-100'}`}>
                                                  <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold border ${isCorrect ? 'bg-green-500 text-white border-green-600' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                                                      {nqType === 'TRUE_FALSE' ? (i === 0 ? 'B' : 'S') : String.fromCharCode(65+i)}
                                                  </span>
                                                  <span className={`truncate ${isCorrect ? 'text-green-700 font-bold' : 'text-gray-600'}`}>{opt || `Opsi ${String.fromCharCode(65+i)}`}</span>
                                                  {isCorrect && <Check size={12} className="ml-auto text-green-600"/>}
                                              </div>
                                          );
                                      })
                                  )}
                                  {nqType === 'MATCHING' && nqMatchingPairs.map((pair, i) => (
                                      <div key={i} className="flex items-center gap-2 bg-blue-50 p-2 rounded-lg border border-blue-100 text-[10px]">
                                          <span className="font-bold text-blue-800 truncate flex-1">{pair.left || '?'}</span>
                                          <span className="text-blue-300">↔</span>
                                          <span className="text-blue-600 truncate flex-1">{pair.right || '?'}</span>
                                      </div>
                                  ))}
                                  {nqType === 'URAIAN' && (
                                      <div className="h-20 bg-gray-50 border border-dashed border-gray-200 rounded-lg flex items-center justify-center text-gray-400 text-[10px] italic">
                                          Area Jawaban Peserta
                                      </div>
                                  )}
                              </div>
                          </div>

                          {targetExamForAdd && targetExamForAdd.questions.length > 0 && (
                              <div>
                                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 flex items-center">
                                      <Database size={14} className="mr-2 text-orange-600"/> Soal Terdaftar ({targetExamForAdd.questions.length})
                                  </h4>
                                  <div className="space-y-2">
                                      {targetExamForAdd.questions.map((q, i) => (
                                          <div key={q.id} className={`p-2 bg-white border rounded-lg text-[10px] flex gap-2 items-center hover:bg-blue-50 transition cursor-default ${editingQuestionId === q.id ? 'ring-2 ring-blue-500 border-blue-500' : ''}`}>
                                              <span className="bg-gray-100 w-5 h-5 flex items-center justify-center rounded-full font-bold flex-shrink-0">{i+1}</span>
                                              <div className="truncate flex-1 text-gray-600" dangerouslySetInnerHTML={{ __html: q.text.replace(/<[^>]*>/g, '').substring(0, 60) + '...' }}></div>
                                              <span className="text-[9px] font-bold px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded uppercase">{q.type}</span>
                                          </div>
                                      ))}
                                  </div>
                              </div>
                          )}
                      </div>
                  </div>

                  <div className="pt-4 border-t mt-4 flex justify-end gap-3 flex-shrink-0">
                      <button onClick={() => {
                          setIsAddQuestionModalOpen(false);
                          setEditingQuestionId(null);
                          setNqText('');
                          setNqImg('');
                          setNqOptions(['', '', '', '']);
                          setNqCorrectIndex(0);
                          setNqCorrectIndices([]);
                          setNqMatchingPairs([{left: '', right: ''}]);
                          setNqPoints(10);
                      }} className="px-6 py-2 border rounded-xl font-bold text-sm text-gray-600 hover:bg-gray-50 transition">Batal</button>
                      <button onClick={handleSaveQuestion} className="px-10 py-2 bg-green-600 text-white rounded-xl font-bold text-sm shadow-lg hover:bg-green-700 transition transform active:scale-95 flex items-center">
                          <Save size={16} className="mr-2"/> Simpan Soal
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* PREVIEW MODAL */}
      {isPreviewOpen && previewQuestion && (
          <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-300">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in zoom-in-95">
                  <div className="bg-gray-50 px-6 py-4 border-b flex justify-between items-center">
                      <h3 className="font-bold text-gray-700 flex items-center"><Search size={18} className="mr-2 text-blue-600"/> Preview Tampilan Peserta</h3>
                      <button onClick={() => setIsPreviewOpen(false)} className="text-gray-400 hover:text-gray-600"><X/></button>
                  </div>
                  <div className="p-8 max-h-[75vh] overflow-y-auto custom-scrollbar">
                      <div className="grid grid-cols-1 md:grid-cols-[60%_40%] gap-12">
                          <div className="min-w-0">
                              {previewQuestion.imgUrl && (
                                  <img src={previewQuestion.imgUrl} alt="Preview" className="max-w-full h-auto rounded-lg mb-6 mx-auto" />
                              )}
                              <div className="overflow-hidden bg-white">
                                  <ReactQuill 
                                      theme="snow" 
                                      value={previewQuestion.text} 
                                      readOnly={true} 
                                      modules={{ toolbar: false }}
                                      className="read-only-quill"
                                  />
                              </div>
                              <style>{`
                                  .read-only-quill .ql-container.ql-snow, .read-only-quill-preview .ql-container.ql-snow, .read-only-quill-preview-list .ql-container.ql-snow { border: 0 !important; }
                                  .read-only-quill .ql-editor { min-height: 200px; font-size: 16px; line-height: 1.6; color: #1f2937; }
                                  .read-only-quill-preview .ql-editor { font-size: 18px; line-height: 1.6; color: #1f2937; padding: 0 !important; }
                                  .read-only-quill-preview-list .ql-editor { font-size: 14px; line-height: 1.5; color: #374151; padding: 0 !important; }
                              `}</style>
                          </div>
                          <div className="min-w-0 border-l border-gray-100 pl-8 md:pl-12">
                              <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-6 flex items-center">
                                  <span className="w-1 h-4 bg-blue-600 mr-2 rounded-full inline-block"></span>
                                  Opsi Jawaban
                              </p>
                              <div className="space-y-3">
                                  {previewQuestion.type === 'PG' && previewQuestion.options.map((opt, i) => (
                                      <div key={i} className={`p-3 rounded-xl border flex items-center gap-3 ${previewQuestion.correctIndex === i ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-100'}`}>
                                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${previewQuestion.correctIndex === i ? 'bg-green-500 text-white' : 'bg-white text-gray-400 border'}`}>
                                              {String.fromCharCode(65+i)}
                                          </div>
                                          <span className="text-sm text-gray-700">{opt}</span>
                                          {previewQuestion.correctIndex === i && <CheckCircle size={16} className="ml-auto text-green-600"/>}
                                      </div>
                                  ))}
                                  {previewQuestion.type === 'PG_KOMPLEKS' && previewQuestion.options.map((opt, i) => (
                                      <div key={i} className={`p-3 rounded-xl border flex items-center gap-3 ${previewQuestion.correctIndices?.includes(i) ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-100'}`}>
                                          <div className={`w-6 h-6 rounded flex items-center justify-center font-bold text-sm ${previewQuestion.correctIndices?.includes(i) ? 'bg-blue-500 text-white' : 'bg-white text-gray-400 border'}`}>
                                              <Check size={14}/>
                                          </div>
                                          <span className="text-sm text-gray-700">{opt}</span>
                                          {previewQuestion.correctIndices?.includes(i) && <span className="ml-auto text-[10px] font-bold text-blue-600">KUNCI</span>}
                                      </div>
                                  ))}
                                  {previewQuestion.type === 'TRUE_FALSE' && ['Benar', 'Salah'].map((opt, i) => (
                                      <div key={i} className={`p-3 rounded-xl border flex items-center gap-3 ${previewQuestion.correctIndex === i ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-100'}`}>
                                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${previewQuestion.correctIndex === i ? 'bg-green-500 text-white' : 'bg-white text-gray-400 border'}`}>
                                              {i === 0 ? 'B' : 'S'}
                                          </div>
                                          <span className="text-sm font-bold text-gray-700 uppercase">{opt}</span>
                                          {previewQuestion.correctIndex === i && <CheckCircle size={16} className="ml-auto text-green-600"/>}
                                      </div>
                                  ))}
                                  {previewQuestion.type === 'MATCHING' && previewQuestion.options.map((opt, i) => {
                                      const [left, right] = opt.split('|');
                                      return (
                                          <div key={i} className="flex items-center gap-2 bg-gray-50 p-3 rounded-xl border border-gray-100">
                                              <div className="flex-1 text-xs font-bold text-gray-700">{left}</div>
                                              <div className="text-blue-400">→</div>
                                              <div className="flex-1 text-xs text-blue-700 font-medium bg-blue-50 p-2 rounded-lg border border-blue-100">{right}</div>
                                          </div>
                                      );
                                  })}
                                  {previewQuestion.type === 'URAIAN' && (
                                      <div className="h-32 bg-gray-50 border border-dashed border-gray-300 rounded-xl flex items-center justify-center text-gray-400 text-sm italic">
                                          Area Jawaban Peserta (Teks Bebas)
                                      </div>
                                  )}
                              </div>
                          </div>
                      </div>
                  </div>
                  <div className="p-6 bg-gray-50 border-t flex justify-end">
                      <button onClick={() => setIsPreviewOpen(false)} className="bg-blue-600 text-white px-8 py-2.5 rounded-xl font-bold hover:bg-blue-700 transition shadow-lg">Tutup Preview</button>
                  </div>
              </div>
          </div>
      )}

      {/* FULL EXAM PREVIEW MODAL */}
      {isFullExamPreviewOpen && viewingQuestionsExam && (() => {
          const pgCount = viewingQuestionsExam.questions.filter(q => q.type === 'PG').length;
          const pgkCount = viewingQuestionsExam.questions.filter(q => q.type === 'PG_KOMPLEKS').length;
          const bsCount = viewingQuestionsExam.questions.filter(q => q.type === 'TRUE_FALSE').length;
          const matchingCount = viewingQuestionsExam.questions.filter(q => q.type === 'MATCHING').length;
          const uraianCount = viewingQuestionsExam.questions.filter(q => q.type === 'URAIAN').length;
          const totalScore = viewingQuestionsExam.questions.reduce((sum, q) => sum + (q.points || 0), 0);

          return (
          <div className="fixed inset-0 bg-black/90 z-[110] flex flex-col p-4 backdrop-blur-md animate-in fade-in duration-300 print:bg-white print:p-0 print:static print:block">
              <div className="flex justify-between items-center mb-4 px-4 print:hidden">
                  <h3 className="text-white font-bold text-xl flex items-center"><Eye size={24} className="mr-2 text-blue-400"/> Preview Seluruh Soal: {viewingQuestionsExam.title}</h3>
                  <div className="flex gap-3">
                      <button 
                        onClick={() => {
                            const printWindow = window.open('', '_blank');
                            if (!printWindow) return;
                            
                            const pgCount = viewingQuestionsExam.questions.filter(q => q.type === 'PG').length;
                            const pgkCount = viewingQuestionsExam.questions.filter(q => q.type === 'PG_KOMPLEKS').length;
                            const bsCount = viewingQuestionsExam.questions.filter(q => q.type === 'TRUE_FALSE').length;
                            const matchingCount = viewingQuestionsExam.questions.filter(q => q.type === 'MATCHING').length;
                            const uraianCount = viewingQuestionsExam.questions.filter(q => q.type === 'URAIAN').length;
                            const totalScore = viewingQuestionsExam.questions.reduce((sum, q) => sum + (q.points || 0), 0);

                            let content = `
                                <html>
                                <head>
                                    <title>Cetak Soal - ${viewingQuestionsExam.title}</title>
                                    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/quill@2.0.2/dist/quill.snow.css">
                                    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
                                    <script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
                                    <script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"></script>
                                    <style>
                                        @page { size: A4; margin: 1cm; }
                                        body { font-family: sans-serif; color: #1f2937; line-height: 1.6; margin: 0; padding: 20px; }
                                        .header { border-bottom: 2px solid #2563eb; padding-bottom: 15px; margin-bottom: 20px; }
                                        .header-content { display: flex; justify-content: space-between; align-items: flex-start; }
                                        .header h1 { margin: 0; font-size: 24px; font-weight: 900; color: #111827; }
                                        .header p { margin: 5px 0 0; color: #6b7280; font-weight: bold; text-transform: uppercase; font-size: 12px; letter-spacing: 1px; }
                                        .score-box { background: #2563eb; color: white; padding: 8px 16px; border-radius: 8px; font-weight: bold; font-size: 16px; text-align: center; }
                                        .recap { margin-top: 8px; display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap; }
                                        .recap span { font-size: 10px; font-weight: bold; padding: 3px 6px; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 4px; }
                                        .question { margin-bottom: 30px; display: block; position: relative; }
                                        .question { page-break-inside: avoid; }
                                        .q-meta { display: flex; align-items: center; gap: 10px; margin-bottom: 15px; }
                                        .q-num { width: 32px; height: 32px; background: #2563eb; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; }
                                        .q-badge { font-size: 10px; font-weight: bold; padding: 2px 8px; border-radius: 999px; text-transform: uppercase; }
                                        .q-type { background: #dbeafe; color: #1e40af; }
                                        .q-points { background: #ffedd5; color: #9a3412; }
                                        .q-image { max-width: 100%; height: auto; border-radius: 8px; margin-bottom: 15px; border: 1px solid #f3f4f6; }
                                        .q-text { font-size: 16px; margin-bottom: 20px; }
                                        .options-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
                                        .opt { padding: 12px; border-radius: 8px; border: 1px solid #f3f4f6; display: flex; align-items: center; gap: 12px; font-size: 14px; background: #f9fafb; }
                                        .opt-correct { background: #f0fdf4; border-color: #bbf7d0; color: #166534; font-weight: bold; }
                                        .opt-circle { width: 24px; height: 24px; border-radius: 50%; border: 1px solid #e5e7eb; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px; background: white; color: #9ca3af; }
                                        .opt-correct .opt-circle { background: #22c55e; color: white; border-color: #16a34a; }
                                        .matching-item { display: flex; align-items: center; gap: 12px; background: #eff6ff; padding: 12px; border-radius: 8px; border: 1px solid #dbeafe; margin-bottom: 8px; }
                                        .matching-left { flex: 1; font-weight: bold; color: #1e3a8a; }
                                        .matching-right { flex: 1; background: white; padding: 8px; border-radius: 6px; border: 1px solid #bfdbfe; color: #1d4ed8; }
                                        .uraian-box { height: 100px; border: 2px dashed #e5e7eb; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #9ca3af; font-style: italic; font-size: 14px; }
                                        .ql-editor { padding: 0 !important; }
                                        .ql-container.ql-snow { border: none !important; }
                                    </style>
                                </head>
                                <body>
                                    <div class="header">
                                        <div class="header-content">
                                            <div>
                                                <h1>${viewingQuestionsExam.title}</h1>
                                                <p>Bank Soal & Materi Ujian</p>
                                            </div>
                                            <div style="text-align: right;">
                                                <div class="score-box">Total Skor: ${totalScore}</div>
                                                <div class="recap">
                                                    ${pgCount > 0 ? `<span>PG: ${pgCount}</span>` : ''}
                                                    ${pgkCount > 0 ? `<span>PGK: ${pgkCount}</span>` : ''}
                                                    ${bsCount > 0 ? `<span>B/S: ${bsCount}</span>` : ''}
                                                    ${matchingCount > 0 ? `<span>Jodoh: ${matchingCount}</span>` : ''}
                                                    ${uraianCount > 0 ? `<span>Uraian: ${uraianCount}</span>` : ''}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                            `;

                            viewingQuestionsExam.questions.forEach((q, i) => {
                                content += `
                                    <div class="question">
                                        <div class="q-meta">
                                            <div class="q-num">${i+1}</div>
                                            <span class="q-badge q-type">${q.type}</span>
                                            <span class="q-badge q-points">Bobot: ${q.points}</span>
                                        </div>
                                        ${q.imgUrl ? `<img src="${q.imgUrl}" class="q-image">` : ''}
                                        <div class="q-text ql-snow"><div class="ql-editor">${q.text}</div></div>
                                        <div class="options-grid">
                                `;

                                if (q.type === 'PG' || q.type === 'PG_KOMPLEKS' || q.type === 'TRUE_FALSE') {
                                    const opts = q.type === 'TRUE_FALSE' ? ['Benar', 'Salah'] : q.options;
                                    opts.forEach((opt, idx) => {
                                        const isCorrect = q.type === 'PG_KOMPLEKS' ? q.correctIndices?.includes(idx) : q.correctIndex === idx;
                                        content += `
                                            <div class="opt ${isCorrect ? 'opt-correct' : ''}">
                                                <div class="opt-circle">${String.fromCharCode(65+idx)}</div>
                                                <span>${opt}</span>
                                            </div>
                                        `;
                                    });
                                } else if (q.type === 'MATCHING') {
                                    q.options.forEach((opt) => {
                                        const [l, r] = opt.split('|');
                                        content += `
                                            <div class="matching-item" style="grid-column: span 2;">
                                                <div class="matching-left">${l}</div>
                                                <div style="color: #60a5fa;">↔</div>
                                                <div class="matching-right">${r}</div>
                                            </div>
                                        `;
                                    });
                                } else if (q.type === 'URAIAN') {
                                    content += `<div class="uraian-box" style="grid-column: span 2;">Area Jawaban Peserta (Teks Bebas)</div>`;
                                }

                                content += `</div></div>`;
                            });

                            content += `
                                    <script>
                                        window.onload = () => {
                                            if (window.renderMathInElement) {
                                                renderMathInElement(document.body, {
                                                    delimiters: [
                                                        {left: '$$', right: '$$', display: true},
                                                        {left: '$', right: '$', display: false},
                                                        {left: '\\(', right: '\\)', display: false},
                                                        {left: '\\[', right: '\\]', display: true}
                                                    ],
                                                    throwOnError: false
                                                });
                                            }
                                            setTimeout(() => {
                                                window.print();
                                                // window.close();
                                            }, 800);
                                        };
                                    </script>
                                </body>
                                </html>
                            `;
                            
                            printWindow.document.write(content);
                            printWindow.document.close();
                        }} 
                        className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl font-bold transition flex items-center gap-2"
                      >
                        <Printer size={18}/> Cetak / Simpan PDF
                      </button>
                      <button onClick={() => setIsFullExamPreviewOpen(false)} className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-full transition"><X size={24}/></button>
                  </div>
              </div>
              <div className="flex-1 bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col print:shadow-none print:rounded-none print:block print:overflow-visible">
                  <div className="flex-1 overflow-y-auto p-8 custom-scrollbar print:overflow-visible print:p-0">
                      <div className="max-w-4xl mx-auto space-y-12">
                          {/* PRINT HEADER */}
                          <div className="border-b-2 border-blue-600 pb-6 mb-8">
                              <div className="flex justify-between items-start">
                                  <div>
                                      <h2 className="text-3xl font-black text-gray-900 mb-2">{viewingQuestionsExam.title}</h2>
                                      <p className="text-gray-500 font-bold uppercase tracking-widest text-sm">Bank Soal & Materi Ujian</p>
                                  </div>
                                  <div className="text-right">
                                      <div className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-lg shadow-md mb-2">
                                          Total Skor: {totalScore}
                                      </div>
                                      <div className="flex flex-wrap justify-end gap-2">
                                          {pgCount > 0 && <span className="text-[10px] font-bold px-2 py-1 bg-gray-100 rounded border">PG: {pgCount}</span>}
                                          {pgkCount > 0 && <span className="text-[10px] font-bold px-2 py-1 bg-gray-100 rounded border">PGK: {pgkCount}</span>}
                                          {bsCount > 0 && <span className="text-[10px] font-bold px-2 py-1 bg-gray-100 rounded border">B/S: {bsCount}</span>}
                                          {matchingCount > 0 && <span className="text-[10px] font-bold px-2 py-1 bg-gray-100 rounded border">Jodoh: {matchingCount}</span>}
                                          {uraianCount > 0 && <span className="text-[10px] font-bold px-2 py-1 bg-gray-100 rounded border">Uraian: {uraianCount}</span>}
                                      </div>
                                  </div>
                              </div>
                          </div>

                          {viewingQuestionsExam.questions.map((q, i) => (
                              <div key={q.id} className="border-b pb-12 last:border-0 break-inside-avoid">
                                  <div className="flex items-center gap-3 mb-6">
                                      <span className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg shadow-md print:shadow-none">{i+1}</span>
                                      <div className="flex gap-2">
                                          <span className="text-xs font-bold px-3 py-1 bg-blue-100 text-blue-700 rounded-full uppercase tracking-wider">{q.type}</span>
                                          <span className="text-xs font-bold px-3 py-1 bg-orange-100 text-orange-700 rounded-full uppercase tracking-wider">Bobot: {q.points}</span>
                                      </div>
                                  </div>
                                  
                                  {q.imgUrl && (
                                      <img src={q.imgUrl} alt={`Soal ${i+1}`} className="max-w-full h-auto rounded-xl mb-6 shadow-sm border border-gray-100 print:shadow-none" />
                                  )}
                                  
                                  <div className="mb-8 overflow-hidden bg-white">
                                      <ReactQuill 
                                          theme="snow" 
                                          value={q.text} 
                                          readOnly={true} 
                                          modules={{ toolbar: false }}
                                          className="read-only-quill-preview"
                                      />
                                  </div>
                                  
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      {(q.type === 'PG' || q.type === 'PG_KOMPLEKS' || q.type === 'TRUE_FALSE') && (
                                          (q.type === 'TRUE_FALSE' ? ['Benar', 'Salah'] : q.options).map((opt, idx) => {
                                              const isCorrect = q.type === 'PG_KOMPLEKS' ? q.correctIndices?.includes(idx) : q.correctIndex === idx;
                                              return (
                                                  <div key={idx} className={`p-4 rounded-xl border flex items-center gap-4 transition ${isCorrect ? 'bg-green-50 border-green-200 ring-1 ring-green-200' : 'bg-gray-50 border-gray-100'}`}>
                                                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${isCorrect ? 'bg-green-500 text-white shadow-sm print:shadow-none' : 'bg-white text-gray-400 border border-gray-200'}`}>
                                                          {String.fromCharCode(65+idx)}
                                                      </div>
                                                      <span className={`text-sm ${isCorrect ? 'text-green-800 font-bold' : 'text-gray-600'}`}>{opt}</span>
                                                      {isCorrect && <CheckCircle size={20} className="ml-auto text-green-600"/>}
                                                  </div>
                                              );
                                          })
                                      )}
                                      {q.type === 'MATCHING' && q.options.map((opt, idx) => {
                                          const [l, r] = opt.split('|');
                                          return (
                                              <div key={idx} className="flex items-center gap-3 bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                                                  <div className="flex-1 text-sm font-bold text-blue-900">{l}</div>
                                                  <div className="text-blue-400 font-bold">↔</div>
                                                  <div className="flex-1 text-sm text-blue-700 font-medium bg-white p-3 rounded-lg border border-blue-200 shadow-sm print:shadow-none">{r}</div>
                                              </div>
                                          );
                                      })}
                                      {q.type === 'URAIAN' && (
                                          <div className="col-span-full h-32 bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl flex items-center justify-center text-gray-400 text-sm italic">
                                              Area Jawaban Peserta (Teks Bebas)
                                          </div>
                                      )}
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
                  <div className="p-6 bg-gray-50 border-t flex justify-center print:hidden">
                      <button onClick={() => setIsFullExamPreviewOpen(false)} className="bg-blue-600 text-white px-12 py-3 rounded-xl font-bold hover:bg-blue-700 transition shadow-xl transform active:scale-95">Selesai Meninjau</button>
                  </div>
              </div>
          </div>
          );
      })()}

      {/* SESSION TIME MODAL */}
      {isSessionModalOpen && (
          <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-300">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
                  <div className="bg-blue-600 px-6 py-4 text-white flex justify-between items-center">
                      <h3 className="font-bold text-lg flex items-center"><Clock size={20} className="mr-2"/> Pengaturan Waktu Sesi</h3>
                      <button onClick={() => setIsSessionModalOpen(false)} className="hover:bg-white/20 p-1 rounded transition"><X/></button>
                  </div>
                  <div className="p-6 space-y-4">
                      {['Sesi 1', 'Sesi 2', 'Sesi 3', 'Sesi 4'].map((session) => (
                          <div key={session}>
                              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{session}</label>
                              <input 
                                  className="w-full border rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition" 
                                  value={sessionTimes[session] || ''} 
                                  onChange={e => setSessionTimes({...sessionTimes, [session]: e.target.value})}
                                  placeholder="Contoh: 07.30 - 09.30"
                              />
                          </div>
                      ))}
                  </div>
                  <div className="p-4 bg-gray-50 border-t flex justify-end">
                      <button 
                        onClick={async () => { 
                          await db.updateSettings({ sessionTimes });
                          onSettingsChange();
                          setIsSessionModalOpen(false); 
                          showToast("Pengaturan waktu sesi disimpan."); 
                        }} 
                        className="bg-blue-600 text-white px-8 py-2.5 rounded-xl font-bold hover:bg-blue-700 transition shadow-lg"
                      >
                        Simpan
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* RECAP MODAL */}
      {isRecapModalOpen && (
          <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-300">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in zoom-in-95">
                  <div className="bg-purple-600 px-6 py-4 text-white flex justify-between items-center">
                      <h3 className="font-bold text-lg flex items-center"><BarChart3 size={20} className="mr-2"/> Rekapitulasi Peserta per Ruang & Sesi</h3>
                      <button onClick={() => setIsRecapModalOpen(false)} className="hover:bg-white/20 p-1 rounded transition"><X/></button>
                  </div>
                  <div className="p-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                      {Object.keys(getRecapData()).length === 0 ? (
                          <div className="text-center py-20 text-gray-400 italic">Belum ada data mapping untuk direkap.</div>
                      ) : (
                          <div className="space-y-8">
                              {Object.entries(getRecapData()).map(([school, rooms]) => (
                                  <div key={school} className="border rounded-xl overflow-hidden">
                                      <div className="bg-gray-50 px-4 py-2 border-b font-bold text-gray-700">{school}</div>
                                      <div className="p-4">
                                          <table className="w-full text-sm text-left">
                                              <thead className="text-xs text-gray-400 uppercase font-bold border-b">
                                                  <tr>
                                                      <th className="pb-2">Ruang</th>
                                                      <th className="pb-2">Sesi</th>
                                                      <th className="pb-2 text-right">Jumlah Peserta</th>
                                                  </tr>
                                              </thead>
                                              <tbody className="divide-y">
                                                  {Object.entries(rooms).map(([room, sessions]) => (
                                                      Object.entries(sessions).map(([session, count], idx) => (
                                                          <tr key={`${room}-${session}`}>
                                                              <td className="py-2 font-medium">{idx === 0 ? room : ''}</td>
                                                              <td className="py-2 text-gray-600">{session}</td>
                                                              <td className="py-2 text-right font-bold text-purple-600">{count} Peserta</td>
                                                          </tr>
                                                      ))
                                                  ))}
                                              </tbody>
                                              <tfoot className="border-t font-bold">
                                                  <tr>
                                                      <td colSpan={2} className="pt-2">Total Sekolah Ini</td>
                                                      <td className="pt-2 text-right text-purple-700">
                                                          {Object.values(rooms).reduce((sum, sessions) => sum + Object.values(sessions).reduce((s, c) => s + c, 0), 0)} Peserta
                                                      </td>
                                                  </tr>
                                              </tfoot>
                                          </table>
                                      </div>
                                  </div>
                              ))}
                          </div>
                      )}
                  </div>
                  <div className="p-4 bg-gray-50 border-t flex justify-end">
                      <button onClick={() => setIsRecapModalOpen(false)} className="bg-gray-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-gray-700 transition">Tutup</button>
                  </div>
              </div>
          </div>
      )}

      {/* ADD/EDIT STUDENT MODAL */}
      {isAddStudentModalOpen && (
          <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-300">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
                  <div className="bg-purple-600 px-6 py-4 text-white flex justify-between items-center">
                      <h3 className="font-bold text-lg flex items-center"><Users size={20} className="mr-2"/> {editingStudent ? 'Edit Data Peserta' : 'Tambah Peserta Baru'}</h3>
                      <button onClick={() => setIsAddStudentModalOpen(false)} className="hover:bg-white/20 p-1 rounded transition"><X/></button>
                  </div>
                  <div className="p-6 space-y-4">
                      <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nama Lengkap</label>
                          <input 
                              className="w-full border rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition" 
                              value={newStudent.name || ''} 
                              onChange={e => setNewStudent({...newStudent, name: e.target.value})}
                              placeholder="Contoh: Ahmad Peserta"
                          />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Username / Nomor Peserta</label>
                              <input 
                                  className="w-full border rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition font-mono" 
                                  value={newStudent.username || ''} 
                                  onChange={e => setNewStudent({...newStudent, username: e.target.value, nomorPeserta: e.target.value})}
                                  placeholder="1234567890"
                              />
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Password</label>
                              <input 
                                  className="w-full border rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition font-mono" 
                                  value={newStudent.password || ''} 
                                  onChange={e => setNewStudent({...newStudent, password: e.target.value})}
                                  placeholder="12345"
                              />
                          </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Sekolah</label>
                              <input 
                                  className="w-full border rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition" 
                                  value={newStudent.school || ''} 
                                  onChange={e => setNewStudent({...newStudent, school: e.target.value})}
                                  placeholder="SD NEGERI 1"
                              />
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">NPSN</label>
                              <input 
                                  className="w-full border rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition" 
                                  value={newStudent.npsn || ''} 
                                  onChange={e => setNewStudent({...newStudent, npsn: e.target.value})}
                                  placeholder="20512345"
                              />
                          </div>
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Kelas</label>
                          <input 
                              className="w-full border rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition" 
                              value={newStudent.class || ''} 
                              onChange={e => setNewStudent({...newStudent, class: e.target.value})}
                              placeholder="6A"
                          />
                      </div>
                  </div>
                  <div className="p-4 bg-gray-50 border-t flex gap-3">
                      <button onClick={() => setIsAddStudentModalOpen(false)} className="flex-1 py-2.5 border border-gray-300 text-gray-600 rounded-xl font-bold text-sm hover:bg-gray-100 transition">Batal</button>
                      <button onClick={handleSaveStudent} className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl font-bold text-sm hover:bg-purple-700 shadow-lg transition">
                          {editingStudent ? 'Simpan Perubahan' : 'Tambah Peserta'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* CUSTOM TOAST */}
      {toast && (
          <div className="fixed bottom-10 left-1/2 transform -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-10 duration-300">
              <div className={`px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 border ${
                  toast.type === 'error' ? 'bg-red-600 border-red-500 text-white' : 
                  toast.type === 'info' ? 'bg-blue-600 border-blue-500 text-white' : 
                  'bg-green-600 border-green-500 text-white'
              }`}>
                  {toast.type === 'error' ? <XCircle size={20}/> : <CheckCircle size={20}/>}
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
                  <h3 className="text-lg font-bold text-center text-gray-800 mb-2">Konfirmasi Tindakan</h3>
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
                          className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 shadow-lg transition"
                      >
                          Ya, Lanjutkan
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* IMPORT SOAL MODAL */}
      {isImportModalOpen && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-300">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95">
                  <div className="bg-orange-600 px-6 py-4 text-white flex justify-between items-center">
                      <h3 className="font-bold text-lg flex items-center"><Upload size={20} className="mr-2"/> Import Soal</h3>
                      <button onClick={() => setIsImportModalOpen(false)} className="hover:bg-white/20 p-1 rounded transition"><X/></button>
                  </div>
                  <div className="p-6 space-y-6">
                      {/* CSV SECTION */}
                      <div className="border rounded-xl p-4 hover:border-orange-300 transition">
                          <div className="flex justify-between items-start mb-3">
                              <div>
                                  <h4 className="font-bold text-gray-800">Format CSV (Excel)</h4>
                                  <p className="text-xs text-gray-500">Gunakan format tabel standar untuk import massal.</p>
                              </div>
                              <button onClick={downloadQuestionTemplate} className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-3 py-1.5 rounded-lg flex items-center transition">
                                  <FileText size={14} className="mr-1"/> Download Template
                              </button>
                          </div>
                          <button onClick={() => triggerImportQuestions(importTargetExamId!)} className="w-full py-3 bg-orange-50 text-orange-700 border border-orange-200 rounded-xl font-bold text-sm hover:bg-orange-100 transition flex items-center justify-center">
                              <Upload size={18} className="mr-2"/> Pilih File CSV
                          </button>
                      </div>

                      {/* EXAMVIEW SECTION */}
                      <div className="border rounded-xl p-4 hover:border-purple-300 transition">
                          <div className="flex justify-between items-start mb-3">
                              <div>
                                  <h4 className="font-bold text-gray-800">Format ExamView (Text)</h4>
                                  <p className="text-xs text-gray-500">Import dari file .txt dengan format nomor, opsi, dan ans.</p>
                              </div>
                              <button onClick={downloadExamViewTemplate} className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-3 py-1.5 rounded-lg flex items-center transition">
                                  <FileText size={14} className="mr-1"/> Download Template
                              </button>
                          </div>
                          <button onClick={() => triggerImportExamView(importTargetExamId!)} className="w-full py-3 bg-purple-50 text-purple-700 border border-purple-200 rounded-xl font-bold text-sm hover:bg-purple-100 transition flex items-center justify-center">
                              <FileText size={18} className="mr-2"/> Pilih File Text (.txt)
                          </button>
                          <div className="mt-3 bg-gray-50 p-3 rounded-lg text-[10px] text-gray-400 font-mono">
                              Contoh:<br/>
                              1. Soal PG...<br/>
                              a. Opsi A<br/>
                              ans: a<br/>
                              2. Soal Kompleks...<br/>
                              ans: a, b
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* EXPORT SOAL MODAL */}
      {isExportModalOpen && exportTargetExam && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-300">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
                  <div className="bg-blue-600 px-6 py-4 text-white flex justify-between items-center">
                      <h3 className="font-bold text-lg flex items-center"><Download size={20} className="mr-2"/> Export Soal</h3>
                      <button onClick={() => setIsExportModalOpen(false)} className="hover:bg-white/20 p-1 rounded transition"><X/></button>
                  </div>
                  <div className="p-6 space-y-3">
                      <p className="text-sm text-gray-500 mb-4 text-center">Pilih format file untuk mendownload soal <b>{exportTargetExam.title}</b></p>
                      
                      <button onClick={() => { handleExportQuestions(exportTargetExam); setIsExportModalOpen(false); }} className="w-full p-4 border rounded-xl flex items-center gap-4 hover:bg-blue-50 hover:border-blue-200 transition group text-left">
                          <div className="bg-green-100 p-2 rounded-lg text-green-600 group-hover:bg-green-200"><FileSpreadsheet size={24}/></div>
                          <div>
                              <div className="font-bold text-gray-800">Export ke CSV (Excel)</div>
                              <div className="text-xs text-gray-500">Format tabel untuk diolah kembali.</div>
                          </div>
                      </button>

                      <button onClick={() => { handleExportDOC(exportTargetExam); setIsExportModalOpen(false); }} className="w-full p-4 border rounded-xl flex items-center gap-4 hover:bg-blue-50 hover:border-blue-200 transition group text-left">
                          <div className="bg-blue-100 p-2 rounded-lg text-blue-600 group-hover:bg-blue-200"><FileText size={24}/></div>
                          <div>
                              <div className="font-bold text-gray-800">Export ke Microsoft Word (.doc)</div>
                              <div className="text-xs text-gray-500">Format dokumen siap cetak.</div>
                          </div>
                      </button>

                      <button onClick={() => { handleExportPDF(exportTargetExam); setIsExportModalOpen(false); }} className="w-full p-4 border rounded-xl flex items-center gap-4 hover:bg-blue-50 hover:border-blue-200 transition group text-left">
                          <div className="bg-red-100 p-2 rounded-lg text-red-600 group-hover:bg-red-200"><Monitor size={24}/></div>
                          <div>
                              <div className="font-bold text-gray-800">Export ke PDF</div>
                              <div className="text-xs text-gray-500">Format dokumen portable.</div>
                          </div>
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* EDIT MAPPING GROUP MODAL */}
      {isEditMappingGroupModalOpen && editingMappingGroup && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-300">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
                  <div className="bg-blue-600 px-6 py-4 text-white flex justify-between items-center">
                      <h3 className="font-bold text-lg flex items-center"><Edit size={20} className="mr-2"/> Edit Riwayat Mapping</h3>
                      <button onClick={() => setIsEditMappingGroupModalOpen(false)} className="hover:bg-white/20 p-1 rounded transition"><X/></button>
                  </div>
                  <div className="p-6 space-y-4">
                      <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Mata Pelajaran</label>
                          <select 
                              className="w-full border rounded-lg p-3 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                              value={editMappingForm.examId}
                              onChange={(e) => setEditMappingForm({...editMappingForm, examId: e.target.value})}
                          >
                              {exams.map(ex => (
                                  <option key={ex.id} value={ex.id}>{ex.title}</option>
                              ))}
                          </select>
                      </div>

                      <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tanggal Ujian (Mulai)</label>
                          <input 
                              type="date" 
                              className="w-full border rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                              value={editMappingForm.date}
                              onChange={(e) => setEditMappingForm({...editMappingForm, date: e.target.value})}
                          />
                      </div>
                      
                      {editMappingForm.endDate !== undefined && editMappingForm.endDate !== '' && (
                          <div>
                              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tanggal Ujian (Selesai)</label>
                              <input 
                                  type="date" 
                                  className="w-full border rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                  value={editMappingForm.endDate}
                                  onChange={(e) => setEditMappingForm({...editMappingForm, endDate: e.target.value})}
                              />
                          </div>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Sesi</label>
                              <select 
                                  className="w-full border rounded-lg p-3 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                                  value={editMappingForm.session}
                                  onChange={(e) => setEditMappingForm({...editMappingForm, session: e.target.value})}
                                  disabled={editMappingForm.endDate !== undefined && editMappingForm.endDate !== ''}
                              >
                                  {editMappingForm.endDate !== undefined && editMappingForm.endDate !== '' ? (
                                      <option value="-">-</option>
                                  ) : (
                                      Object.keys(settings.sessionTimes || {}).map(s => (
                                          <option key={s} value={s}>{s}</option>
                                      ))
                                  )}
                              </select>
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Ruang</label>
                              <input 
                                  type="text" 
                                  className="w-full border rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                  value={editMappingForm.room}
                                  onChange={(e) => setEditMappingForm({...editMappingForm, room: e.target.value})}
                              />
                          </div>
                      </div>

                      <div className="pt-4">
                          <button 
                              onClick={handleSaveEditMapping}
                              className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition flex items-center justify-center shadow-lg"
                          >
                              <Save size={18} className="mr-2"/> Simpan Perubahan
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* AI GENERATION MODAL */}
      {isAiModalOpen && viewingQuestionsExam && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-300">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
                  <div className="bg-purple-600 px-6 py-4 text-white flex justify-between items-center">
                      <h3 className="font-bold text-lg flex items-center"><Sparkles size={20} className="mr-2"/> Generate Soal AI</h3>
                      <button onClick={() => setIsAiModalOpen(false)} className="hover:bg-white/20 p-1 rounded transition"><X/></button>
                  </div>
                  <div className="p-6 space-y-4">
                      <div className="flex items-center gap-3 bg-purple-50 p-4 rounded-xl border border-purple-100 mb-2">
                          <Bot size={32} className="text-purple-600 flex-shrink-0" />
                          <p className="text-xs text-purple-800 leading-relaxed">
                              Gunakan kecerdasan buatan untuk membuat soal secara otomatis berdasarkan topik yang Anda inginkan.
                          </p>
                      </div>

                      <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Topik / Materi</label>
                          <input 
                              type="text" 
                              className="w-full border rounded-lg p-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                              placeholder="Contoh: Perkalian Pecahan, Sejarah Kemerdekaan..."
                              value={aiTopic}
                              onChange={(e) => setAiTopic(e.target.value)}
                          />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Jumlah Soal</label>
                              <select 
                                  className="w-full border rounded-lg p-3 text-sm bg-white focus:ring-2 focus:ring-purple-500 outline-none"
                                  value={aiCount}
                                  onChange={(e) => setAiCount(parseInt(e.target.value))}
                              >
                                  <option value={5}>5 Soal</option>
                                  <option value={10}>10 Soal</option>
                                  <option value={15}>15 Soal</option>
                                  <option value={20}>20 Soal</option>
                              </select>
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tingkat Kelas</label>
                              <select 
                                  className="w-full border rounded-lg p-3 text-sm bg-white focus:ring-2 focus:ring-purple-500 outline-none"
                                  value={aiGrade}
                                  onChange={(e) => setAiGrade(parseInt(e.target.value))}
                              >
                                  {[1,2,3,4,5,6,7,8,9,10,11,12].map(g => (
                                      <option key={g} value={g}>Kelas {g}</option>
                                  ))}
                              </select>
                          </div>
                      </div>

                      <div className="pt-4">
                          <button 
                              onClick={handleGenerateAiQuestions}
                              disabled={isGeneratingAi || !aiTopic.trim()}
                              className="w-full py-3 bg-purple-600 text-white rounded-xl font-bold text-sm hover:bg-purple-700 transition flex items-center justify-center shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                              {isGeneratingAi ? (
                                  <><Loader2 size={18} className="mr-2 animate-spin"/> Sedang Membuat...</>
                              ) : (
                                  <><Sparkles size={18} className="mr-2"/> Mulai Generate</>
                              )}
                          </button>
                          <p className="text-[10px] text-center text-gray-400 mt-3">
                              * Membutuhkan koneksi internet dan API Key Gemini yang aktif.
                          </p>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};