-- Enable UUID extension
create extension if not exists "pgcrypto";

-- Students Table
create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  nomor_peserta text unique not null,
  school text,
  npsn text,
  class text,
  password text default '12345',
  is_login boolean default false,
  status text default 'idle',
  created_at timestamptz default now()
);

-- Subjects (Exams) Table
create table if not exists subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  duration integer default 60,
  question_count integer default 0,
  token text,
  exam_date text,
  session text,
  school_access jsonb default '[]'::jsonb,
  shuffle_questions boolean default false,
  shuffle_options boolean default false,
  created_at timestamptz default now()
);

-- Questions Table
create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid references subjects(id) on delete cascade,
  guru_id uuid null,
  type text check (type in ('pg', 'pgk', 'bs', 'jodoh', 'short', 'long')),
  content jsonb not null,
  points integer default 1,
  created_at timestamptz default now()
);

-- Results Table (Updated to match user provided schema)
create table if not exists results (
  id uuid not null default gen_random_uuid (),
  exam_id uuid null, -- references exams(id)
  peserta_id uuid null, -- references profiles(id)
  session_id uuid null, -- references exam_sessions(id)
  answers jsonb null default '[]'::jsonb,
  score numeric null,
  status text null,
  start_time timestamp with time zone null default timezone ('utc'::text, now()),
  finish_time timestamp with time zone null,
  violation_count integer null default 0,
  constraint results_pkey primary key (id),
  constraint results_exam_id_peserta_id_key unique (exam_id, peserta_id),
  constraint results_status_check check (
    (
      status = any (
        array['working'::text, 'finished'::text, 'locked'::text]
      )
    )
  )
);

-- Staff Table
create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  username text unique not null,
  password text default '12345',
  role text not null,
  school text,
  npsn text,
  room text,
  created_at timestamptz default now()
);

-- Student Exam Mapping Table
create table if not exists student_exam_mapping (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade,
  subject_id uuid references subjects(id) on delete cascade,
  exam_date text,
  session text,
  room text,
  created_at timestamptz default now(),
  constraint student_exam_mapping_unique unique (student_id, subject_id)
);

-- Exam Sessions Table
create table if not exists exam_sessions (
  id uuid not null default gen_random_uuid (),
  exam_id uuid null references subjects(id) on delete cascade,
  token text null,
  room_name text null,
  proktor_id uuid null references staff(id) on delete set null,
  is_open boolean null default false,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  constraint exam_sessions_pkey primary key (id)
);

-- Disable RLS for easy setup
alter table staff disable row level security;
alter table exam_sessions disable row level security;
alter table students disable row level security;
alter table subjects disable row level security;
alter table questions disable row level security;
alter table results disable row level security;
alter table student_exam_mapping disable row level security;

/* 
  SQL HELPER COMMANDS:
  
  1. Jika kolom 'npsn' belum ada di tabel staff:
     ALTER TABLE staff ADD COLUMN npsn text;

  2. Update NPSN untuk sekolah tertentu:
     UPDATE students SET npsn = '20535441' WHERE school = 'UPT SMPN 6 PASURUAN';
     UPDATE staff SET npsn = '20535441' WHERE school = 'UPT SMPN 6 PASURUAN';
*/
