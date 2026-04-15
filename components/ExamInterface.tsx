import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactQuill, { Quill } from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { Exam, ExamResult, User, Question, AppSettings } from '../types';
import { playAlertSound } from '../utils/sound';
import { Timer, ChevronRight, ChevronLeft, Grid3X3, Trophy, CheckCircle, ShieldAlert, ZoomIn, X, Maximize2, Clock } from 'lucide-react';
import { db } from '../services/database'; // SWITCHED TO REAL DB
import { Confetti } from './Confetti';
// @ts-ignore
import renderMathInElement from 'katex/dist/contrib/auto-render';

if (typeof window !== 'undefined') {
    (window as any).katex = katex;
    (window as any).Quill = Quill;
    
    // Ensure formula module is registered
    // Removed faulty registration block
}

interface ExamInterfaceProps {
  user: User;
  exam: Exam;
  onComplete: () => void;
  appName: string;
  themeColor: string;
  settings: AppSettings;
}

// Simple seeded PRNG (Mulberry32)
function mulberry32(a: number) {
    return function() {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

function hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
}

// Fisher-Yates Shuffle Algorithm with optional seed
function shuffleArray<T>(array: T[], seedStr?: string): T[] {
  const newArray = [...array];
  const random = seedStr ? mulberry32(hashString(seedStr)) : Math.random;
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

// Helper to shuffle options inside a question and update the correctIndex map
const processQuestionsWithShuffledOptions = (questions: Question[], seedBase?: string): Question[] => {
    return questions.map((q, qIndex) => {
        const seed = seedBase ? `${seedBase}_${q.id}_${qIndex}` : undefined;
        if (q.type === 'TRUE_FALSE' || q.type === 'URAIAN') return q;

        if (q.type === 'MATCHING') {
            // Options are "left|right". We want to keep lefts in order but shuffle rights.
            const pairs = (q.options || []).map(opt => {
                const [left, right] = opt.split('|');
                return { left, right };
            });
            const rights = shuffleArray(pairs.map(p => p.right), seed);
            return {
                ...q,
                options: pairs.map(p => p.left), // Left sides in order
                matchingRights: rights, // Shuffled right sides for dropdown
                matchingCorrectMap: Object.fromEntries(pairs.map(p => [p.left, p.right]))
            };
        }

        // 1. Map options to objects to track correctness
        const mappedOptions = (q.options || []).map((opt, idx) => {
            let isCorrect = false;
            if (q.type === 'PG') {
                isCorrect = idx === q.correctIndex;
            } else if (q.type === 'PG_KOMPLEKS') {
                isCorrect = q.correctIndices?.includes(idx) ?? false;
            }
            return { text: opt, isCorrect };
        });

        // 2. Shuffle the options
        const shuffledMapped = shuffleArray(mappedOptions, seed);

        // 3. Reconstruct options array
        const newOptions = shuffledMapped.map(m => m.text);

        // 4. Find new indices for correct answers
        let newCorrectIndex = 0;
        let newCorrectIndices: number[] = [];

        if (q.type === 'PG') {
            newCorrectIndex = shuffledMapped.findIndex(m => m.isCorrect);
        } else if (q.type === 'PG_KOMPLEKS') {
            newCorrectIndices = shuffledMapped
                .map((m, idx) => m.isCorrect ? idx : -1)
                .filter(idx => idx !== -1);
        }

        return {
            ...q,
            options: newOptions,
            correctIndex: newCorrectIndex,
            correctIndices: newCorrectIndices
        };
    });
};

// Motivations based on score percentage
const getMotivation = (score: number, maxScore: number, studentName: string) => {
    const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
    if (percentage === 100) return `Luar biasa, ${studentName}! Nilai Sempurna! Pertahankan prestasimu!`;
    if (percentage >= 80) return `Hebat, ${studentName}! Hasil yang sangat memuaskan.`;
    if (percentage >= 60) return `Bagus, ${studentName}! Teruslah belajar untuk hasil yang lebih baik lagi.`;
    return `Jangan menyerah, ${studentName}! Kegagalan adalah awal dari kesuksesan. Ayo belajar lebih giat!`;
};

export const ExamInterface: React.FC<ExamInterfaceProps> = ({ user, exam, onComplete, appName, themeColor, settings }) => {
  // PERSISTENCE LOGIC
  const timeKey = `das_time_${user.id}_${exam.id}`;
  const cheatKey = `das_cheat_${user.id}_${exam.id}`;
  const questionsKey = `das_questions_${user.id}_${exam.id}`;
  const answersKey = `das_answers_${user.id}_${exam.id}`;
  const doubtsKey = `das_doubts_${user.id}_${exam.id}`;
  const indexKey = `das_index_${user.id}_${exam.id}`;
  const frozenKey = `das_frozen_${user.id}_${exam.id}`;
  const freezeTimeKey = `das_freeze_time_${user.id}_${exam.id}`;
  const scrollKey = `das_scroll_${user.id}_${exam.id}`;

  // Initialize Randomized Questions (Order AND Options) ONLY ONCE on mount
  const [activeQuestions, setActiveQuestions] = useState<Question[]>(() => {
      const saved = localStorage.getItem(questionsKey);
      if (saved) {
          try {
              return JSON.parse(saved);
          } catch (e) {
              console.error("Failed to parse saved questions", e);
          }
      }

      // Ensure exam.questions is an array
      const questionsSource: Question[] = exam.questions || [];
      const seedBase = `${user.id}_${exam.id}`;
      
      // 1. Shuffle Questions if enabled
      const processedQ = exam.shuffleQuestions ? shuffleArray(questionsSource, seedBase) : [...questionsSource];
      
      // 2. Shuffle Options if enabled (or process for Matching)
      let result: Question[];
      if (exam.shuffleOptions) {
          result = processQuestionsWithShuffledOptions(processedQ, seedBase);
      } else {
          // Even if not shuffling, we need to process MATCHING to set up the maps
          result = processedQ.map((q, qIndex) => {
              if (q.type === 'MATCHING') {
                  const pairs = (q.options || []).map(opt => {
                      const [left, right] = opt.split('|');
                      return { left, right };
                  });
                  // For matching, we still shuffle the right side to make it a challenge
                  const rights = shuffleArray(pairs.map(p => p.right), `${seedBase}_${q.id}_${qIndex}`);
                  return {
                      ...q,
                      options: pairs.map(p => p.left),
                      matchingRights: rights,
                      matchingCorrectMap: Object.fromEntries(pairs.map(p => [p.left, p.right]))
                  };
              }
              return q;
          });
      }
      
      localStorage.setItem(questionsKey, JSON.stringify(result));
      return result;
  });
  
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(() => {
      const saved = localStorage.getItem(indexKey);
      const parsed = saved ? parseInt(saved, 10) : 0;
      const maxIndex = Math.max(0, (exam.questions?.length || 1) - 1);
      return Math.min(Math.max(0, parsed), maxIndex);
  });
  
  // State for different answer types
  const [answers, setAnswers] = useState<any[]>(() => {
      const saved = localStorage.getItem(answersKey);
      return saved ? JSON.parse(saved) : new Array(activeQuestions.length).fill(null);
  });
  
  const [markedDoubts, setMarkedDoubts] = useState<boolean[]>(() => {
      const saved = localStorage.getItem(doubtsKey);
      return saved ? JSON.parse(saved) : new Array(activeQuestions.length).fill(false);
  });
  const [timeLeft, setTimeLeft] = useState(() => {
     const saved = localStorage.getItem(timeKey);
     return saved ? parseInt(saved, 10) : exam.durationMinutes * 60;
  });
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg'>('base');
  const [cheatingAttempts, setCheatingAttempts] = useState(() => {
     const saved = localStorage.getItem(cheatKey);
     return saved ? parseInt(saved, 10) : 0;
  });
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const [maxPossibleScore, setMaxPossibleScore] = useState(0);
  
  // UI State
  const [showQuestionListModal, setShowQuestionListModal] = useState(false);
  const [showConfirmFinishModal, setShowConfirmFinishModal] = useState(false);
  
  // Time Warning State
  const [timeAlert, setTimeAlert] = useState<{ visible: boolean; title: string; subtitle: string } | null>(null);

  // Anti Cheat States
  const [isFrozen, setIsFrozen] = useState(() => {
      return localStorage.getItem(frozenKey) === 'true';
  });
  const [freezeTimeLeft, setFreezeTimeLeft] = useState(() => {
      const saved = localStorage.getItem(freezeTimeKey);
      return saved ? parseInt(saved, 10) : 0;
  });
  const questionRef = useRef<HTMLDivElement>(null);

  // Lightbox State
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [isSessionInitialized, setIsSessionInitialized] = useState(false);

  useEffect(() => {
    // Initialize session in database and sync progress
    const initSession = async () => {
        try {
            await db.startExamSession(user.id, exam.id);
            
            // Sync progress from DB if local is empty or less complete
            const progress = await db.getExamProgress(user.id, exam.id);
            if (progress && progress.status === 'working') {
                // 1. Calculate time left based on start_time
                if (progress.startTime) {
                    const start = new Date(progress.startTime).getTime();
                    const now = new Date().getTime();
                    const elapsedSeconds = Math.floor((now - start) / 1000);
                    const totalDurationSeconds = exam.durationMinutes * 60;
                    const calculatedTimeLeft = Math.max(0, totalDurationSeconds - elapsedSeconds);
                    
                    // Only update if calculated time is significantly different or local is missing
                    const localTime = localStorage.getItem(timeKey);
                    if (!localTime || Math.abs(parseInt(localTime) - calculatedTimeLeft) > 60) {
                        setTimeLeft(calculatedTimeLeft);
                        localStorage.setItem(timeKey, calculatedTimeLeft.toString());
                    }
                }

                if (progress.answers) {
                    const localAnswers = localStorage.getItem(answersKey);
                    const localParsed = localAnswers ? JSON.parse(localAnswers) : null;
                    
                    // Heuristic: if local is empty or doesn't exist, use DB
                    const isLocalEmpty = !localParsed || localParsed.every((a: any) => a === null);
                    
                    if (isLocalEmpty) {
                        setAnswers(progress.answers);
                        setCheatingAttempts(progress.violation_count || 0);
                        if (progress.lastIndex !== undefined && progress.lastIndex !== null) {
                            // Ensure index is within bounds
                            const maxIndex = Math.max(0, (exam.questions?.length || 1) - 1);
                            const safeIndex = Math.min(Math.max(0, progress.lastIndex), maxIndex);
                            setCurrentQuestionIndex(safeIndex);
                            localStorage.setItem(indexKey, safeIndex.toString());
                        }
                        localStorage.setItem(answersKey, JSON.stringify(progress.answers));
                        localStorage.setItem(cheatKey, (progress.violation_count || 0).toString());
                    }
                }
            }
        } catch (err) {
            console.error("Failed to initialize session or sync progress", err);
        } finally {
            setIsSessionInitialized(true);
        }
    };
    
    initSession();
  }, []);

  // Persistence Effect
  useEffect(() => {
      localStorage.setItem(timeKey, timeLeft.toString());
  }, [timeLeft, timeKey]);

  useEffect(() => {
      localStorage.setItem(cheatKey, cheatingAttempts.toString());
      // Also save to DB for persistence across devices/reloads
      if (isSessionInitialized) {
          db.saveExamProgress(user.id, exam.id, answers, cheatingAttempts, currentQuestionIndex)
            .catch(err => console.warn("Failed to save progress to DB", err));
      }
  }, [cheatingAttempts, cheatKey, answers, currentQuestionIndex, isSessionInitialized]);

  useEffect(() => {
      localStorage.setItem(answersKey, JSON.stringify(answers));
  }, [answers, answersKey]);

  useEffect(() => {
      localStorage.setItem(doubtsKey, JSON.stringify(markedDoubts));
  }, [markedDoubts, doubtsKey]);

  useEffect(() => {
      localStorage.setItem(indexKey, currentQuestionIndex.toString());
  }, [currentQuestionIndex, indexKey]);

  useEffect(() => {
      localStorage.setItem(frozenKey, isFrozen.toString());
  }, [isFrozen, frozenKey]);

  useEffect(() => {
      localStorage.setItem(freezeTimeKey, freezeTimeLeft.toString());
  }, [freezeTimeLeft, freezeTimeKey]);

  // Real-time Question Updates (Accommodate fixes during test)
  useEffect(() => {
    const channel = db.subscribeToQuestions(exam.id, (updatedQ) => {
      setActiveQuestions(prev => {
        const index = prev.findIndex(q => q.id === updatedQ.id);
        if (index === -1) return prev;
        
        const newQuestions = [...prev];
        const oldQ = prev[index];
        
        // Update the question content while trying to preserve shuffle state if possible
        newQuestions[index] = {
            ...oldQ, // Keep current shuffled state
            text: updatedQ.text,
            imgUrl: updatedQ.imgUrl,
            points: updatedQ.points,
            // If options changed, we might have a problem with current answers.
            // But usually "fixing" means fixing text or a typo in an option.
            options: (updatedQ.options || []).length === (oldQ.options || []).length ? oldQ.options : updatedQ.options,
        };
        
        localStorage.setItem(questionsKey, JSON.stringify(newQuestions));
        return newQuestions;
      });
    });
    
    return () => {
      channel.unsubscribe();
    };
  }, [exam.id, questionsKey]);

  useEffect(() => {
    // Scroll to top when question changes
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentQuestionIndex]);

  // Scroll Position Persistence
  useEffect(() => {
    const handleScroll = () => {
      localStorage.setItem(scrollKey, window.scrollY.toString());
    };
    window.addEventListener('scroll', handleScroll);
    
    // Restore scroll
    const savedScroll = localStorage.getItem(scrollKey);
    if (savedScroll) {
        setTimeout(() => {
            window.scrollTo({ top: parseInt(savedScroll, 10), behavior: 'smooth' });
        }, 500);
    }

    return () => window.removeEventListener('scroll', handleScroll);
  }, [scrollKey]);

  useEffect(() => {
    // Calculate max possible score once
    const max = activeQuestions.reduce((acc, q) => acc + (q.points || 0), 0);
    setMaxPossibleScore(max);

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        const nextTime = prev - 1;

        // --- WARNING LOGIC START ---
        // Warning 5 Minutes (300 seconds)
        if (nextTime === 300) {
            setTimeAlert({ 
                visible: true, 
                title: "Waktu mengerjakan kurang 5 menit", 
                subtitle: "Periksa kembali soal dan jawaban" 
            });
            // Auto hide after 3 seconds
            setTimeout(() => setTimeAlert(null), 3000);
        }

        // Warning 1 Minute (60 seconds)
        if (nextTime === 60) {
            setTimeAlert({ 
                visible: true, 
                title: "Waktu mengerjakan kurang 60 detik", 
                subtitle: "Periksa kembali soal dan jawaban" 
            });
            // Auto hide after 3 seconds
            setTimeout(() => setTimeAlert(null), 3000);
        }
        // --- WARNING LOGIC END ---

        if (nextTime <= 0) {
          clearInterval(timer);
          // Auto submit when time is up
          handleFinalSubmit();
          return 0;
        }
        return nextTime;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Countdown for Freeze Timer
  useEffect(() => {
      let interval: any;
      if (isFrozen && freezeTimeLeft > 0) {
          interval = setInterval(() => {
              setFreezeTimeLeft((prev) => Math.max(0, prev - 1));
          }, 1000);
      } else if (isFrozen && freezeTimeLeft <= 0) {
          setIsFrozen(false);
      }
      return () => clearInterval(interval);
  }, [isFrozen, freezeTimeLeft]);

  const handleFinalSubmitRef = useRef<any>(null);

  useEffect(() => {
      handleFinalSubmitRef.current = handleFinalSubmit;
  });

  // Listen for Admin Unlock (Remote Unlock) and Force Finish
  useEffect(() => {
      const channel = db.subscribeToStudentStatus(user.id, (status) => {
          if (status === 'idle' || status === 'working') {
              if (isFrozen) {
                  setIsFrozen(false);
                  setFreezeTimeLeft(0);
              }
          } else if (status === 'finished') {
              // Admin forced finish
              if (handleFinalSubmitRef.current) {
                  handleFinalSubmitRef.current();
              }
          }
      });
      return () => {
          channel.unsubscribe();
      };
  }, [user.id, isFrozen]);

  useEffect(() => {
    if (!settings.antiCheat.isActive) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        triggerCheatingAlert();
      }
    };
    const handleBlur = () => {
       triggerCheatingAlert();
    };

    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [cheatingAttempts, settings.antiCheat, isFrozen, showScoreModal]);

  // Render Math when question changes
  useEffect(() => {
    if (questionRef.current) {
      if (typeof renderMathInElement === 'function') {
          try {
              renderMathInElement(questionRef.current, {
                delimiters: [
                  { left: '$$', right: '$$', display: true },
                  { left: '$', right: '$', display: false },
                  { left: '\\(', right: '\\)', display: false },
                  { left: '\\[', right: '\\]', display: true }
                ],
                throwOnError: false
              });
          } catch (e) {
              console.error("Auto-render error", e);
          }
      }
      
      // Also handle Quill's specific formula format if any
      const formulas = questionRef.current.querySelectorAll('.ql-formula');
      formulas.forEach((el: any) => {
        const tex = el.getAttribute('data-value');
        if (tex) {
          try {
            const span = document.createElement('span');
            if (typeof (window as any).katex?.render === 'function') {
                (window as any).katex.render(tex, span, { throwOnError: false });
            }
            el.parentNode?.replaceChild(span, el);
          } catch (e) {
            console.error("KaTeX render error", e);
          }
        }
      });
    }
  }, [currentQuestionIndex, activeQuestions]);

  const triggerCheatingAlert = () => {
    // Only alert if exam is active (score modal not shown) and not already frozen
    if (showScoreModal || isFrozen) return;

    if (settings.antiCheat.enableSound) {
        playAlertSound();
    }
    
    // CALCULATE EXPONENTIAL FREEZE TIME (Jos Jis System)
    // Attempt 1: 15s * 2^0 = 15s
    // Attempt 2: 15s * 2^1 = 30s
    // Attempt 3: 15s * 2^2 = 60s
    // Attempt 4: 15s * 2^3 = 120s
    const baseTime = settings.antiCheat.freezeDurationSeconds || 15;
    const penaltyDuration = baseTime * Math.pow(2, cheatingAttempts);
    
    setFreezeTimeLeft(penaltyDuration);
    setIsFrozen(true);

    setCheatingAttempts(prev => {
        const next = prev + 1;
        // Report to database so admin sees it in monitoring
        db.reportViolation(user.id, exam.id, next).catch(err => console.error("Failed to report violation", err));
        return next;
    });
  };

  const handleSingleChoice = (optionIndex: number) => {
    const newAnswers = [...answers];
    newAnswers[currentQuestionIndex] = optionIndex;
    setAnswers(newAnswers);
  };

  const handleMultiChoice = (optionIndex: number) => {
    const newAnswers = [...answers];
    const currentSelected = Array.isArray(newAnswers[currentQuestionIndex]) ? newAnswers[currentQuestionIndex] : [];
    const requiredCount = currentQ.correctIndices?.length || 0;
    
    if (currentSelected.includes(optionIndex)) {
        newAnswers[currentQuestionIndex] = currentSelected.filter((i: number) => i !== optionIndex);
    } else {
        // Limit selection to required count
        if (currentSelected.length < requiredCount) {
            newAnswers[currentQuestionIndex] = [...currentSelected, optionIndex];
        } else {
            return; // Do nothing if limit reached
        }
    }
    setAnswers(newAnswers);
  };

  const handleEssay = (text: string) => {
      const newAnswers = [...answers];
      newAnswers[currentQuestionIndex] = text;
      setAnswers(newAnswers);
  };

  const toggleDoubt = () => {
    const newDoubts = [...markedDoubts];
    newDoubts[currentQuestionIndex] = !newDoubts[currentQuestionIndex];
    setMarkedDoubts(newDoubts);
  };

  const calculateScore = () => {
      let score = 0;
      // Calculate based on ACTIVE (Randomized) Questions
      activeQuestions.forEach((q, idx) => {
          const answer = answers[idx];
          if (answer === null || answer === undefined) return;

          if ((q.type === 'PG' || q.type === 'TRUE_FALSE') && answer === q.correctIndex) {
              score += q.points;
          } else if (q.type === 'PG_KOMPLEKS' && q.correctIndices) {
              // Basic logic: if selected array matches correctIndices array (sorted)
              const selected = Array.isArray(answer) ? [...answer].sort() : [];
              const correct = [...q.correctIndices].sort();
              if (JSON.stringify(selected) === JSON.stringify(correct)) {
                  score += q.points;
              }
          } else if (q.type === 'MATCHING') {
              // answer is an object { leftSide: selectedRightSide }
              const correctMap = q.matchingCorrectMap;
              if (correctMap) {
                  let allCorrect = true;
                  const leftSides = Object.keys(correctMap);
                  for (const left of leftSides) {
                      if (answer[left] !== correctMap[left]) {
                          allCorrect = false;
                          break;
                      }
                  }
                  if (allCorrect) score += q.points;
              }
          }
          // Essay score is 0 by default until graded
      });
      return score;
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const isAnswered = (idx: number) => {
    const a = answers[idx];
    if (a === null || a === undefined) return false;
    if (Array.isArray(a)) return a.length > 0;
    if (typeof a === 'object' && !Array.isArray(a)) return Object.keys(a).length > 0;
    return String(a).trim() !== '';
  };

  const unansweredCount = activeQuestions.filter((_, idx) => !isAnswered(idx)).length;
  const doubtCount = markedDoubts.filter(d => d).length;

  const handleFinalSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    
    try {
        const score = calculateScore();
        setFinalScore(score);
        
        // Clear persistence on finish
        localStorage.removeItem(timeKey);
        localStorage.removeItem(cheatKey);
        localStorage.removeItem(questionsKey);
        localStorage.removeItem(answersKey);
        localStorage.removeItem(doubtsKey);
        localStorage.removeItem(indexKey);
        localStorage.removeItem(frozenKey);
        localStorage.removeItem(freezeTimeKey);

        // Format answers for review
        const formattedAnswers = activeQuestions.map((q, idx) => {
            const answer = answers[idx];
            let isCorrect = false;
            let storedAnswer = answer;

            if (answer === null || answer === undefined) {
                isCorrect = false;
            } else if (q.type === 'PG' || q.type === 'TRUE_FALSE') {
                if (answer === q.correctIndex) {
                    isCorrect = true;
                }
                // For PG (not TRUE_FALSE), store the TEXT value to handle shuffling
                if (q.type === 'PG' && q.options && q.options[answer]) {
                    storedAnswer = q.options[answer];
                }
            } else if (q.type === 'PG_KOMPLEKS' && q.correctIndices) {
                const selected = Array.isArray(answer) ? [...answer].sort() : [];
                const correct = [...q.correctIndices].sort();
                if (JSON.stringify(selected) === JSON.stringify(correct)) {
                    isCorrect = true;
                }
                // Store TEXT values for PG_KOMPLEKS
                if (Array.isArray(answer)) {
                    storedAnswer = answer.map((i: number) => q.options[i]);
                }
            } else if (q.type === 'MATCHING' && q.matchingCorrectMap) {
                let allCorrect = true;
                const leftSides = Object.keys(q.matchingCorrectMap);
                for (const left of leftSides) {
                    // answer is likely an object { left: right }
                    if (!answer || answer[left] !== q.matchingCorrectMap[left]) {
                        allCorrect = false;
                        break;
                    }
                }
                if (allCorrect) isCorrect = true;
            }

            return {
                questionId: q.id,
                answer: storedAnswer,
                isCorrect: isCorrect
            };
        });

        const result: ExamResult = {
          id: `res-${Date.now()}`,
          studentId: user.id,
          studentName: user.name,
          examId: exam.id,
          examTitle: exam.title,
          score,
          totalQuestions: activeQuestions.length,
          cheatingAttempts,
          submittedAt: new Date().toISOString(),
          answers: formattedAnswers
        };

        await db.submitResult(result);
        setShowConfirmFinishModal(false);
        setShowScoreModal(true);
    } catch (error: any) {
        console.error("Failed to submit exam:", error);
        alert(`Gagal menyimpan jawaban: ${error.message || 'Terjadi kesalahan'}. Silakan coba lagi.`);
    } finally {
        setIsSubmitting(false);
    }
  };

  const currentQ = activeQuestions[currentQuestionIndex];
  
  if (!currentQ) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-gray-50">
              <div className="text-center p-8 bg-white rounded-lg shadow-lg">
                  <h2 className="text-2xl font-bold text-gray-700 mb-2">Memuat Soal...</h2>
                  <p className="text-gray-500 mb-4">Mempersiapkan ujian Anda.</p>
                  <button 
                      onClick={() => window.location.reload()} 
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                      Muat Ulang Halaman
                  </button>
              </div>
          </div>
      );
  }

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h > 0 ? h + ':' : ''}${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const getFontSizeClass = () => {
    switch(fontSize) {
      case 'sm': return 'text-sm';
      case 'lg': return 'text-xl';
      default: return 'text-base';
    }
  };

  // --- Render Answer Inputs based on Type ---
  const renderAnswerInput = (q: Question) => {
      if (q.type === 'PG' || q.type === 'TRUE_FALSE') {
          const options = q.type === 'TRUE_FALSE' ? ['Benar', 'Salah'] : q.options;
          return (
            <div className="grid grid-cols-1 gap-4">
                {options?.map((opt, idx) => (
                    <label key={idx} className="cursor-pointer group flex items-start h-full">
                        <input 
                            type="radio" 
                            name={`answer-${q.id}`} 
                            className="peer sr-only exam-radio"
                            checked={answers[currentQuestionIndex] === idx}
                            onChange={() => handleSingleChoice(idx)}
                        />
                        <div className="w-full p-4 rounded-lg border border-gray-200 hover:bg-gray-50 transition-all flex items-center group-hover:border-blue-400 h-full">
                            <div className="w-8 h-8 rounded-full border-2 border-gray-300 mr-3 flex-shrink-0 flex items-center justify-center radio-dot transition-all font-bold text-gray-400" style={{ '--tw-border-color': themeColor } as React.CSSProperties}>
                                {String.fromCharCode(65+idx)}
                            </div>
                            <span className={`${getFontSizeClass()} text-gray-700`}>{opt}</span>
                        </div>
                    </label>
                ))}
            </div>
          );
      } else if (q.type === 'PG_KOMPLEKS') {
          const requiredCount = q.correctIndices?.length || 0;
          const currentSelected = Array.isArray(answers[currentQuestionIndex]) ? answers[currentQuestionIndex] : [];
          const isLimitReached = currentSelected.length >= requiredCount;

          return (
            <div className="grid grid-cols-1 gap-3">
                <div className="flex justify-between items-center mb-2">
                    <p className="text-sm italic" style={{ color: themeColor }}>* Pilih {requiredCount} jawaban</p>
                    <span className="text-xs font-bold px-2 py-1 bg-gray-100 rounded-full text-gray-600">
                        {currentSelected.length} / {requiredCount} Terpilih
                    </span>
                </div>
                {q.options?.map((opt, idx) => {
                    const isChecked = currentSelected.includes(idx);
                    const isDisabled = isLimitReached && !isChecked;

                    return (
                        <label key={idx} className={`flex items-start ${isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer group'}`}>
                            <input 
                                type="checkbox" 
                                className="peer sr-only"
                                checked={isChecked}
                                onChange={() => handleMultiChoice(idx)}
                                disabled={isDisabled}
                            />
                            <div 
                                className={`w-full p-3 rounded-lg border border-gray-200 transition-all flex items-center ${!isDisabled ? 'hover:bg-gray-50 group-hover:border-blue-400' : ''} ${isChecked ? 'bg-blue-50' : ''}`}
                                style={{ borderColor: isChecked ? themeColor : undefined }}
                            >
                                <div 
                                    className="w-6 h-6 rounded border-2 border-gray-300 mr-3 flex-shrink-0 flex items-center justify-center transition-colors"
                                    style={{
                                        backgroundColor: isChecked ? themeColor : 'transparent',
                                        borderColor: isChecked ? themeColor : '#d1d5db'
                                    }}
                                >
                                    <CheckCircle size={14} className={`text-white transition-opacity ${isChecked ? 'opacity-100' : 'opacity-0'}`} />
                                </div>
                                <span className={`${getFontSizeClass()} text-gray-700`}>{opt}</span>
                            </div>
                        </label>
                    );
                })}
            </div>
          );
      } else if (q.type === 'MATCHING') {
          const leftSides = q.options || [];
          const rightSides = q.matchingRights || [];
          const currentAnswer = (typeof answers[currentQuestionIndex] === 'object' && answers[currentQuestionIndex] !== null && !Array.isArray(answers[currentQuestionIndex])) ? answers[currentQuestionIndex] : {};

          return (
              <div className="space-y-4">
                  <p className="text-sm italic mb-2" style={{ color: themeColor }}>* Jodohkan pernyataan di kiri dengan jawaban di kanan</p>
                  {leftSides.map((left, idx) => (
                      <div key={idx} className="flex flex-col md:flex-row items-center gap-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
                          <div className="flex-1 font-bold text-gray-700 text-sm">{left}</div>
                          <div className="hidden md:block text-gray-400">→</div>
                          <select 
                            className="flex-1 border rounded-lg p-2 text-sm bg-white focus:ring-2 outline-none"
                            style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
                            value={currentAnswer[left] || ''}
                            onChange={(e) => {
                                const newAnswers = [...answers];
                                newAnswers[currentQuestionIndex] = { ...currentAnswer, [left]: e.target.value };
                                setAnswers(newAnswers);
                            }}
                          >
                              <option value="">Pilih Jawaban...</option>
                              {rightSides.map((right: string, rIdx: number) => (
                                  <option key={rIdx} value={right}>{right}</option>
                              ))}
                          </select>
                      </div>
                  ))}
              </div>
          );
      } else if (q.type === 'URAIAN') {
          return (
              <div className="mt-2">
                  <p className="text-sm italic mb-2" style={{ color: themeColor }}>* Jawablah uraian di bawah ini</p>
                  <textarea 
                      className="w-full h-40 border border-gray-300 rounded-lg p-4 focus:ring-2 outline-none"
                      style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
                      placeholder="Ketik jawaban Anda di sini..."
                      value={answers[currentQuestionIndex] || ''}
                      onChange={(e) => handleEssay(e.target.value)}
                  ></textarea>
              </div>
          );
      }
      return null;
  };

  // Magnifier Mouse Handler
  const handleImageMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - left) / width) * 100;
    const y = ((e.clientY - top) / height) * 100;
    
    // Set Custom Properties for transform-origin
    e.currentTarget.style.setProperty('--zoom-x', `${x}%`);
    e.currentTarget.style.setProperty('--zoom-y', `${y}%`);
  };

  const canGoNext = useMemo(() => {
    if (!currentQ) return false;
    if (currentQ.type === 'PG_KOMPLEKS') {
        if (markedDoubts[currentQuestionIndex]) return true;
        const currentCount = (Array.isArray(answers[currentQuestionIndex]) ? answers[currentQuestionIndex] : []).length;
        if (currentCount === 0) return true; // Can skip if no answer selected
        const requiredCount = currentQ.correctIndices?.length || 0;
        return currentCount === requiredCount;
    }
    return true;
  }, [currentQ, answers, currentQuestionIndex, markedDoubts]);

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((e) => {
        console.error(`Error attempting to enable full-screen mode: ${e.message}`);
      });
    }
  };

  return (
    <div 
      className="h-screen bg-white flex flex-col font-sans relative select-none overflow-hidden"
      onClick={handleFullscreen}
    >
      
      {/* Lightbox / Image Preview Modal */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-[70] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200 cursor-zoom-out"
          onClick={() => setPreviewImage(null)}
        >
           <button 
             className="absolute top-6 right-6 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-all z-50"
             onClick={() => setPreviewImage(null)}
           >
              <X size={32} />
           </button>
           
           <img 
              src={previewImage} 
              alt="Preview" 
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-300"
              onClick={(e) => e.stopPropagation()} // Optional: keep modal open if clicking image itself, but user said "click image to zoom out", usually implies clicking away or toggle. I'll let click close it for simplicity or add specific logic.
           />
           <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/80 text-sm bg-black/50 px-4 py-2 rounded-full pointer-events-none">
              Klik dimana saja untuk menutup
           </div>
        </div>
      )}

      {/* QUESTION LIST MODAL (Daftar Soal JOS JIS) */}
      {showQuestionListModal && (
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm flex justify-end" onClick={() => setShowQuestionListModal(false)}>
              <div 
                  className="bg-white w-full md:w-96 h-full shadow-2xl p-6 overflow-y-auto animate-in slide-in-from-right duration-300 relative"
                  onClick={e => e.stopPropagation()}
              >
                  <div className="flex justify-between items-center mb-6 border-b pb-4">
                      <h3 className="text-xl font-bold text-gray-800">Daftar Soal</h3>
                      <button onClick={() => setShowQuestionListModal(false)} className="p-2 hover:bg-gray-100 rounded-full transition"><X/></button>
                  </div>
                  
                  <div className="grid grid-cols-5 gap-3">
                      {activeQuestions.map((q, idx) => {
                          const isAnswered = answers[idx] !== null && answers[idx] !== undefined && (Array.isArray(answers[idx]) ? answers[idx].length > 0 : String(answers[idx]).trim() !== '');
                          const isCurrent = currentQuestionIndex === idx;
                          const isDoubt = markedDoubts[idx];
                          
                          let bgClass = 'bg-white border-gray-300 text-gray-700';
                          if (isCurrent) bgClass = 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-300';
                          else if (isDoubt) bgClass = 'bg-yellow-400 text-black border-yellow-500 font-bold';
                          else if (isAnswered) bgClass = 'bg-green-500 text-white border-green-600';

                          return (
                              <button
                                key={idx}
                                onClick={() => {
                                    if (!canGoNext && idx !== currentQuestionIndex) {
                                        alert(`Silakan selesaikan jawaban Soal nomor ${currentQuestionIndex + 1} terlebih dahulu atau klik Ragu-ragu.`);
                                        return;
                                    }
                                    setCurrentQuestionIndex(idx);
                                    setShowQuestionListModal(false);
                                }}
                                className={`w-full aspect-square flex items-center justify-center rounded-lg border-2 text-sm font-bold transition hover:scale-105 active:scale-95 shadow-sm ${bgClass}`}
                              >
                                  {idx + 1}
                              </button>
                          )
                      })}
                  </div>

                  <div className="mt-8 pt-4 border-t space-y-2 text-xs text-gray-600 font-medium">
                      <div className="flex items-center gap-2"><div className="w-4 h-4 bg-green-500 rounded border border-green-600"></div> Sudah Dijawab</div>
                      <div className="flex items-center gap-2"><div className="w-4 h-4 bg-yellow-400 rounded border border-yellow-500"></div> Ragu-ragu</div>
                      <div className="flex items-center gap-2"><div className="w-4 h-4 bg-white rounded border border-gray-300"></div> Belum Dijawab</div>
                      <div className="flex items-center gap-2"><div className="w-4 h-4 bg-blue-600 rounded border border-blue-600"></div> Sedang Dikerjakan</div>
                  </div>
              </div>
          </div>
      )}

      {/* Frozen Overlay (JOS JIS SYSTEM) */}
      {isFrozen && (
          <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center text-center p-8 backdrop-blur-xl">
              <ShieldAlert className="w-24 h-24 text-red-500 mb-6 animate-pulse" />
              <h2 className="text-4xl font-black text-white mb-2 uppercase tracking-widest">SISTEM TERKUNCI</h2>
              <p className="text-red-400 text-xl mb-8 font-bold">Terdeteksi Aktivitas Mencurigakan! (Pelanggaran #{cheatingAttempts})</p>
              
              <div className="w-64 h-64 relative flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-4 border-gray-700"></div>
                  <div className="absolute inset-0 rounded-full border-t-4 border-red-500 animate-spin"></div>
                  <div className="text-6xl font-mono font-bold text-white">{freezeTimeLeft}</div>
              </div>
              <p className="text-gray-400 mt-8 max-w-md">Layar Anda dibekukan karena terdeteksi meninggalkan halaman ujian. Waktu pembekuan akan <strong>BERLIPAT GANDA</strong> jika Anda mengulanginya lagi.</p>
          </div>
      )}

      {/* TIME ALERT POPUP (WARNING 5 MIN / 1 MIN) */}
      {timeAlert && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center pointer-events-none px-4">
              <div className="bg-orange-500 text-white px-8 py-6 rounded-2xl shadow-2xl flex flex-col items-center animate-in zoom-in duration-300 border-4 border-white ring-4 ring-orange-200/50 max-w-sm w-full text-center">
                  <Clock size={48} className="mb-3 animate-pulse text-white drop-shadow-md" />
                  <h2 className="text-2xl font-bold mb-1 leading-tight">{timeAlert.title}</h2>
                  <p className="font-medium text-orange-100 text-sm uppercase tracking-wider">{timeAlert.subtitle}</p>
              </div>
          </div>
      )}

      {/* Score Popup Modal */}
      {showScoreModal && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-500">
              
              {/* Confetti Effect */}
              <Confetti />

              <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-8 text-center animate-in zoom-in-95 duration-300 border-4 border-white ring-8 ring-blue-500/20 relative z-50">
                  <div className="w-24 h-24 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner animate-bounce">
                      <Trophy className="w-12 h-12 text-yellow-600" />
                  </div>
                  <h2 className="text-3xl font-extrabold text-gray-800 mb-2">Ujian Selesai!</h2>
                  
                  {/* Motivational Quote */}
                  <p className="text-gray-600 mb-6 italic text-sm">
                      "{getMotivation(finalScore, maxPossibleScore, user.name)}"
                  </p>
                  
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 mb-8 border border-blue-200 shadow-inner">
                      <p className="text-xs font-bold uppercase tracking-wider text-blue-500">Nilai Perolehan</p>
                      <p className="text-6xl font-extrabold mt-2 text-blue-700">{finalScore}</p>
                  </div>

                  <button 
                    onClick={onComplete}
                    className="w-full text-white font-bold py-3.5 rounded-xl shadow-lg transition transform hover:-translate-y-1 hover:shadow-xl active:scale-95"
                    style={{ backgroundColor: themeColor }}
                  >
                      Lanjut ke Mata Pelajaran Lain
                  </button>
              </div>
          </div>
      )}

      {/* Header Style - KEMDIKBUD LOGO */}
      <header className="text-white shadow-md z-10 sticky top-0" style={{ backgroundColor: themeColor }}>
        <div className="w-full px-[1.5cm] py-3 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <div className="bg-white p-1 rounded-full">
              <img 
                src="https://upload.wikimedia.org/wikipedia/commons/9/9c/Logo_of_Ministry_of_Education_and_Culture_of_Republic_of_Indonesia.svg" 
                className="h-8 w-8" 
                alt="Logo Kemdikbud"
              />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">{appName}</h1>
              <p className="text-xs text-blue-100">Online Based Test</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
             <div className="hidden md:flex flex-col text-right text-sm">
                 <span className="font-semibold">{user.username} - {user.name}</span>
                 <span className="opacity-80">{user.school} | Kelas {user.class || user.grade}</span>
             </div>
             <div className="bg-black/20 px-3 py-1 rounded text-sm font-mono flex items-center">
                 <Timer size={16} className="mr-2"/> {formatTime(timeLeft)}
             </div>
          </div>
        </div>
      </header>

      {/* Toolbar */}
      <div className="bg-white border-b px-[1.5cm] py-2 flex justify-between items-center w-full sticky top-[60px] z-10">
          <div className="flex items-center space-x-4">
              <span className="font-bold text-gray-700">Soal nomor {currentQuestionIndex + 1}</span>
              <div className="flex items-center space-x-2 text-gray-500 text-sm border-l pl-4">
                  <span>Ukuran font:</span>
                  <button onClick={() => setFontSize('sm')} className={`hover:text-black ${fontSize === 'sm' ? 'text-black font-bold' : ''}`}>A</button>
                  <button onClick={() => setFontSize('base')} className={`hover:text-black text-lg ${fontSize === 'base' ? 'text-black font-bold' : ''}`}>A</button>
                  <button onClick={() => setFontSize('lg')} className={`hover:text-black text-xl ${fontSize === 'lg' ? 'text-black font-bold' : ''}`}>A</button>
              </div>
          </div>
          <div className="flex items-center space-x-2">
               <button 
                onClick={() => setShowQuestionListModal(true)}
                className="flex items-center px-3 py-1 bg-white border border-gray-300 rounded text-sm hover:bg-gray-50 text-gray-700 shadow-sm active:bg-gray-100"
               >
                   <Grid3X3 size={16} className="mr-1"/> Daftar Soal
               </button>
          </div>
      </div>

      {/* Main Content Split */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden w-full p-0 flex flex-col md:flex-row gap-0 px-[1.5cm]">
        {/* Left: Question (60%) */}
        <div className="w-full md:w-[60%] bg-white p-6 exam-content border-r border-gray-100 overflow-x-hidden">
            {currentQ.imgUrl && currentQ.imgUrl.trim() !== '' && (
                 <div 
                    className="mb-4 max-w-full relative group overflow-hidden rounded-lg cursor-zoom-in"
                    onMouseMove={handleImageMouseMove}
                    onClick={() => setPreviewImage(currentQ.imgUrl || null)}
                    style={{ '--zoom-x': '50%', '--zoom-y': '50%' } as React.CSSProperties}
                 >
                     <img 
                        src={currentQ.imgUrl} 
                        alt="Soal" 
                        className="w-full h-auto object-contain transition-transform duration-200 ease-out group-hover:scale-[2.5]"
                        style={{ transformOrigin: 'var(--zoom-x) var(--zoom-y)' }}
                        onError={(e) => e.currentTarget.parentElement!.style.display = 'none'} 
                     />
                     
                     {/* Magnifier Hint Overlay */}
                     <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-sm text-white text-[10px] px-2 py-1 rounded-full opacity-80 transition-opacity pointer-events-none flex items-center group-hover:opacity-0">
                        <Maximize2 size={12} className="mr-1"/> Klik untuk Memperbesar
                     </div>
                 </div>
            )}
            <div ref={questionRef} className="overflow-hidden bg-white mb-4">
                <ReactQuill 
                    theme="snow" 
                    value={currentQ.text} 
                    readOnly={true} 
                    modules={{ toolbar: false }}
                    className="read-only-quill"
                />
            </div>
            <style>{`
                .read-only-quill .ql-container.ql-snow { border: 0 !important; }
                .read-only-quill .ql-editor { padding: 0 !important; font-size: ${fontSize === 'sm' ? '14px' : fontSize === 'lg' ? '20px' : '16px'}; line-height: 1.6; color: #1f2937; font-family: inherit; }
            `}</style>
        </div>

        {/* Right: Options / Answers (40%) */}
        <div className="w-full md:w-[40%] exam-content p-6 bg-gray-50/30 overflow-x-hidden">
            {renderAnswerInput(currentQ)}
        </div>
      </main>

      {/* Footer Navigation */}
      <footer className="bg-white border-t p-4 sticky bottom-0 z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
          <div className="w-full flex justify-between items-center px-[1.5cm]">
              <button 
                onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
                disabled={currentQuestionIndex === 0}
                className="flex items-center px-4 py-2 bg-btn-danger text-white rounded font-medium hover:bg-red-600 disabled:opacity-50 transition"
              >
                 <ChevronLeft size={20} className="mr-1"/> Soal sebelumnya
              </button>

              <div className="flex space-x-4">
                  <button 
                    onClick={toggleDoubt}
                    className={`flex items-center px-6 py-2 rounded font-medium transition text-black ${markedDoubts[currentQuestionIndex] ? 'bg-yellow-400' : 'bg-btn-warning'}`}
                  >
                      <input type="checkbox" checked={markedDoubts[currentQuestionIndex]} readOnly className="mr-2 w-4 h-4" /> Ragu-ragu
                  </button>
              </div>

              {currentQuestionIndex === activeQuestions.length - 1 ? (
                   <button 
                    onClick={() => {
                        if (!canGoNext) return;
                        const antiSubmitSeconds = (settings.antiCheat.antiSubmitTime || 0) * 60;
                        if (settings.antiCheat.antiSubmitEnabled && timeLeft > antiSubmitSeconds) {
                            return;
                        }
                        setShowConfirmFinishModal(true);
                    }}
                    disabled={(settings.antiCheat.antiSubmitEnabled && timeLeft > (settings.antiCheat.antiSubmitTime || 0) * 60) || !canGoNext}
                    className="flex items-center px-4 py-2 text-white rounded font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: themeColor }}
                   >
                     {settings.antiCheat.antiSubmitEnabled && timeLeft > (settings.antiCheat.antiSubmitTime || 0) * 60 ? (
                         <span className="flex items-center">
                             <Clock size={16} className="mr-2 animate-pulse" />
                             Tunggu {formatTime(timeLeft - (settings.antiCheat.antiSubmitTime || 0) * 60)}
                         </span>
                     ) : (
                         <>Selesai <ChevronRight size={20} className="ml-1"/></>
                     )}
                   </button>
              ) : (
                  <button 
                    onClick={() => {
                        if (canGoNext) {
                            setCurrentQuestionIndex(prev => Math.min(activeQuestions.length - 1, prev + 1));
                        }
                    }}
                    disabled={!canGoNext}
                    className="flex items-center px-4 py-2 text-white rounded font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: themeColor }}
                  >
                     Soal berikutnya <ChevronRight size={20} className="ml-1"/>
                  </button>
              )}
          </div>
      </footer>

      {/* CONFIRM FINISH MODAL */}
      {showConfirmFinishModal && (
          <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
              <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-300">
                  <div className="p-6 text-center">
                      <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <CheckCircle className="text-blue-600 w-10 h-10" />
                      </div>
                      <h3 className="text-xl font-bold text-gray-800 mb-2">Konfirmasi Selesai</h3>
                      <p className="text-gray-500 text-sm mb-6">Apakah Anda yakin ingin mengakhiri ujian ini? Periksa kembali ringkasan pengerjaan Anda:</p>
                      
                      <div className="grid grid-cols-1 gap-3 mb-6">
                          <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border">
                              <span className="text-sm text-gray-600">Sisa Waktu</span>
                              <span className="font-bold text-blue-600">{formatTime(timeLeft)}</span>
                          </div>
                          <div className={`flex justify-between items-center p-3 rounded-lg border ${unansweredCount > 0 ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
                              <span className="text-sm text-gray-600">Belum Dijawab</span>
                              <span className={`font-bold ${unansweredCount > 0 ? 'text-red-600' : 'text-green-600'}`}>{unansweredCount} Soal</span>
                          </div>
                          <div className={`flex justify-between items-center p-3 rounded-lg border ${doubtCount > 0 ? 'bg-yellow-50 border-yellow-100' : 'bg-green-50 border-green-100'}`}>
                              <span className="text-sm text-gray-600">Ragu-ragu</span>
                              <span className={`font-bold ${doubtCount > 0 ? 'text-yellow-600' : 'text-green-600'}`}>{doubtCount} Soal</span>
                          </div>
                      </div>

                      {(unansweredCount > 0 || doubtCount > 0) ? (
                          <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 text-xs font-bold mb-6 flex items-start gap-2 text-left">
                              <ShieldAlert size={16} className="flex-shrink-0 mt-0.5" />
                              <span>Anda tidak dapat mengakhiri ujian karena masih ada soal yang belum dijawab atau masih dalam status ragu-ragu.</span>
                          </div>
                      ) : (
                          <div className="bg-green-50 text-green-600 p-4 rounded-xl border border-green-100 text-xs font-bold mb-6 flex items-start gap-2 text-left">
                              <CheckCircle size={16} className="flex-shrink-0 mt-0.5" />
                              <span>Semua soal telah dijawab dengan yakin. Anda dapat mengakhiri ujian sekarang.</span>
                          </div>
                      )}

                      <div className="flex gap-3">
                          <button 
                            onClick={() => setShowConfirmFinishModal(false)}
                            className="flex-1 py-3 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition"
                          >
                              Kembali
                          </button>
                          <button 
                            onClick={handleFinalSubmit}
                            disabled={unansweredCount > 0 || doubtCount > 0 || isSubmitting}
                            className="flex-1 py-3 rounded-xl font-bold text-white shadow-lg transition transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ backgroundColor: themeColor }}
                          >
                              {isSubmitting ? 'Menyimpan...' : 'Selesai'}
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};