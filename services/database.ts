import { supabase } from './supabaseClient';
import { User, Exam, ExamResult, AppSettings, Question, UserRole, QuestionType } from '../types';

// Hardcoded Settings (Since app_settings table is removed in new schema)
const DEFAULT_SETTINGS: AppSettings = {
  appName: 'ONLINE BASED TEST',
  themeColor: '#2459a9',
  gradientEndColor: '#60a5fa',
  logoStyle: 'circle',
  schoolLogoUrl: 'https://lh3.googleusercontent.com/d/1OtRkYlUrTr89sYj1Wj1hwTO7NjWXoLPf?authuser=0',
  antiCheat: {
    isActive: true,
    freezeDurationSeconds: 15,
    alertText: 'PERINGATAN! Dilarang berpindah aplikasi.',
    enableSound: true,
    antiSubmitEnabled: false,
    antiSubmitTime: 10
  },
  showTokenToStudents: false,
  sessionTimes: {
    'Sesi 1': '07:30 - 09:30',
    'Sesi 2': '10:00 - 12:00',
    'Sesi 3': '13:00 - 15:00',
    'Sesi 4': '15:30 - 17:30'
  }
};

const SETTINGS_STORAGE_KEY = 'das_app_settings';
const SYSTEM_CONFIG_NAME = '__SYSTEM_CONFIG__';

export const db = {
  getSettings: async (): Promise<AppSettings> => {
    try {
      // 1. Try to get from Supabase first (Global Settings)
      const { data, error } = await supabase
        .from('subjects')
        .select('school_access')
        .eq('name', SYSTEM_CONFIG_NAME)
        .maybeSingle();

      if (data && data.school_access) {
        const parsed = typeof data.school_access === 'string' ? JSON.parse(data.school_access) : data.school_access;
        // Merge with defaults to ensure all fields exist
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch (e) {
      console.error("Error fetching global settings from DB", e);
    }

    // 2. Fallback to localStorage (Local Settings)
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (saved) {
      try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      } catch (e) {
        console.error("Error parsing saved settings", e);
      }
    }
    return DEFAULT_SETTINGS;
  },

  updateSettings: async (newSettings: Partial<AppSettings>): Promise<void> => {
    // 1. Persist to localStorage (Local Fallback)
    const current = await db.getSettings();
    const updated = { ...current, ...newSettings };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(updated));

    // 2. Persist to Supabase (Global Settings)
    try {
      // Check if config record exists
      const { data: existing } = await supabase
        .from('subjects')
        .select('id')
        .eq('name', SYSTEM_CONFIG_NAME)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('subjects')
          .update({ school_access: updated })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('subjects')
          .insert({
            name: SYSTEM_CONFIG_NAME,
            code: 'SYS_CONFIG',
            school_access: updated,
            duration: 0,
            question_count: 0,
            token: 'SYSTEM'
          });
      }
      console.log("Settings updated globally in Supabase");
    } catch (e) {
      console.error("Error updating global settings in DB", e);
    }
  },

  login: async (input: string, password?: string): Promise<User | undefined> => {
    const cleanInput = input.trim();
    
    // 1. HARDCODED ADMIN CHECK
    if (cleanInput === 'admin' && password === 'admin') {
        return {
            id: 'admin-id',
            name: 'Administrator',
            username: 'admin',
            role: UserRole.ADMIN,
            school: 'PUSAT',
            password: 'admin'
        };
    }

    // Check if Supabase is configured (Now handled by fallback in supabaseClient.ts)
    // if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    //     throw new Error("Konfigurasi Supabase belum lengkap. Harap hubungi Admin.");
    // }

    // 2. STAFF CHECK (Table: staff)
    const { data: staffData } = await supabase
      .from('staff')
      .select('*')
      .eq('username', cleanInput)
      .maybeSingle();

    if (staffData && staffData.password === password) {
        return {
            id: staffData.id,
            name: staffData.name,
            username: staffData.username,
            role: staffData.role as UserRole,
            school: staffData.school,
            room: staffData.room,
            password: staffData.password
        };
    }

    // 3. STUDENT CHECK (Table: students)
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .eq('nisn', cleanInput)
      .maybeSingle();

    if (error || !data) return undefined;

    // Verify Password
    if (data.password !== password) {
        return undefined;
    }

    // Check Status
    if (data.status === 'blocked') {
        throw new Error("Akun diblokir. Hubungi pengawas.");
    }

    // Update Login Status
    await supabase.from('students').update({ is_login: true, status: 'idle' }).eq('id', data.id);

    // Fetch mappings
    const { data: mappings } = await supabase
        .from('student_exam_mapping')
        .select('*')
        .eq('student_id', data.id);

    return {
        id: data.id,
        name: data.name,
        username: data.nisn,
        role: UserRole.STUDENT,
        school: data.school,
        class: data.class,
        nomorPeserta: data.nisn,
        password: data.password,
        status: data.status,
        isLogin: data.is_login,
        mappings: (mappings || []).map((m: any) => ({
            id: m.id,
            studentId: m.student_id,
            examId: m.subject_id,
            examDate: m.exam_date,
            session: m.session,
            room: m.room
        })),
        grade: 6 // Default mapping
    };
  },

  // Logout (Reset login status)
  logout: async (userId: string): Promise<void> => {
      if(userId !== 'admin-id') {
          await supabase.from('students').update({ is_login: false }).eq('id', userId);
      }
  },

  getExams: async (level?: string): Promise<Exam[]> => {
    // Query 'subjects' table
    const { data: subjects, error } = await supabase
        .from('subjects')
        .select('*')
        .neq('name', SYSTEM_CONFIG_NAME) // Exclude system config
        .order('created_at', { ascending: false });

    if (error || !subjects) {
        console.error("Error fetching subjects:", error);
        return [];
    }

    // For each subject, fetch questions to build the object
    const exams: Exam[] = [];

    for (const sub of subjects) {
        const { data: questions } = await supabase
            .from('questions')
            .select('*')
            .eq('subject_id', sub.id)
            .order('created_at', { ascending: true });
        
        const mappedQuestions: Question[] = (questions || []).map((q: any) => {
            const content = q.content || {};
            const dbType = q.type;
            
            // Map DB type back to App type
            let appType: QuestionType = 'PG';
            if (dbType === 'pgk') appType = 'PG_KOMPLEKS';
            else if (dbType === 'bs') appType = 'TRUE_FALSE';
            else if (dbType === 'jodoh') appType = 'MATCHING';
            else if (dbType === 'long' || dbType === 'short') appType = 'URAIAN';

            return {
                id: q.id,
                subjectId: q.subject_id,
                nomor: content.nomor || '',
                type: appType,
                text: content.text || '',
                imgUrl: content.imgUrl || undefined,
                options: content.options || [],
                correctIndex: content.correctIndex,
                correctIndices: content.correctIndices,
                points: q.points || 10,
                created_at: q.created_at
            };
        });

        // Parse School Access JSONB & Handle Shuffle Fallbacks
        let schoolAccess: string[] = [];
        let shuffleQuestions = sub.shuffle_questions || false;
        let shuffleOptions = sub.shuffle_options || false;

        try {
            const rawAccess = sub.school_access;
            const parsed = typeof rawAccess === 'string' ? JSON.parse(rawAccess) : rawAccess;
            
            if (Array.isArray(parsed)) {
                schoolAccess = parsed.map((s: any) => String(s).trim());
            } else if (parsed && typeof parsed === 'object') {
                schoolAccess = (parsed.schools || []).map((s: any) => String(s).trim());
                // If columns are missing (null/undefined in DB), use values from JSONB
                if (sub.shuffle_questions === undefined || sub.shuffle_questions === null) {
                    shuffleQuestions = !!parsed.shuffleQuestions;
                }
                if (sub.shuffle_options === undefined || sub.shuffle_options === null) {
                    shuffleOptions = !!parsed.shuffleOptions;
                }
            }
        } catch (e) { 
            schoolAccess = []; 
        }

        exams.push({
            id: sub.id,
            title: sub.name,
            subject: sub.name,
            code: sub.code || '',
            educationLevel: 'SD',
            durationMinutes: sub.duration || 60,
            questionCount: sub.question_count || 0,
            token: sub.token || '',
            isActive: true,
            questions: mappedQuestions,
            examDate: sub.exam_date || '',
            session: sub.session || '',
            schoolAccess: schoolAccess,
            shuffleQuestions: shuffleQuestions,
            shuffleOptions: shuffleOptions
        });
    }

    return exams;
  },

  updateExamToken: async (examId: string, newToken: string): Promise<void> => {
    const { error } = await supabase
        .from('subjects')
        .update({ token: newToken })
        .eq('id', examId);
    if (error) throw error;
  },

  // Updated to support Full Mapping with Fallback for missing columns
  updateExamMapping: async (examId: string, token: string, durationMinutes: number, examDate: string, session: string, schoolAccess: string[], shuffleQuestions?: boolean, shuffleOptions?: boolean): Promise<void> => {
    // We store shuffle settings in BOTH columns and JSONB for maximum compatibility
    const payload: any = { 
      token: token,
      duration: durationMinutes,
      exam_date: examDate,
      session: session,
      school_access: {
          schools: schoolAccess,
          shuffleQuestions: !!shuffleQuestions,
          shuffleOptions: !!shuffleOptions
      },
      shuffle_questions: shuffleQuestions,
      shuffle_options: shuffleOptions
    };

    const { error } = await supabase.from('subjects').update(payload).eq('id', examId);
    
    if (error) {
        // If error is "Could not find column", retry without those columns
        if (error.message?.includes('shuffle_questions') || error.message?.includes('shuffle_options') || error.code === 'PGRST204') {
            console.warn("Shuffle columns missing in DB schema cache, retrying with JSONB fallback only...");
            delete payload.shuffle_questions;
            delete payload.shuffle_options;
            const { error: retryError } = await supabase.from('subjects').update(payload).eq('id', examId);
            if (retryError) throw retryError;
            return;
        }
        console.error("Update Mapping Error:", error);
        throw error;
    }
  },

  createExam: async (exam: Exam): Promise<void> => {
    // Minimal payload to ensure basic insertion works even if some columns are pending cache refresh
    const payload: any = {
        name: exam.title,
        code: exam.code || exam.title.substring(0, 10).toUpperCase().replace(/\s/g, '')
    };
    
    // Only add these if they are provided, allowing DB defaults to take over if needed
    if (exam.durationMinutes) payload.duration = exam.durationMinutes;
    if (exam.token) payload.token = exam.token;

    const { error } = await supabase.from('subjects').insert(payload);
    if (error) {
        console.error("Create Exam Error Details:", error);
        // Throw the specific database error message
        throw new Error(error.message || "Gagal menyimpan ke database");
    }
  },

  addQuestions: async (examId: string, questions: Question[]): Promise<void> => {
      const now = new Date();
      const payload = questions.map((q, idx) => {
          // Map App type to DB type
          let dbType = 'pg';
          if (q.type === 'PG_KOMPLEKS') dbType = 'pgk';
          else if (q.type === 'TRUE_FALSE') dbType = 'bs';
          else if (q.type === 'MATCHING') dbType = 'jodoh';
          else if (q.type === 'URAIAN') dbType = 'long';

          // Ensure sequential created_at by adding milliseconds
          const sequentialCreatedAt = new Date(now.getTime() + idx);

          return {
              subject_id: examId,
              type: dbType,
              points: q.points || 10,
              created_at: sequentialCreatedAt.toISOString(),
              content: {
                  nomor: q.nomor || String(idx + 1),
                  text: q.text,
                  options: q.options,
                  imgUrl: q.imgUrl,
                  correctIndex: q.correctIndex,
                  correctIndices: q.correctIndices
              }
          };
      });
      
      const { error } = await supabase.from('questions').insert(payload);
      if (error) throw error;

      const { count } = await supabase.from('questions').select('*', { count: 'exact', head: true }).eq('subject_id', examId);
      if (count !== null) {
          await supabase.from('subjects').update({ question_count: count }).eq('id', examId);
      }
  },

  submitResult: async (result: ExamResult): Promise<void> => {
    const payload: any = {
        siswa_id: result.studentId,
        exam_id: result.examId,
        score: result.score,
        status: 'finished',
        finish_time: new Date().toISOString(),
        violation_count: result.cheatingAttempts || 0
    };

    if (result.answers) {
        payload.answers = result.answers;
    }

    // 1. Check if result already exists to get its ID
    const { data: existing } = await supabase
        .from('results')
        .select('id')
        .eq('exam_id', result.examId)
        .eq('siswa_id', result.studentId)
        .maybeSingle();

    let error;
    if (existing) {
        // Update existing record
        const { error: updateError } = await supabase
            .from('results')
            .update(payload)
            .eq('id', existing.id);
        error = updateError;
    } else {
        // Insert new record
        const { error: insertError } = await supabase
            .from('results')
            .insert(payload);
        error = insertError;
    }
    
    if (error) {
        console.error("Submit Result Error:", error);
        
        // Fallback: If error is about missing column 'answers', retry without it
        if (error.message?.includes('answers') || error.code === '42703') {
             console.warn("Retrying submit without answers column...");
             delete payload.answers;
             if (existing) {
                 const { error: retryError } = await supabase.from('results').update(payload).eq('id', existing.id);
                 if (retryError) throw retryError;
             } else {
                 const { error: retryError } = await supabase.from('results').insert(payload);
                 if (retryError) throw retryError;
             }
        } else {
            throw error;
        }
    }
    
    await supabase.from('students').update({ status: 'finished' }).eq('id', result.studentId);
  },

  getAllResults: async (): Promise<ExamResult[]> => {
    // 1. Fetch Results
    const { data: results, error } = await supabase
        .from('results')
        .select('*')
        .order('finish_time', { ascending: false });

    if (error || !results) return [];

    // 2. Fetch Students (to map names)
    const { data: students } = await supabase.from('students').select('id, name, school');
    
    // 3. Fetch Subjects (to map titles)
    const { data: subjects } = await supabase.from('subjects').select('id, name');

    // 4. Map Data
    return results.map((r: any) => {
        const student = students?.find(s => s.id === r.siswa_id);
        const subject = subjects?.find(s => s.id === r.exam_id);
        
        return {
            id: r.id,
            studentId: r.siswa_id,
            studentName: student?.name || 'Unknown',
            examId: r.exam_id,
            examTitle: subject?.name || 'Unknown',
            score: Number(r.score),
            submittedAt: r.finish_time,
            totalQuestions: 0, 
            cheatingAttempts: r.violation_count || 0,
            answers: r.answers, // Include answers in the result
            status: r.status
        };
    });
  },

  // NEW FUNCTION: Reset Cheating Count
  resetCheatingCount: async (resultId: string): Promise<void> => {
      // Update violation_count in results table
      const { error } = await supabase.from('results').update({ violation_count: 0 }).eq('id', resultId);
      if (error) {
          console.error("Reset Cheating Count Error:", error);
          throw error;
      }
  },

  getUsers: async (): Promise<User[]> => {
    const { data: students } = await supabase.from('students').select('*').order('school', { ascending: true });
    if (!students) return [];

    // Fetch all mappings
    const { data: mappings } = await supabase.from('student_exam_mapping').select('*');

    return students.map((u: any) => ({
        id: u.id,
        name: u.name,
        username: u.nisn,
        role: UserRole.STUDENT,
        nomorPeserta: u.nisn,
        school: u.school,
        npsn: u.npsn,
        class: u.class,
        password: u.password,
        status: u.status,
        isLogin: u.is_login,
        mappings: (mappings || [])
            .filter((m: any) => m.student_id === u.id)
            .map((m: any) => ({
                id: m.id,
                studentId: m.student_id,
                examId: m.subject_id,
                examDate: m.exam_date,
                session: m.session,
                room: m.room
            })),
        grade: 6
    }));
  },
  
  updateStudentMapping: async (studentIds: string[], mapping: { examId: string, examDate?: string, room?: string, session?: string }): Promise<void> => {
      // Prepare upsert data for each student
      const upsertData = studentIds.map(sid => ({
          student_id: sid,
          subject_id: mapping.examId,
          exam_date: mapping.examDate,
          room: mapping.room,
          session: mapping.session
      }));

      const { error } = await supabase.from('student_exam_mapping').upsert(upsertData, { onConflict: 'student_id,subject_id' });
      
      if (error) {
          console.error("Update Student Mapping Error:", error);
          if (error.message?.includes('relation') || error.code === '42P01') {
              throw new Error("Tabel 'student_exam_mapping' belum dibuat. Silakan jalankan perintah SQL yang disarankan.");
          }
          throw error;
      }
  },

  deleteStudentMappingBatch: async (studentIds: string[], examId: string, date: string, session: string, room: string): Promise<void> => {
      if (!studentIds || studentIds.length === 0) return;

      const chunkSize = 100;
      for (let i = 0; i < studentIds.length; i += chunkSize) {
          const chunk = studentIds.slice(i, i + chunkSize);
          
          const query = supabase
              .from('student_exam_mapping')
              .delete()
              .in('student_id', chunk)
              .eq('exam_date', date)
              .eq('session', session)
              .eq('room', room);

          if (examId && examId !== 'temp') {
              query.eq('subject_id', examId);
          }

          const { error } = await query;
          if (error) {
              console.error("Delete Mapping Batch Error:", error);
              throw error;
          }
      }
  },

  updateStudentMappingBatch: async (studentIds: string[], oldMapping: any, newMapping: any): Promise<void> => {
      if (!studentIds || studentIds.length === 0) return;

      // Chunking to avoid potential URL length or payload limits
      const chunkSize = 100;
      for (let i = 0; i < studentIds.length; i += chunkSize) {
          const chunk = studentIds.slice(i, i + chunkSize);
          
          const query = supabase
              .from('student_exam_mapping')
              .update({
                  exam_date: newMapping.date,
                  session: newMapping.session,
                  room: newMapping.room,
                  subject_id: newMapping.examId
              })
              .in('student_id', chunk)
              .eq('exam_date', oldMapping.date)
              .eq('session', oldMapping.session)
              .eq('room', oldMapping.room);

          // Only add subject_id filter if it's a valid UUID
          if (oldMapping.examId && oldMapping.examId !== 'temp') {
              query.eq('subject_id', oldMapping.examId);
          }

          const { error } = await query;
          if (error) {
              console.error("Update Mapping Batch Error:", error);
              throw error;
          }
      }
  },
  
  importStudents: async (users: User[]): Promise<void> => {
      const payload = users.map(u => ({
          name: u.name,
          nisn: u.nomorPeserta || u.username, 
          school: u.school || 'UMUM',
          npsn: u.npsn || '',
          class: u.class || '-',
          password: u.password || '12345',
          is_login: false,
          status: 'idle'
      }));
      const { error } = await supabase.from('students').upsert(payload, { onConflict: 'nisn' });
      if (error) throw error;
  },

  createUser: async (user: Partial<User>): Promise<void> => {
      const payload: any = {
          name: user.name,
          nisn: user.nomorPeserta || user.username,
          school: user.school || 'UMUM',
          npsn: user.npsn || '',
          class: user.class || '-',
          password: user.password || '12345',
          is_login: false,
          status: 'idle'
      };
      const { error } = await supabase.from('students').insert(payload);
      if (error) throw error;
  },

  updateUser: async (id: string, user: Partial<User>): Promise<void> => {
      const payload: any = {};
      if (user.name) payload.name = user.name;
      if (user.nomorPeserta || user.username) payload.nisn = user.nomorPeserta || user.username;
      if (user.school) payload.school = user.school;
      if (user.npsn) payload.npsn = user.npsn;
      if (user.class) payload.class = user.class;
      if (user.password) payload.password = user.password;
      
      const { error } = await supabase.from('students').update(payload).eq('id', id);
      if (error) throw error;
  },

  addUser: async (user: User): Promise<void> => {
      const payload: any = {
          name: user.name,
          nisn: user.nomorPeserta || user.username,
          school: user.school || 'UMUM',
          npsn: user.npsn || '',
          class: user.class || '-',
          password: user.password || '12345',
          is_login: false,
          status: 'idle'
      };
      const { error } = await supabase.from('students').insert(payload);
      if (error) throw error;
  },

  deleteUser: async (id: string): Promise<void> => {
    await supabase.from('students').delete().eq('id', id);
  },

  deleteExam: async (id: string): Promise<void> => {
    // Delete questions first (though Supabase might have cascade, better be safe)
    await supabase.from('questions').delete().eq('subject_id', id);
    await supabase.from('subjects').delete().eq('id', id);
  },

  deleteQuestion: async (id: string, subjectId: string): Promise<void> => {
    await supabase.from('questions').delete().eq('id', id);
    // Update count
    const { count } = await supabase.from('questions').select('*', { count: 'exact', head: true }).eq('subject_id', subjectId);
    if (count !== null) {
        await supabase.from('subjects').update({ question_count: count }).eq('id', subjectId);
    }
  },

  updateQuestion: async (question: Question): Promise<void> => {
    let dbType = 'pg';
    if (question.type === 'PG_KOMPLEKS') dbType = 'pgk';
    else if (question.type === 'TRUE_FALSE') dbType = 'bs';
    else if (question.type === 'MATCHING') dbType = 'jodoh';
    else if (question.type === 'URAIAN') dbType = 'long';

    const { error } = await supabase.from('questions').update({
        type: dbType,
        points: question.points || 10,
        created_at: question.created_at,
        content: {
            nomor: question.nomor,
            text: question.text,
            options: question.options,
            imgUrl: question.imgUrl,
            correctIndex: question.correctIndex,
            correctIndices: question.correctIndices
        }
    }).eq('id', question.id);
    if (error) throw error;
  },

  getStaff: async (): Promise<User[]> => {
    const { data, error } = await supabase.from('staff').select('*').order('name', { ascending: true });
    if (error || !data) return [];
    return data.map((s: any) => ({
        id: s.id,
        name: s.name,
        username: s.username,
        role: s.role as UserRole,
        school: s.school,
        npsn: s.npsn,
        room: s.room,
        password: s.password
    }));
  },

  addStaff: async (staff: Partial<User>): Promise<void> => {
      const { error } = await supabase.from('staff').insert({
          name: staff.name,
          username: staff.username,
          password: staff.password || '12345',
          role: staff.role,
          school: staff.school,
          npsn: staff.npsn,
          room: staff.room
      });
      if (error) throw error;
  },

  deleteStaff: async (id: string): Promise<void> => {
      const { error } = await supabase.from('staff').delete().eq('id', id);
      if (error) throw error;
  },

  resetUserStatus: async (userId: string): Promise<void> => {
    await supabase.from('students').update({ is_login: false, status: 'idle' }).eq('id', userId);
  },

  startExamSession: async (userId: string, examId: string): Promise<void> => {
    // 1. Check if result already exists
    const { data: existing } = await supabase
        .from('results')
        .select('id, status, answers')
        .eq('exam_id', examId)
        .eq('siswa_id', userId)
        .maybeSingle();

    // If already finished, don't restart
    if (existing && existing.status === 'finished') return;

    const payload: any = {
        exam_id: examId,
        siswa_id: userId,
        status: 'working'
    };
    
    // Only set start_time and reset violation count if it's a brand new session
    if (!existing) {
        payload.start_time = new Date().toISOString();
        payload.violation_count = 0;
    }

    if (existing) {
        await supabase.from('results').update(payload).eq('id', existing.id);
    } else {
        await supabase.from('results').insert(payload);
    }

    // Update student status
    await supabase.from('students').update({ 
        status: 'working',
        is_login: true 
    }).eq('id', userId);
  },

  saveExamProgress: async (userId: string, examId: string, answers: any[], cheatingAttempts: number, lastIndex: number): Promise<void> => {
    const { data: existing } = await supabase
        .from('results')
        .select('id')
        .eq('exam_id', examId)
        .eq('siswa_id', userId)
        .maybeSingle();

    const payload = {
        answers,
        violation_count: cheatingAttempts,
        status: 'working',
        score: lastIndex // Temporary store for current question index
    };

    if (existing) {
        await supabase.from('results').update(payload).eq('id', existing.id);
    } else {
        await supabase.from('results').insert({
            ...payload,
            exam_id: examId,
            siswa_id: userId
        });
    }
  },

  getExamProgress: async (userId: string, examId: string): Promise<any | null> => {
    const { data, error } = await supabase
        .from('results')
        .select('answers, violation_count, status, score, start_time')
        .eq('exam_id', examId)
        .eq('siswa_id', userId)
        .maybeSingle();
    
    if (error || !data) return null;
    return {
        answers: data.answers,
        violation_count: data.violation_count,
        status: data.status,
        lastIndex: data.score,
        startTime: data.start_time
    };
  },

  subscribeToQuestions: (subjectId: string, callback: (question: Question) => void) => {
    return supabase
      .channel(`questions-updates-${subjectId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'questions',
          filter: `subject_id=eq.${subjectId}`
        },
        (payload) => {
          const q = payload.new;
          const content = q.content || {};
          const dbType = q.type;
          
          let appType: QuestionType = 'PG';
          if (dbType === 'pgk') appType = 'PG_KOMPLEKS';
          else if (dbType === 'bs') appType = 'TRUE_FALSE';
          else if (dbType === 'jodoh') appType = 'MATCHING';
          else if (dbType === 'long' || dbType === 'short') appType = 'URAIAN';

          const mapped: Question = {
              id: q.id,
              subjectId: q.subject_id,
              nomor: content.nomor || '',
              type: appType,
              text: content.text || '',
              imgUrl: content.imgUrl || undefined,
              options: content.options || [],
              correctIndex: content.correctIndex,
              correctIndices: content.correctIndices,
              points: q.points || 10
          };
          callback(mapped);
        }
      )
      .subscribe();
  },

  subscribeToStudentStatus: (studentId: string, callback: (status: string) => void) => {
    return supabase
      .channel(`student-status-${studentId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'students',
          filter: `id=eq.${studentId}`
        },
        (payload) => {
          if (payload.new && payload.new.status) {
            callback(payload.new.status);
          }
        }
      )
      .subscribe();
  },

  reportViolation: async (userId: string, examId: string, violationCount: number): Promise<void> => {
    // 1. Update student status to 'blocked'
    await supabase.from('students').update({ 
        status: 'blocked',
        is_login: true 
    }).eq('id', userId);
    
    // 2. Update violation count in results table
    await supabase.from('results').update({ 
        violation_count: violationCount,
        status: 'locked' // Also lock the result status
    }).eq('exam_id', examId).eq('siswa_id', userId);
    
    console.log(`Violation reported for user ${userId} on exam ${examId}. Count: ${violationCount}`);
  },

  resetUserPassword: async (userId: string): Promise<void> => {
    await supabase.from('students').update({ password: '12345' }).eq('id', userId);
  },

  getExamSessions: async (): Promise<any[]> => {
    const { data, error } = await supabase.from('exam_sessions').select('*').order('created_at', { ascending: false });
    if (error) return [];
    return data;
  },

  createExamSession: async (session: any): Promise<void> => {
    const { error } = await supabase.from('exam_sessions').insert(session);
    if (error) throw error;
  },

  updateExamSession: async (id: string, updates: any): Promise<void> => {
    const { error } = await supabase.from('exam_sessions').update(updates).eq('id', id);
    if (error) throw error;
  },

  deleteExamSession: async (id: string): Promise<void> => {
    const { error } = await supabase.from('exam_sessions').delete().eq('id', id);
    if (error) throw error;
  }
};