import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { doc, collection, addDoc, updateDoc } from 'firebase/firestore';
import { Save, XCircle, Loader2, AlertTriangle, PlusCircle, MinusCircle } from 'lucide-react';

import { db, appIdForPaths as appId } from '../lib/firebaseConfig';
import { AFFILIATIONS, ALL_SUBJECTS_MASTER, PERIOD_DEFINITIONS, DAYS_OF_WEEK_JP, DEFAULT_SUBJECT_SETTINGS, DEFAULT_OPERATION_SETTINGS } from '../lib/constants';
import { getDatesInRange, formatDateToYyyyMmDd } from '../lib/utils';


const StudentForm = ({ student, onSave, onClose, userId, adminSettings, teachers, displayNotification }) => {
    const [name, setName] = useState(student?.name || '');
    const [affiliation, setAffiliation] = useState(student?.affiliation || '');
    const [grade, setGrade] = useState(student?.grade || '');
    const [desiredCourses, setDesiredCourses] = useState(student?.desiredCourses || [{ subject: '', units: 1 }]);
    const [schedulingPreference, setSchedulingPreference] = useState(student?.schedulingPreference || '集中希望'); 
    const [idleTimePreference, setIdleTimePreference] = useState(student?.idleTimePreference || '空きコマなし希望'); 
    const [availableLectureSlots, setAvailableLectureSlots] = useState(student?.availableLectureSlots || {});
    const [calendarDates, setCalendarDates] = useState([]);
    
    const [errors, setErrors] = useState({});
    const [isSaving, setIsSaving] = useState(false);

    const subjectSettingsToUse = adminSettings?.subjectSettingsByAffiliation || DEFAULT_SUBJECT_SETTINGS;
    const availableGrades = affiliation ? (subjectSettingsToUse[affiliation]?.grades || []) : [];
    const availableSubjectsForAffiliation = affiliation ? (subjectSettingsToUse[affiliation]?.availableSubjects || []) : ALL_SUBJECTS_MASTER;

    const studentRegularClasses = useMemo(() => {
        if (!name || !affiliation || !grade || !teachers || teachers.length === 0) return [];
        const studentClasses = [];
        teachers.forEach(teacher => {
            if (Array.isArray(teacher.regularClasses)) { 
                teacher.regularClasses.forEach(rc => {
                    if (rc.studentName === name && rc.studentAffiliation === affiliation && rc.studentGrade === grade) {
                        studentClasses.push({
                            dayOfWeek: rc.day, 
                            period: rc.period,
                            subject: rc.subject,
                        });
                    }
                });
            }
        });
        return studentClasses;
    }, [name, affiliation, grade, teachers]);


    useEffect(() => {
        if (adminSettings?.commonShiftStartDate && adminSettings?.commonShiftEndDate) {
          setCalendarDates(getDatesInRange(adminSettings.commonShiftStartDate, adminSettings.commonShiftEndDate));
        } else {
          setCalendarDates([]);
        }
    }, [adminSettings?.commonShiftStartDate, adminSettings?.commonShiftEndDate]);


    const validate = () => { 
        const newErrors = {};
        if (!name.trim()) newErrors.name = "氏名は必須です。";
        if (!affiliation) newErrors.affiliation = "所属は必須です。";
        if (!grade) newErrors.grade = "学年は必須です。";
        
        const courseErrors = [];
        let totalUnits = 0;
        desiredCourses.forEach((course, index) => {
            const cError = {};
            if (!course.subject) cError.subject = "科目を選択してください。";
            if (!course.units || course.units <= 0) cError.units = "コマ数を正しく入力してください。";
            else totalUnits += course.units;
            if (Object.keys(cError).length > 0) courseErrors[index] = cError;
        });
        if (courseErrors.length > 0) newErrors.desiredCourses = courseErrors;
        if (desiredCourses.length === 0 || totalUnits === 0) newErrors.desiredCoursesGeneral = "少なくとも1つの希望科目とコマ数を入力してください。";

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0 && !newErrors.desiredCoursesGeneral;
     };

    const handleSave = async () => {
        if (!validate()) {
            displayNotification("入力内容にエラーがあります。", "error");
            return;
        }
        setIsSaving(true);
        const studentData = { 
            name, 
            affiliation, 
            grade, 
            desiredCourses: desiredCourses.filter(c => c.subject && c.units > 0), 
            schedulingPreference, 
            idleTimePreference, 
            availableLectureSlots: Object.fromEntries(Object.entries(availableLectureSlots).filter(([_, slots]) => slots.length > 0)),
            userId 
        };
        try {
            const studentCollectionPath = `artifacts/${appId}/users/${userId}/students`; 
            if (student && student.id) {
                await updateDoc(doc(db, studentCollectionPath, student.id), studentData);
            } else {
                await addDoc(collection(db, studentCollectionPath), studentData);
            }
            onSave(); 
            onClose(); 
        } catch (error) {
            console.error("Error saving student:", error);
            setErrors(prev => ({ ...prev, firestore: `生徒情報の保存に失敗: ${error.message}` }));
            displayNotification(`生徒情報の保存に失敗: ${error.message}`, "error");
        } finally {
            setIsSaving(false);
        }
    };

    const handleAffiliationChange = (newAffiliation) => {
        setAffiliation(newAffiliation);
        setGrade(''); 
        setDesiredCourses([{ subject: '', units: 1 }]); 
    };
    
    const handleDesiredCourseChange = (index, field, value) => {
        const updatedCourses = [...desiredCourses];
        updatedCourses[index][field] = field === 'units' ? parseInt(value, 10) || 0 : value;
        setDesiredCourses(updatedCourses);
    };

    const addDesiredCourse = () => setDesiredCourses([...desiredCourses, { subject: '', units: 1 }]);
    const removeDesiredCourse = (index) => {
        if (desiredCourses.length > 1) {
            setDesiredCourses(desiredCourses.filter((_, i) => i !== index));
        } else {
            setDesiredCourses([{ subject: '', units: 1 }]);
        }
    };

    const toggleAvailableLectureSlot = useCallback((dateStr, period) => {
        setAvailableLectureSlots(prev => {
            const currentSlots = prev[dateStr] || [];
            const updatedSlots = currentSlots.includes(period)
                ? currentSlots.filter(p => p !== period)
                : [...currentSlots, period].sort((a,b) => a-b);
            
            if (updatedSlots.length === 0) {
                const { [dateStr]: _, ...rest } = prev;
                return rest;
            }
            return { ...prev, [dateStr]: updatedSlots };
        });
    }, []);

    // 特定の曜日の全ての時限を選択/解除するハンドラ
    const toggleAllPeriodsForDay = useCallback((dateStr, periodsForDay, currentSelectedSlots) => {
        setAvailableLectureSlots(prev => {
            const allAvailablePeriods = periodsForDay.filter(periodNum => {
                const dayOfWeekJP = DAYS_OF_WEEK_JP[new Date(dateStr).getDay()];
                const regularClassThisPeriod = studentRegularClasses.find(
                    rc => rc.dayOfWeek === dayOfWeekJP && rc.period === periodNum
                );
                return !regularClassThisPeriod; // 通常授業がある場合は選択不可
            });

            const currentSlotsForDate = currentSelectedSlots || [];
            const allSelected = allAvailablePeriods.every(periodNum => currentSlotsForDate.includes(periodNum));

            if (allSelected) {
                // 全て選択されている場合、全て解除
                const { [dateStr]: _, ...rest } = prev;
                return rest;
            } else {
                // 全て選択されていない場合、全て選択
                return { ...prev, [dateStr]: allAvailablePeriods.sort((a,b) => a - b) };
            }
        });
    }, [studentRegularClasses]);
    
    const holidaysToUse = adminSettings?.holidays || [];
    const suspensionDaysToUse = adminSettings?.suspensionDays || [];
    const defaultShiftPeriodsByDayToUse = adminSettings?.defaultShiftPeriodsByDay || DEFAULT_OPERATION_SETTINGS.defaultShiftPeriodsByDay;

    return (
        <div>
            {errors.firestore && <p className="text-red-500 text-sm mb-2 flex items-center"><AlertTriangle size={16} className="mr-1"/>{errors.firestore}</p>}
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="md:col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">氏名 <span className="text-red-500">*</span></label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                        className={`w-full p-2 border rounded-md ${errors.name ? 'border-red-500' : 'border-gray-300'}`} />
                    {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">所属 <span className="text-red-500">*</span></label>
                    <select value={affiliation} onChange={(e) => handleAffiliationChange(e.target.value)}
                        className={`w-full p-2 border rounded-md ${errors.affiliation ? 'border-red-500' : 'border-gray-300'}`}>
                        <option value="">選択してください</option>
                        {AFFILIATIONS.map(aff => <option key={aff} value={aff}>{aff}</option>)}
                    </select>
                    {errors.affiliation && <p className="text-red-500 text-xs mt-1">{errors.affiliation}</p>}
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">学年 <span className="text-red-500">*</span></label>
                    <select value={grade} onChange={(e) => setGrade(e.target.value)}
                        disabled={!affiliation || availableGrades.length === 0}
                        className={`w-full p-2 border rounded-md ${errors.grade ? 'border-red-500' : 'border-gray-300'} ${!affiliation || availableGrades.length === 0 ? 'bg-gray-100 cursor-not-allowed' : ''}`}>
                        <option value="">選択してください</option>
                        {availableGrades.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                    {errors.grade && <p className="text-red-500 text-xs mt-1">{errors.grade}</p>}
                </div>
            </div>

            <div className="mb-6 border p-4 rounded-md">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-lg font-medium text-gray-700">受講希望科目とコマ数</h3>
                    <button type="button" onClick={addDesiredCourse} disabled={!affiliation}
                        className="text-indigo-600 hover:text-indigo-800 flex items-center text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                        <PlusCircle size={18} className="mr-1"/> 科目を追加
                    </button>
                </div>
                {errors.desiredCoursesGeneral && <p className="text-red-500 text-xs mb-2">{errors.desiredCoursesGeneral}</p>}
                {desiredCourses.map((course, index) => (
                    <div key={index} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3 p-3 border rounded-md relative">
                        {desiredCourses.length > 1 && (
                            <button type="button" onClick={() => removeDesiredCourse(index)}
                                className="absolute top-1 right-1 text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-100">
                                <MinusCircle size={16}/>
                            </button>
                        )}
                        <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-gray-600">科目</label>
                            <select value={course.subject} onChange={(e) => handleDesiredCourseChange(index, 'subject', e.target.value)}
                                disabled={!affiliation}
                                className={`w-full p-1.5 border rounded-md text-sm ${errors.desiredCourses?.[index]?.subject ? 'border-red-500' : 'border-gray-300'} ${!affiliation ? 'bg-gray-100' : ''}`}>
                                <option value="">選択してください</option>
                                {availableSubjectsForAffiliation.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            {errors.desiredCourses?.[index]?.subject && <p className="text-red-500 text-xs mt-0.5">{errors.desiredCourses[index].subject}</p>}
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600">コマ数</label>
                            <input type="number" min="1" value={course.units} onChange={(e) => handleDesiredCourseChange(index, 'units', e.target.value)}
                                className={`w-full p-1.5 border rounded-md text-sm ${errors.desiredCourses?.[index]?.units ? 'border-red-500' : 'border-gray-300'}`} />
                            {errors.desiredCourses?.[index]?.units && <p className="text-red-500 text-xs mt-0.5">{errors.desiredCourses[index].units}</p>}
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">授業集中度</label>
                    <div className="flex space-x-4">
                        <label className="flex items-center">
                            <input type="radio" name="schedulingPreference" value="集中希望" checked={schedulingPreference === '集中希望'} onChange={(e) => setSchedulingPreference(e.target.value)} className="form-radio text-indigo-600"/>
                            <span className="ml-2 text-sm text-gray-700">1日に集中して受けたい</span>
                        </label>
                        <label className="flex items-center">
                            <input type="radio" name="schedulingPreference" value="分散希望" checked={schedulingPreference === '分散希望'} onChange={(e) => setSchedulingPreference(e.target.value)} className="form-radio text-indigo-600"/>
                            <span className="ml-2 text-sm text-gray-700">なるべく分散してほしい</span>
                        </label>
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">空きコマ許容度</label>
                    <div className="flex space-x-4">
                        <label className="flex items-center">
                            <input type="radio" name="idleTimePreference" value="空きコマなし希望" checked={idleTimePreference === '空きコマなし希望'} onChange={(e) => setIdleTimePreference(e.target.value)} className="form-radio text-indigo-600"/>
                            <span className="ml-2 text-sm text-gray-700">空きコマを避けたい</span>
                        </label>
                        <label className="flex items-center">
                            <input type="radio" name="idleTimePreference" value="空きコマ許容" checked={idleTimePreference === '空きコマ許容'} onChange={(e) => setIdleTimePreference(e.target.value)} className="form-radio text-indigo-600"/>
                            <span className="ml-2 text-sm text-gray-700">空きコマがあっても問題ない</span>
                        </label>
                    </div>
                </div>
            </div>

            <div className="mb-6 border p-4 rounded-md">
                <h3 className="text-lg font-medium text-gray-700 mb-1">講習受講可能枠</h3>
                { (!adminSettings?.commonShiftStartDate || !adminSettings?.commonShiftEndDate) ? (
                    <p className="text-sm text-orange-600 bg-orange-50 p-3 rounded-md flex items-center">
                        <AlertTriangle size={16} className="inline mr-2" /> 管理者によって共通シフト入力期間が設定されていません。
                    </p>
                ) : (!name || !affiliation || !grade) ? (
                     <p className="text-sm text-orange-600 bg-orange-50 p-3 rounded-md flex items-center">
                        <AlertTriangle size={16} className="inline mr-2" /> 生徒の氏名・所属・学年を先に入力してください。
                    </p>
                ) : (
                    <>
                        <p className="text-sm text-gray-600 mb-3">共通シフト入力期間: <strong>{formatDateToYyyyMmDd(adminSettings.commonShiftStartDate)}</strong> 〜 <strong>{formatDateToYyyyMmDd(adminSettings.commonShiftEndDate)}</strong></p>
                        {calendarDates.length > 0 ? (
                        <div className="max-h-[400px] overflow-y-auto border rounded-md p-2 bg-gray-50">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {calendarDates.map(dateObj => {
                                const dateStr = formatDateToYyyyMmDd(dateObj);
                                const dayOfWeekIndex = dateObj.getDay();
                                const dayOfWeekJP = DAYS_OF_WEEK_JP[dayOfWeekIndex];
                                const isSchoolHoliday = holidaysToUse.includes(dateStr);
                                const isSuspensionDay = suspensionDaysToUse.includes(dateStr);
                                const periodsForThisDay = defaultShiftPeriodsByDayToUse[dayOfWeekJP] || [];

                                if (isSchoolHoliday) {
                                    return (
                                        <div key={dateStr} className="p-3 border rounded-lg bg-red-100">
                                            <p className="font-semibold text-sm text-red-700">{dateStr.substring(5)} ({dayOfWeekJP})</p>
                                            <p className="text-xs text-red-600 mt-1">休校日 (塾全体)</p>
                                        </div>
                                    );
                                }
                                
                                return (
                                <div key={dateStr} className={`p-3 border rounded-lg shadow-sm ${isSuspensionDay ? 'bg-amber-50' : 'bg-white'}`}>
                                    <p className={`font-semibold text-sm mb-2 ${isSuspensionDay ? 'text-amber-700' : 'text-gray-700'}`}>
                                        {dateStr.substring(5)} ({dayOfWeekJP})
                                        {isSuspensionDay && <span className="text-xs font-normal ml-1">(通常授業休止)</span>}
                                    </p>
                                    {periodsForThisDay.length > 0 ? (
                                        <>
                                            <button 
                                                type="button" 
                                                onClick={() => toggleAllPeriodsForDay(dateStr, periodsForThisDay, availableLectureSlots[dateStr])}
                                                className="mb-2 px-3 py-1 bg-blue-100 text-blue-700 text-xs rounded-md hover:bg-blue-200"
                                            >
                                                {periodsForThisDay.every(periodNum => availableLectureSlots[dateStr]?.includes(periodNum)) ? 'この曜日を全て解除' : 'この曜日を全て選択'}
                                            </button>
                                            <div className="space-y-1.5">
                                            {periodsForThisDay.map(periodNum => {
                                                const periodDef = PERIOD_DEFINITIONS[periodNum];
                                                const regularClassThisPeriod = !isSuspensionDay && studentRegularClasses.find(
                                                    rc => rc.dayOfWeek === dayOfWeekJP && rc.period === periodNum
                                                );

                                                if (regularClassThisPeriod) {
                                                    return (
                                                        <div key={periodNum} className="p-1.5 bg-gray-200 rounded-md text-xs text-gray-500">
                                                            {periodDef?.label || `時限 ${periodNum}`}: 通常授業 ({regularClassThisPeriod.subject})
                                                        </div>
                                                    );
                                                }
                                                return (
                                                    <label key={periodNum} className="flex items-center space-x-2 p-1.5 hover:bg-indigo-50 rounded-md cursor-pointer text-xs">
                                                    <input type="checkbox"
                                                        checked={availableLectureSlots[dateStr]?.includes(periodNum) || false}
                                                        onChange={() => toggleAvailableLectureSlot(dateStr, periodNum)}
                                                        className="form-checkbox h-3.5 w-3.5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" />
                                                    <span>{periodDef?.label || `時限 ${periodNum}`} ({periodDef?.time || 'N/A'})</span>
                                                    </label>
                                                );
                                            })}
                                            </div>
                                        </>
                                    ) : (
                                        <p className="text-xs text-gray-400 mt-1">この曜日は勤務設定なし</p>
                                    )}
                                </div>
                                );
                            })}
                            </div>
                        </div>
                        ) : ( <p className="text-sm text-gray-500">共通シフト入力期間に該当する日付がありません。</p> )}
                    </>
                )}
            </div>
            
            <div className="flex justify-end space-x-3 mt-8">
                <button type="button" onClick={onClose} disabled={isSaving}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 flex items-center disabled:opacity-50">
                <XCircle size={18} className="mr-1" /> キャンセル
                </button>
                <button type="button" onClick={handleSave} disabled={isSaving}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 flex items-center disabled:opacity-50">
                {isSaving ? <Loader2 size={18} className="mr-1 animate-spin" /> : <Save size={18} className="mr-1" />}
                保存
                </button>
            </div>
        </div>
    );
};

export default StudentForm;

