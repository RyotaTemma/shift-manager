// src/App.jsx

import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { doc, collection, onSnapshot, deleteDoc } from 'firebase/firestore';
import { CheckCircle, AlertTriangle, Loader2, Settings, User, PlusCircle, Edit3, Trash2, Users, CalendarDays, Clock, ServerCrash, Table } from 'lucide-react'; // Added ServerCrash and Table icons

import { auth, db, appIdForPaths as appId } from './lib/firebaseConfig';
import { DAYS_OF_WEEK_JP, PERIOD_DEFINITIONS, DEFAULT_OPERATION_SETTINGS, ALL_SUBJECTS_MASTER } from './lib/constants';
import Modal from './components/Modal';
import AdminSettingsForm from './components/AdminSettingsForm';
import TeacherForm from './components/TeacherForm';
import StudentForm from './components/StudentForm';
import ConfirmationDialog from './components/ConfirmationDialog';
import { formatDateToYyyyMmDd } from './lib/utils';


export default function App() {
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [adminSettings, setAdminSettings] = useState(DEFAULT_OPERATION_SETTINGS);
  const [isTeacherModalOpen, setIsTeacherModalOpen] = useState(false);
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [isAdminSettingsModalOpen, setIsAdminSettingsModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [editingStudent, setEditingStudent] = useState(null);
  const [isLoadingTeachers, setIsLoadingTeachers] = useState(true);
  const [isLoadingStudents, setIsLoadingStudents] = useState(true);
  const [isLoadingAdminSettings, setIsLoadingAdminSettings] = useState(true);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [notificationType, setNotificationType] = useState('success');
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [deleteAction, setDeleteAction] = useState(null);

  // New states for schedule generation result and loading/error status
  const [generatedSchedule, setGeneratedSchedule] = useState(null);
  const [isGeneratingSchedule, setIsGeneratingSchedule] = useState(false);
  const [scheduleGenerationError, setScheduleGenerationError] = useState(null);


  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
        setIsAuthReady(true);
      } else {
        try {
          const token = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
          if (token) {
            await signInWithCustomToken(auth, token);
          } else {
            await signInAnonymously(auth);
          }
        } catch (error) {
          console.error("Auth Error:", error);
          displayNotification(`認証エラー: ${error.message}`, 'error');
          setUserId(crypto.randomUUID());
          setIsAuthReady(true);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const displayNotification = (message, type = 'success') => {
    setNotificationMessage(message);
    setNotificationType(type);
    setShowNotification(true);
    setTimeout(() => {
      setShowNotification(false);
    }, 3000);
  };

  useEffect(() => {
    if (!isAuthReady) {
      setIsLoadingAdminSettings(false);
      return;
    }
    setIsLoadingAdminSettings(true);
    const settingsRef = doc(db, `artifacts/${appId}/public/data/adminConfig`, 'globalSettings');
    const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const mergedSettings = { ...DEFAULT_OPERATION_SETTINGS, ...data };
        setAdminSettings(mergedSettings);
      } else {
        setAdminSettings(DEFAULT_OPERATION_SETTINGS);
      }
      setIsLoadingAdminSettings(false);
    }, (error) => {
      console.error("Error fetching admin settings:", error);
      displayNotification(`管理設定の読み込みエラー: ${error.message}`, "error");
      setAdminSettings(DEFAULT_OPERATION_SETTINGS);
      setIsLoadingAdminSettings(false);
    });
    return () => unsubscribe();
  }, [isAuthReady]);

  useEffect(() => {
    if (!isAuthReady || !userId) {
      setIsLoadingTeachers(false);
      return;
    }
    setIsLoadingTeachers(true);
    const path = `artifacts/${appId}/users/${userId}/teachers`;
    const unsubscribe = onSnapshot(collection(db, path), (snapshot) => {
      setTeachers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      setIsLoadingTeachers(false);
    }, (error) => {
      console.error("Fetch teachers error:", error);
      displayNotification("講師データの読み込みに失敗しました。", "error");
      setIsLoadingTeachers(false);
    });
    return () => unsubscribe();
  }, [isAuthReady, userId]);

  useEffect(() => {
    if (!isAuthReady || !userId) {
      setIsLoadingStudents(false);
      return;
    }
    setIsLoadingStudents(true);
    const path = `artifacts/${appId}/users/${userId}/students`;
    const unsubscribe = onSnapshot(collection(db, path), (snapshot) => {
      setStudents(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      setIsLoadingStudents(false);
    }, (error) => {
      console.error("Fetch students error:", error);
      displayNotification("生徒データの読み込みに失敗しました。", "error");
      setIsLoadingStudents(false);
    });
    return () => unsubscribe();
  }, [isAuthReady, userId]);

  const openTeacherModal = (teacher = null) => { setEditingTeacher(teacher); setIsTeacherModalOpen(true); };
  const openStudentModal = (student = null) => { setEditingStudent(student); setIsStudentModalOpen(true); };
  const openAdminSettingsModal = () => setIsAdminSettingsModalOpen(true);

  const handleTeacherSave = () => displayNotification(editingTeacher ? "講師情報が更新されました。" : "講師が追加されました。");
  const handleStudentSave = () => displayNotification(editingStudent ? "生徒情報が更新されました。" : "生徒が追加されました。");
  const handleAdminSettingsSave = (updatedSettings) => {
    setAdminSettings(updatedSettings);
    displayNotification("管理設定が保存されました。");
  }

  const confirmDelete = (type, id) => {
    setItemToDelete({ type, id });
    setDeleteAction(() => async () => {
      try {
        const userSpecificPath = `artifacts/${appId}/users/${userId}`;
        if (type === 'teacher') {
          await deleteDoc(doc(db, `${userSpecificPath}/teachers`, id));
          displayNotification("講師情報が削除されました。");
        } else if (type === 'student') {
          await deleteDoc(doc(db, `${userSpecificPath}/students`, id));
          displayNotification("生徒情報が削除されました。");
        }
      } catch (error) {
        console.error(`Error deleting ${type}:`, error);
        displayNotification(`${type === 'teacher' ? '講師' : '生徒'}の削除に失敗しました。`, "error");
      }
      setItemToDelete(null);
      setConfirmDialogOpen(false);
    });
    setConfirmDialogOpen(true);
  };

  const handleGenerateSchedule = async () => {
    if (teachers.length === 0 || students.length === 0) {
      displayNotification("講師と生徒を登録してからシフトを生成してください。", "error");
      return;
    }
    if (!adminSettings.commonShiftStartDate || !adminSettings.commonShiftEndDate) {
      displayNotification("共通シフト期間が設定されていません。管理設定を確認してください。", "error");
      return;
    }

    setIsGeneratingSchedule(true);
    setScheduleGenerationError(null);
    setGeneratedSchedule(null); // Clear previous schedule

    const scheduleInputData = {
      teachers: teachers.map(t => ({
        id: t.id,
        name: t.name,
        teachableSubjectsByAffiliation: t.teachableSubjectsByAffiliation || {},
        minDesiredPeriods: t.minDesiredPeriods,
        regularClasses: (t.regularClasses || []).map(rc => ({
          studentName: rc.studentName || '',
          studentAffiliation: rc.studentAffiliation || '',
          studentGrade: rc.studentGrade || '',
          subject: rc.subject || '',
          day: rc.day || '',
          period: rc.period || null,
        })),
        selectedDateSlots: t.selectedDateSlots || {},
      })),
      students: students.map(s => ({
        id: s.id,
        name: s.name,
        affiliation: s.affiliation,
        grade: s.grade,
        desiredCourses: (s.desiredCourses || []).map(dc => ({
          subject: dc.subject || '',
          units: dc.units || 0,
        })),
        schedulingPreference: s.schedulingPreference,
        idleTimePreference: s.idleTimePreference,
        availableLectureSlots: s.availableLectureSlots || {},
      })),
      adminSettings: {
        commonShiftStartDate: adminSettings.commonShiftStartDate,
        commonShiftEndDate: adminSettings.commonShiftEndDate,
        holidays: adminSettings.holidays || [],
        suspensionDays: adminSettings.suspensionDays || [],
        defaultShiftPeriodsByDay: adminSettings.defaultShiftPeriodsByDay || {},
        subjectSettingsByAffiliation: adminSettings.subjectSettingsByAffiliation || {},
      },
      constants: {
        DAYS_OF_WEEK_JP: DAYS_OF_WEEK_JP,
        PERIOD_DEFINITIONS: PERIOD_DEFINITIONS,
        ALL_SUBJECTS_MASTER: ALL_SUBJECTS_MASTER,
      }
    };

    try {
      // Attempt to send data to a local Python server
      // The Python server is responsible for saving the input data to `python_shift_solver` if needed,
      // running the shift algorithm, and returning the result.
      const response = await fetch('http://localhost:5001/generate_schedule', { // Example endpoint
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(scheduleInputData),
      });

      if (!response.ok) {
        let errorMsg = `サーバーエラー: ${response.status}`;
        try {
            const errorData = await response.json();
            errorMsg = errorData.message || errorData.error || errorMsg;
        } catch (e) {
            // If response is not JSON, use the status text
            errorMsg = response.statusText || errorMsg;
        }
        throw new Error(errorMsg);
      }

      const result = await response.json();
      setGeneratedSchedule(result);
      displayNotification("シフトが生成されました。", "success");

    } catch (error) {
      console.error("Shift generation error:", error);
      setScheduleGenerationError(`シフト生成に失敗しました: ${error.message}. Pythonサーバーがローカルで正しく実行されているか確認してください。`);
      displayNotification(`シフト生成エラー: ${error.message}`, "error");
    } finally {
      setIsGeneratingSchedule(false);
    }
  };

  if (!isAuthReady || isLoadingAdminSettings) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col justify-center items-center p-4">
        <Loader2 className="animate-spin h-16 w-16 text-indigo-500" />
        <p className="mt-4 text-gray-600">初期情報を読み込み中...</p>
      </div>
    );
  }

  // Helper function to render the generated schedule (example)
  const renderGeneratedSchedule = () => {
    if (!generatedSchedule) return null;

    // Example: Displaying a simple list of assignments
    // You'll need to adapt this based on the actual structure of your schedule result
    if (!generatedSchedule.assignments || generatedSchedule.assignments.length === 0) {
      return <p className="text-gray-500">割り当てられたシフトはありません。</p>;
    }

    return (
      <div className="mt-4 space-y-3">
        {generatedSchedule.assignments.map((assignment, index) => (
          <div key={index} className="p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="font-semibold text-green-700">
              {assignment.date} ({DAYS_OF_WEEK_JP[new Date(assignment.date).getDay()]}) - {PERIOD_DEFINITIONS[assignment.period]?.label || `時限 ${assignment.period}`}
            </p>
            <p className="text-sm text-gray-600">講師: {assignment.teacherName}</p>
            <p className="text-sm text-gray-600">生徒: {assignment.studentName}</p>
            <p className="text-sm text-gray-600">科目: {assignment.subject}</p>
          </div>
        ))}
      </div>
    );
  };


  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6 lg:p-8 font-sans">
      {showNotification && (
        <div className={`fixed top-5 right-5 p-4 rounded-md shadow-lg text-white z-[100] flex items-center
          ${notificationType === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
          {notificationType === 'success' ? <CheckCircle size={20} className="mr-2"/> : <AlertTriangle size={20} className="mr-2"/>}
          {notificationMessage}
          <button onClick={() => setShowNotification(false)} className="ml-4 text-xl font-bold">&times;</button>
        </div>
      )}

      <header className="mb-8 p-4 bg-white shadow rounded-lg">
        <div className="flex flex-wrap justify-between items-center gap-4">
            <h1 className="text-3xl font-bold text-indigo-700">塾シフト管理システム</h1>
            <button onClick={openAdminSettingsModal} className="bg-slate-600 hover:bg-slate-700 text-white font-medium py-2 px-4 rounded-md flex items-center text-sm"><Settings size={18} className="mr-2"/> 管理情報編集</button>
        </div>
        {userId && <p className="text-xs text-gray-500 mt-1">UID: {userId}</p>}
        {(!adminSettings.commonShiftStartDate || !adminSettings.commonShiftEndDate) && !isLoadingAdminSettings && (
            <div className="mt-2 p-2 bg-yellow-50 border border-yellow-300 rounded-md text-yellow-700 text-sm flex items-center"><AlertTriangle size={16} className="inline mr-2" />共通シフト入力期間が未設定です。「管理情報編集」から設定してください。</div>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white p-6 rounded-lg shadow">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold text-gray-800 flex items-center"><User className="mr-2 text-indigo-600"/>講師管理</h2>
            <button onClick={() => openTeacherModal()} className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-md flex items-center"><PlusCircle size={20} className="mr-2"/> 新規講師追加</button>
          </div>
          {isLoadingTeachers ? <p className="text-gray-500 flex items-center"><Loader2 className="animate-spin mr-2 h-5 w-5"/>講師情報読込中...</p> :
            teachers.length === 0 ? <p className="text-gray-500">登録講師なし</p> :
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
              {teachers.map(teacher => (
                <div key={teacher.id} className="p-4 border rounded-lg hover:shadow-md">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-semibold text-indigo-700">{teacher.name}</h3>
                      <div className="text-sm text-gray-600">
                        指導可能:
                        {Object.entries(teacher.teachableSubjectsByAffiliation || {}).map(([aff, subList]) => (
                            subList && subList.length > 0 ? <span key={aff} className="ml-1 mr-2 p-1 bg-indigo-100 text-indigo-700 text-xs rounded">{aff}: {subList.join(', ')}</span> : null
                        ))}
                        {Object.keys(teacher.teachableSubjectsByAffiliation || {}).length === 0 && Object.values(teacher.teachableSubjectsByAffiliation || {}).every(list => !list || list.length === 0) && <span className="ml-1 text-xs">未設定</span>}
                      </div>
                      <p className="text-sm text-gray-600">最低コマ数/日: {teacher.minDesiredPeriods || '未設定'}コマ</p>
                      <details className="text-xs text-gray-500 mt-1 cursor-pointer">
                        <summary className="font-medium">通常授業 ({teacher.regularClasses?.length || 0}件)</summary>
                        {teacher.regularClasses && teacher.regularClasses.length > 0 ? (
                          <ul className="list-disc list-inside pl-2 mt-1 space-y-0.5">
                          {teacher.regularClasses.map((rc, idx) => (
                              <li key={idx}>{rc.studentName} ({rc.studentAffiliation} {rc.studentGrade}) - {rc.subject} ({rc.day}曜 {rc.period ? PERIOD_DEFINITIONS[rc.period]?.label : '時限未設定'})</li>
                          ))}
                          </ul>
                      ) : <p className="italic text-xs pl-2">通常授業はありません。</p>}
                    </details>
                    {teacher.selectedDateSlots && Object.keys(teacher.selectedDateSlots).length > 0 && (
                      <details className="text-xs text-gray-500 mt-1 cursor-pointer">
                          <summary className="font-medium">希望日時限 ({Object.keys(teacher.selectedDateSlots).length}日分)</summary>
                          <div className="pl-2 mt-1 max-h-24 overflow-y-auto">
                              {Object.entries(teacher.selectedDateSlots)
                              .sort(([dateA], [dateB]) => new Date(dateA).getTime() - new Date(dateB).getTime())
                              .map(([date, slots]) => (
                                  <p key={date}><strong>{formatDateToYyyyMmDd(date).substring(5)} ({DAYS_OF_WEEK_JP[new Date(date).getDay()]}):</strong> {slots.map(p => PERIOD_DEFINITIONS[p]?.label || `時限${p}`).join(', ')}</p>
                              ))}
                          </div>
                      </details>
                    )}
                  </div>
                  <div className="flex space-x-2 items-center flex-shrink-0">
                    <button onClick={() => openTeacherModal(teacher)} className="text-blue-500 p-1 hover:bg-blue-100 rounded-full"><Edit3 size={18}/></button>
                    <button onClick={() => confirmDelete('teacher', teacher.id)} className="text-red-500 p-1 hover:bg-red-100 rounded-full"><Trash2 size={18}/></button>
                  </div>
                </div>
                </div>
              ))}
            </div>
          }
        </section>

        <section className="bg-white p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-semibold text-gray-800 flex items-center"><Users className="mr-2 text-teal-600"/>生徒管理</h2>
                <button
                onClick={() => openStudentModal()}
                className="bg-teal-600 hover:bg-teal-700 text-white font-medium py-2 px-4 rounded-md flex items-center transition duration-150 ease-in-out"
                >
                <PlusCircle size={20} className="mr-2"/> 新規生徒追加
                </button>
            </div>
            {isLoadingStudents ? <p className="text-gray-500 flex items-center"><Loader2 className="animate-spin mr-2 h-5 w-5"/>生徒情報読込中...</p> :
                students.length === 0 ? <p className="text-gray-500">登録生徒なし</p> :
                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                {students.map(student => (
                    <div key={student.id} className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start">
                        <div>
                        <h3 className="text-lg font-semibold text-teal-700">{student.name}</h3>
                        <p className="text-sm text-gray-600">{student.affiliation} - {student.grade}</p>
                        <details className="text-xs text-gray-500 mt-1 cursor-pointer">
                        <summary className="font-medium">希望科目 ({student.desiredCourses?.length || 0}件)</summary>
                            {student.desiredCourses && student.desiredCourses.length > 0 ? (
                                <ul className="list-disc list-inside pl-2 mt-1">
                                {student.desiredCourses.map((dc, idx) => (
                                    <li key={idx}>{dc.subject}: {dc.units}コマ</li>
                                ))}
                                </ul>
                            ) : <p className="italic text-xs pl-2">希望科目はありません。</p>}
                        </details>
                         <details className="text-xs text-gray-500 mt-1 cursor-pointer">
                            <summary className="font-medium">受講可能枠 ({Object.keys(student.availableLectureSlots || {}).length}日分)</summary>
                            {student.availableLectureSlots && Object.keys(student.availableLectureSlots).length > 0 ? (
                                <div className="pl-2 mt-1 max-h-24 overflow-y-auto">
                                {Object.entries(student.availableLectureSlots)
                                .sort(([dateA], [dateB]) => new Date(dateA).getTime() - new Date(dateB).getTime())
                                .map(([date, slots]) => (
                                    <p key={date}><strong>{formatDateToYyyyMmDd(date).substring(5)} ({DAYS_OF_WEEK_JP[new Date(date).getDay()]}):</strong> {slots.map(p => PERIOD_DEFINITIONS[p]?.label || `時限${p}`).join(', ')}</p>
                                ))}
                                </div>
                            ) : <p className="italic text-xs pl-2">受講可能枠の希望はありません。</p>}
                        </details>
                        <p className="text-xs text-gray-500 mt-1">授業集中度: {student.schedulingPreference}</p>
                        <p className="text-xs text-gray-500 mt-1">空きコマ: {student.idleTimePreference}</p>
                        </div>
                        <div className="flex space-x-2 items-center flex-shrink-0">
                        <button onClick={() => openStudentModal(student)} className="text-blue-500 p-1 hover:bg-blue-100 rounded-full"><Edit3 size={18}/></button>
                        <button onClick={() => confirmDelete('student', student.id)} className="text-red-500 p-1 hover:bg-red-100 rounded-full"><Trash2 size={18}/></button>
                        </div>
                    </div>
                    </div>
                ))}
                </div>
            }
        </section>
      </div>

      <section className="mt-8 bg-white p-6 rounded-lg shadow">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center"><CalendarDays className="mr-2 text-purple-600"/>シフト生成</h2>
            <button
            onClick={handleGenerateSchedule}
            disabled={isGeneratingSchedule || teachers.length === 0 || students.length === 0 || isLoadingTeachers || isLoadingStudents || isLoadingAdminSettings || !adminSettings.commonShiftStartDate || !adminSettings.commonShiftEndDate}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-md flex items-center justify-center transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
            >
            {isGeneratingSchedule ? <Loader2 size={20} className="mr-2 animate-spin"/> : <Clock size={20} className="mr-2"/>}
            {isGeneratingSchedule ? 'シフト生成中...' : 'シフトを生成して表示'}
            </button>
            <p className="mt-2 text-sm text-gray-500">
                { (teachers.length === 0 || students.length === 0) && !isLoadingTeachers && !isLoadingStudents ? "シフトを生成するには、少なくとも1人の講師と1人の生徒を登録してください。" :
                (!adminSettings.commonShiftStartDate || !adminSettings.commonShiftEndDate) && !isLoadingAdminSettings ? "共通シフト期間が未設定のため、シフト生成はできません。「管理情報編集」から設定してください。" :
                "このボタンを押すと、ローカルのPythonサーバーにデータを送信し、シフト生成を試みます。"}
            </p>
            <div className="mt-6 p-4 border-2 border-dashed border-gray-300 rounded-lg min-h-[200px]">
              {isGeneratingSchedule && (
                <div className="flex flex-col items-center justify-center h-full">
                  <Loader2 className="animate-spin h-12 w-12 text-purple-500 mb-3" />
                  <p className="text-purple-600">Pythonサーバーからの応答を待っています...</p>
                </div>
              )}
              {scheduleGenerationError && (
                <div className="flex flex-col items-center justify-center h-full p-4 bg-red-50 rounded-md">
                  <ServerCrash size={40} className="text-red-500 mb-3" />
                  <p className="text-red-700 font-semibold">シフト生成エラー</p>
                  <p className="text-red-600 text-sm text-center">{scheduleGenerationError}</p>
                </div>
              )}
              {!isGeneratingSchedule && !scheduleGenerationError && generatedSchedule && (
                <div>
                  <h3 className="text-xl font-semibold text-gray-700 mb-3 flex items-center"><Table size={22} className="mr-2 text-purple-600"/> 生成されたシフト結果</h3>
                  {renderGeneratedSchedule()}
                </div>
              )}
              {!isGeneratingSchedule && !scheduleGenerationError && !generatedSchedule && (
                <div className="flex items-center justify-center h-full">
                 <p className="text-gray-400">ここに生成されたシフト表が表示されます。</p>
                </div>
              )}
            </div>
      </section>

      {isTeacherModalOpen && (
        <Modal isOpen={isTeacherModalOpen} onClose={() => setIsTeacherModalOpen(false)} title={editingTeacher ? "講師情報編集" : "新規講師追加"} size="6xl">
          <TeacherForm teacher={editingTeacher} onSave={handleTeacherSave} onClose={() => setIsTeacherModalOpen(false)} userId={userId} adminSettings={adminSettings} displayNotification={displayNotification}/>
        </Modal>
      )}
      {isStudentModalOpen && (
        <Modal isOpen={isStudentModalOpen} onClose={() => setIsStudentModalOpen(false)} title={editingStudent ? "生徒情報編集" : "新規生徒追加"} size="5xl">
          <StudentForm
            student={editingStudent}
            onSave={handleStudentSave}
            onClose={() => setIsStudentModalOpen(false)}
            userId={userId}
            adminSettings={adminSettings}
            teachers={teachers}
            displayNotification={displayNotification}
          />
        </Modal>
      )}
      {isAdminSettingsModalOpen && (
        <Modal isOpen={isAdminSettingsModalOpen} onClose={() => setIsAdminSettingsModalOpen(false)} title="管理情報編集" size="7xl">
            <AdminSettingsForm currentSettings={adminSettings} onSave={handleAdminSettingsSave} onClose={() => setIsAdminSettingsModalOpen(false)} displayNotification={displayNotification}/>
        </Modal>
      )}
      {confirmDialogOpen && itemToDelete && (
        <ConfirmationDialog
          isOpen={confirmDialogOpen}
          onClose={() => { setConfirmDialogOpen(false); setItemToDelete(null); }}
          onConfirm={() => {
            if (deleteAction) {
              deleteAction();
            }
          }}
          title={`${itemToDelete.type === 'teacher' ? '講師' : '生徒'}の削除`}
          message={`本当に「${itemToDelete.type === 'teacher' ? (teachers.find(t => t.id === itemToDelete.id)?.name || '選択された講師') : (students.find(s => s.id === itemToDelete.id)?.name || '選択された生徒')}」を削除しますか？この操作は元に戻せません。`}
        />
      )}
    </div>
  );
}
