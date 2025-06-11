import React, { useState, useEffect } from 'react';
import { doc, collection, addDoc, updateDoc } from 'firebase/firestore';
import { Save, XCircle, Loader2, AlertTriangle, PlusCircle, MinusCircle } from 'lucide-react';

import { db, appIdForPaths as appId } from '../lib/firebaseConfig';
import { AFFILIATIONS, MIN_DESIRED_PERIODS_OPTIONS, PERIOD_DEFINITIONS, DAYS_OF_WEEK_JP, DEFAULT_SUBJECT_SETTINGS, AVAILABLE_PERIOD_NUMBERS, DEFAULT_OPERATION_SETTINGS } from '../lib/constants';
import { getDatesInRange, formatDateToYyyyMmDd } from '../lib/utils';


const TeacherForm = ({ teacher, onSave, onClose, userId, adminSettings, displayNotification }) => {
  const [name, setName] = useState(teacher?.name || '');
  const [teachableSubjectsByAffiliation, setTeachableSubjectsByAffiliation] = useState(
    teacher?.teachableSubjectsByAffiliation || 
    AFFILIATIONS.reduce((acc, aff) => ({ ...acc, [aff]: [] }), {}) // Initialize with empty arrays for each affiliation
  );
  const [regularClasses, setRegularClasses] = useState(teacher?.regularClasses || []);
  const [minDesiredPeriods, setMinDesiredPeriods] = useState(teacher?.minDesiredPeriods || MIN_DESIRED_PERIODS_OPTIONS[0]);
  const [selectedDateSlots, setSelectedDateSlots] = useState(teacher?.selectedDateSlots || {});
  const [calendarDates, setCalendarDates] = useState([]);
  const [errors, setErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  // No longer using openAffiliationSubjects, sections will always be open

  const subjectSettingsToUse = adminSettings?.subjectSettingsByAffiliation || DEFAULT_SUBJECT_SETTINGS;

  useEffect(() => {
    if (adminSettings?.commonShiftStartDate && adminSettings?.commonShiftEndDate) {
      setCalendarDates(getDatesInRange(adminSettings.commonShiftStartDate, adminSettings.commonShiftEndDate));
    } else {
      setCalendarDates([]);
    }
  }, [adminSettings?.commonShiftStartDate, adminSettings?.commonShiftEndDate]);

  const validate = () => { 
    const newErrors = {};
    if (!name.trim()) newErrors.name = "講師名は必須です。";
    
    let totalTeachableSubjects = 0;
    Object.values(teachableSubjectsByAffiliation).forEach(subjectsList => {
        if (Array.isArray(subjectsList)) {
            totalTeachableSubjects += subjectsList.length;
        }
    });
    if (totalTeachableSubjects === 0) {
        newErrors.subjects = "少なくとも1つの指導可能科を選択してください。";
    }
    
    const regularClassErrors = [];
    regularClasses.forEach((rc, index) => {
      const rcError = {};
      if (!rc.studentName?.trim()) rcError.studentName = `生徒名を入力してください。`;
      if (!rc.studentAffiliation) rcError.studentAffiliation = `生徒所属を選択してください。`;
      if (!rc.studentGrade) rcError.studentGrade = `生徒学年を選択してください。`;
      if (!rc.subject) rcError.subject = `科目を入力してください。`;
      if (!rc.day) rcError.day = `曜日を選択してください。`;
      if (!rc.period) rcError.period = `時限を選択してください。`;
      if (Object.keys(rcError).length > 0) regularClassErrors[index] = rcError;
    });
    if (regularClassErrors.length > 0) newErrors.regularClasses = regularClassErrors;
    
    let hasAnySlotSelected = Object.values(selectedDateSlots).some(slots => slots && slots.length > 0);
    if (calendarDates.length > 0 && !hasAnySlotSelected) { 
        newErrors.selectedSlots = "少なくとも1つの希望日時限を選択してください。";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => { 
    if (!validate()) return;
    setIsSaving(true);
    const cleanedSelectedDateSlots = Object.entries(selectedDateSlots)
        .filter(([_, slots]) => slots && slots.length > 0)
        .reduce((obj, [key, value]) => { obj[key] = value.sort((a,b) => a - b); return obj; }, {});
    const updatedRegularClasses = regularClasses.map(rc => ({
        studentName: rc.studentName || '',
        studentAffiliation: rc.studentAffiliation || '',
        studentGrade: rc.studentGrade || '',
        subject: rc.subject || '',
        day: rc.day || '',
        period: rc.period || '',
    }));

    const finalTeachableSubjects = Object.entries(teachableSubjectsByAffiliation)
      .filter(([_, subjectsList]) => Array.isArray(subjectsList) && subjectsList.length > 0)
      .reduce((obj, [key, value]) => {
        obj[key] = value;
        return obj;
      }, {});


    const teacherData = { 
        name, 
        teachableSubjectsByAffiliation: finalTeachableSubjects, 
        regularClasses: updatedRegularClasses, 
        minDesiredPeriods, 
        selectedDateSlots: cleanedSelectedDateSlots, 
        userId 
    };
    try {
      const teacherCollectionPath = `artifacts/${appId}/users/${userId}/teachers`;
      if (teacher && teacher.id) {
        await updateDoc(doc(db, teacherCollectionPath, teacher.id), teacherData);
      } else {
        await addDoc(collection(db, teacherCollectionPath), teacherData);
      }
      onSave(); 
      onClose();
    } catch (error) {
      console.error("Error saving teacher:", error);
      setErrors(prev => ({ ...prev, firestore: `講師情報の保存に失敗: ${error.message}` }));
      displayNotification(`講師情報の保存に失敗: ${error.message}`, "error");
    } finally { 
      setIsSaving(false); 
    }
  };

  const toggleTeachableSubject = (affiliation, subject) => {
    setTeachableSubjectsByAffiliation(prev => {
        const currentSubjectsForAffiliation = prev[affiliation] || [];
        const newSubjectsForAffiliation = currentSubjectsForAffiliation.includes(subject)
            ? currentSubjectsForAffiliation.filter(s => s !== subject)
            : [...currentSubjectsForAffiliation, subject].sort();
        return {
            ...prev,
            [affiliation]: newSubjectsForAffiliation
        };
    });
  };

  const addRegularClass = () => setRegularClasses([...regularClasses, { studentName: '', studentAffiliation: '', studentGrade: '', subject: '', day: '', period: '' }]);
  const removeRegularClass = (index) => setRegularClasses(regularClasses.filter((_, i) => i !== index));
  
  const handleRegularClassChange = (index, field, value) => {
    const updatedClasses = [...regularClasses];
    updatedClasses[index][field] = value;
    if (field === 'studentAffiliation') {
        updatedClasses[index].studentGrade = ''; 
    }
    setRegularClasses(updatedClasses);
  };

  const toggleDateSlot = (dateStr, period, isDisabled) => {
    if (isDisabled) return; // Do not toggle if the slot is disabled
    setSelectedDateSlots(prev => {
      const currentSlotsForDate = prev[dateStr] || [];
      const updatedSlotsForDate = currentSlotsForDate.includes(period)
        ? currentSlotsForDate.filter(p => p !== period)
        : [...currentSlotsForDate, period].sort((a,b) => a - b);
      if (updatedSlotsForDate.length === 0) { 
        const { [dateStr]: _, ...rest } = prev; 
        return rest; 
      }
      return { ...prev, [dateStr]: updatedSlotsForDate };
    });
  };

  // 特定の曜日の全ての時限を選択/解除するハンドラ
  const toggleAllPeriodsForDay = (dateStr, periodsForDay, currentSelectedSlots, isSuspensionDay) => {
    setSelectedDateSlots(prev => {
      const allAvailablePeriods = periodsForDay.filter(periodNum => {
        const dayOfWeekJP = DAYS_OF_WEEK_JP[new Date(dateStr).getDay()];
        const regularClassesThisSlot = regularClasses.filter(
          rc => rc.day === dayOfWeekJP && rc.period === periodNum
        );
        const isSlotFull = regularClassesThisSlot.length >= 2;
        // 通常授業休止日でない場合、満員のコマは選択不可
        return !(isSlotFull && !isSuspensionDay);
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
  };


  const holidaysToUse = adminSettings?.holidays || [];
  const suspensionDaysToUse = adminSettings?.suspensionDays || [];
  const defaultShiftPeriodsByDayToUse = adminSettings?.defaultShiftPeriodsByDay || DEFAULT_OPERATION_SETTINGS.defaultShiftPeriodsByDay;


  return (
    <div>
      {errors.firestore && <p className="text-red-500 text-sm mb-3 p-2 bg-red-50 rounded-md flex items-center"><AlertTriangle size={16} className="mr-1"/>{errors.firestore}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">講師名 <span className="text-red-500">*</span></label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            className={`w-full p-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500 ${errors.name ? 'border-red-500' : 'border-gray-300'}`} />
          {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">最低希望コマ数/日 <span className="text-red-500">*</span></label>
          <select value={minDesiredPeriods} onChange={(e) => setMinDesiredPeriods(Number(e.target.value))}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500">
            {MIN_DESIRED_PERIODS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}コマ</option>)}
          </select>
        </div>
      </div>
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">指導可能科目 <span className="text-red-500">*</span></label>
        <div className="border rounded-md p-2 space-y-3">
            {AFFILIATIONS.map(affiliation => (
                <div key={affiliation} className="border-b pb-3 last:border-b-0">
                    <h4 className="text-md font-semibold text-indigo-600 mb-1">{affiliation}</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-1">
                        {(subjectSettingsToUse[affiliation]?.availableSubjects || []).map(subject => (
                            <label key={`${affiliation}-${subject}`} className="flex items-center space-x-2 p-1.5 hover:bg-indigo-50 rounded-md cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={teachableSubjectsByAffiliation[affiliation]?.includes(subject) || false} 
                                    onChange={() => toggleTeachableSubject(affiliation, subject)}
                                    className="form-checkbox h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" 
                                />
                                <span className="text-sm text-gray-700">{subject}</span>
                            </label>
                        ))}
                         {(!subjectSettingsToUse[affiliation]?.availableSubjects || subjectSettingsToUse[affiliation]?.availableSubjects.length === 0) && (
                            <p className="col-span-full text-xs text-gray-500 p-2">この所属で指導可能な科目が管理情報で設定されていません。</p>
                        )}
                    </div>
                </div>
            ))}
        </div>
        {errors.subjects && <p className="text-red-500 text-xs mt-1">{errors.subjects}</p>}
      </div>
    
      <div className="mb-6 border p-4 rounded-md">
        <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-medium text-gray-700">通常授業</h3>
            <button type="button" onClick={addRegularClass} className="text-indigo-600 hover:text-indigo-800 flex items-center text-sm font-medium">
                <PlusCircle size={18} className="mr-1"/> 通常授業を追加
            </button>
        </div>
        {regularClasses.map((rc, index) => (
          <div key={index} className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-3 p-3 border rounded-md relative">
            <button type="button" onClick={() => removeRegularClass(index)} 
                    className="absolute top-1 right-1 text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-100">
                <MinusCircle size={16}/>
            </button>
            <div className="lg:col-span-2"> 
              <label className="block text-xs font-medium text-gray-600">生徒名</label>
              <input type="text" placeholder="生徒名" value={rc.studentName} onChange={(e) => handleRegularClassChange(index, 'studentName', e.target.value)}
                className={`w-full p-1.5 border rounded-md text-sm ${errors.regularClasses?.[index]?.studentName ? 'border-red-500' : 'border-gray-300'}`} />
                 {errors.regularClasses?.[index]?.studentName && <p className="text-red-500 text-xs mt-0.5">{errors.regularClasses[index].studentName}</p>}
            </div>
            <div> 
                <label className="block text-xs font-medium text-gray-600">生徒所属</label>
                <select value={rc.studentAffiliation} onChange={(e) => handleRegularClassChange(index, 'studentAffiliation', e.target.value)}
                    className={`w-full p-1.5 border rounded-md text-sm ${errors.regularClasses?.[index]?.studentAffiliation ? 'border-red-500' : 'border-gray-300'}`}>
                    <option value="">選択</option>
                    {AFFILIATIONS.map(aff => <option key={aff} value={aff}>{aff}</option>)}
                </select>
                {errors.regularClasses?.[index]?.studentAffiliation && <p className="text-red-500 text-xs mt-0.5">{errors.regularClasses[index].studentAffiliation}</p>}
            </div>
            <div> 
                <label className="block text-xs font-medium text-gray-600">生徒学年</label>
                <select value={rc.studentGrade} onChange={(e) => handleRegularClassChange(index, 'studentGrade', e.target.value)}
                    disabled={!rc.studentAffiliation}
                    className={`w-full p-1.5 border rounded-md text-sm ${errors.regularClasses?.[index]?.studentGrade ? 'border-red-500' : 'border-gray-300'} ${!rc.studentAffiliation ? 'bg-gray-100' : ''}`}>
                    <option value="">選択</option>
                    {(subjectSettingsToUse[rc.studentAffiliation]?.grades || []).map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                {errors.regularClasses?.[index]?.studentGrade && <p className="text-red-500 text-xs mt-0.5">{errors.regularClasses[index].studentGrade}</p>}
            </div>
            <div> 
              <label className="block text-xs font-medium text-gray-600">科目</label>
              <select value={rc.subject} onChange={(e) => handleRegularClassChange(index, 'subject', e.target.value)}
                disabled={!rc.studentAffiliation}
                className={`w-full p-1.5 border rounded-md text-sm ${errors.regularClasses?.[index]?.subject ? 'border-red-500' : 'border-gray-300'} ${!rc.studentAffiliation ? 'bg-gray-100' : ''}`}>
                <option value="">選択</option>
                {(subjectSettingsToUse[rc.studentAffiliation]?.availableSubjects || []).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {errors.regularClasses?.[index]?.subject && <p className="text-red-500 text-xs mt-0.5">{errors.regularClasses[index].subject}</p>}
            </div>
            <div> 
              <label className="block text-xs font-medium text-gray-600">曜日</label>
              <select value={rc.day} onChange={(e) => handleRegularClassChange(index, 'day', e.target.value)}
                className={`w-full p-1.5 border rounded-md text-sm ${errors.regularClasses?.[index]?.day ? 'border-red-500' : 'border-gray-300'}`}>
                <option value="">選択</option>
                {DAYS_OF_WEEK_JP.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              {errors.regularClasses?.[index]?.day && <p className="text-red-500 text-xs mt-0.5">{errors.regularClasses[index].day}</p>}
            </div>
            <div> 
              <label className="block text-xs font-medium text-gray-600">時限</label>
              <select value={rc.period} onChange={(e) => handleRegularClassChange(index, 'period', Number(e.target.value))}
                className={`w-full p-1.5 border rounded-md text-sm ${errors.regularClasses?.[index]?.period ? 'border-red-500' : 'border-gray-300'}`}>
                <option value="">選択</option>
                {AVAILABLE_PERIOD_NUMBERS.map(pNum => <option key={pNum} value={pNum}>{PERIOD_DEFINITIONS[pNum].label} ({PERIOD_DEFINITIONS[pNum].time})</option>)}
              </select>
              {errors.regularClasses?.[index]?.period && <p className="text-red-500 text-xs mt-0.5">{errors.regularClasses[index].period}</p>}
            </div>
          </div>
        ))}
        {regularClasses.length === 0 && <p className="text-xs text-gray-500">通常授業が登録されていません。</p>}
      </div>
      <div className="mb-6 border p-4 rounded-md">
         <h3 className="text-lg font-medium text-gray-700 mb-1">希望シフト入力</h3>
        { (!adminSettings?.commonShiftStartDate || !adminSettings?.commonShiftEndDate) ? (
            <p className="text-sm text-orange-600 bg-orange-50 p-3 rounded-md flex items-center"><AlertTriangle size={16} className="inline mr-2" /> 管理者によって共通シフト入力期間が設定されていません。</p>
        ) : (
            <>
                <p className="text-sm text-gray-600 mb-3">共通シフト入力期間: <strong>{formatDateToYyyyMmDd(adminSettings.commonShiftStartDate)}</strong> 〜 <strong>{formatDateToYyyyMmDd(adminSettings.commonShiftEndDate)}</strong></p>
                {errors.selectedSlots && <p className="text-red-500 text-xs mb-2">{errors.selectedSlots}</p>}
                {calendarDates.length > 0 ? (
                <div className="max-h-[400px] overflow-y-auto border rounded-md p-2 bg-gray-50">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {calendarDates.map(dateObj => {
                        const dateStr = formatDateToYyyyMmDd(dateObj);
                        const dayOfWeekJP = DAYS_OF_WEEK_JP[dateObj.getDay()];
                        const isHoliday = holidaysToUse.includes(dateStr);
                        const isSuspensionDay = suspensionDaysToUse.includes(dateStr);
                        const availablePeriodsForDay = defaultShiftPeriodsByDayToUse[dayOfWeekJP] || [];
                        
                        if (isHoliday) {
                            return (
                                <div key={dateStr} className="p-3 border rounded-lg bg-red-100">
                                <p className="font-semibold text-sm text-red-700">{dateStr.substring(5)} ({dayOfWeekJP})</p>
                                <p className="text-xs text-red-600 mt-1">休校日 (塾全体)</p>
                                </div>
                            );
                        }
                        // For suspension days, teachers can still input shifts for special courses
                        // So, we don't disable the day, but it will be visually distinct.
                        
                        return ( 
                        <div key={dateStr} className={`p-3 border rounded-lg shadow-sm ${isSuspensionDay ? 'bg-amber-50' : 'bg-white'}`}>
                            <p className={`font-semibold text-sm mb-2 ${isSuspensionDay ? 'text-amber-700' : 'text-gray-700'}`}>
                                {dateStr.substring(5)} ({dayOfWeekJP})
                                {isSuspensionDay && <span className="text-xs font-normal ml-1">(通常授業休止)</span>}
                            </p>
                            {availablePeriodsForDay.length > 0 ? (
                                <>
                                    <button 
                                        type="button" 
                                        onClick={() => toggleAllPeriodsForDay(dateStr, availablePeriodsForDay, selectedDateSlots[dateStr], isSuspensionDay)}
                                        className="mb-2 px-3 py-1 bg-blue-100 text-blue-700 text-xs rounded-md hover:bg-blue-200"
                                    >
                                        {availablePeriodsForDay.every(periodNum => selectedDateSlots[dateStr]?.includes(periodNum)) ? 'この曜日を全て解除' : 'この曜日を全て選択'}
                                    </button>
                                    <div className="space-y-1.5">
                                    {availablePeriodsForDay.map(periodNum => {
                                        const periodDef = PERIOD_DEFINITIONS[periodNum];
                                        const regularClassesThisSlot = regularClasses.filter(
                                            rc => rc.day === dayOfWeekJP && rc.period === periodNum
                                        );
                                        const isSlotFull = regularClassesThisSlot.length >= 2;
                                        const slotDisabled = isSlotFull && !isSuspensionDay; // Full slots are only disabled on non-suspension days

                                        return (
                                            <div key={periodNum} className={`p-1.5 rounded-md ${slotDisabled ? 'bg-gray-200 opacity-70' : 'hover:bg-indigo-50'}`}>
                                                <label className={`flex items-center space-x-2 text-xs ${slotDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                                                    <input type="checkbox" 
                                                        checked={!slotDisabled && (selectedDateSlots[dateStr]?.includes(periodNum) || false)} 
                                                        onChange={() => toggleDateSlot(dateStr, periodNum, slotDisabled)}
                                                        disabled={slotDisabled}
                                                        className="form-checkbox h-3.5 w-3.5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 disabled:bg-gray-300" />
                                                    <span>{periodDef?.label || `時限 ${periodNum}`} ({periodDef?.time || 'N/A'})</span>
                                                </label>
                                                {regularClassesThisSlot.length > 0 && (
                                                    <div className="text-xxs text-gray-500 pl-5">
                                                        通常: {regularClassesThisSlot.map(rc => rc.studentName).join(', ')}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                    </div>
                                </>
                            ) : (
                                <p className="text-xs text-gray-400 mt-1">勤務設定なし</p>
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
        <button type="button" onClick={onClose} disabled={isSaving} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50 flex items-center"><XCircle size={18} className="mr-1" /> キャンセル</button>
        <button type="button" onClick={handleSave} disabled={isSaving || (!adminSettings?.commonShiftStartDate || !adminSettings?.commonShiftEndDate)} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center">
          {isSaving ? <Loader2 size={18} className="mr-1 animate-spin" /> : <Save size={18} className="mr-1" />} 保存
        </button>
      </div>
    </div>
  );
};

export default TeacherForm;

