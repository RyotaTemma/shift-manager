import React, { useState, useEffect } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { Save, XCircle, Loader2, AlertTriangle, CalendarX, CalendarCheck, CalendarClock } from 'lucide-react';

import { db, appIdForPaths as appId } from '../lib/firebaseConfig';
import { getDatesInRange, formatDateToYyyyMmDd } from '../lib/utils';
import { DAYS_OF_WEEK_JP, AFFILIATIONS, ALL_SUBJECTS_MASTER, DEFAULT_SUBJECT_SETTINGS, DEFAULT_OPERATION_SETTINGS, AVAILABLE_PERIOD_NUMBERS, PERIOD_DEFINITIONS } from '../lib/constants';

const ADMIN_SETTINGS_PATH_COLLECTION = `artifacts/${appId}/public/data/adminConfig`;
const ADMIN_SETTINGS_DOC_ID = 'globalSettings';

const AdminSettingsForm = ({ currentSettings, onSave, onClose, displayNotification }) => {
  const [commonShiftStartDate, setCommonShiftStartDate] = useState(currentSettings?.commonShiftStartDate || '');
  const [commonShiftEndDate, setCommonShiftEndDate] = useState(currentSettings?.commonShiftEndDate || '');
  const [selectedHolidays, setSelectedHolidays] = useState(currentSettings?.holidays || []);
  const [selectedSuspensionDays, setSelectedSuspensionDays] = useState(currentSettings?.suspensionDays || []);
  const [subjectSettings, setSubjectSettings] = useState(currentSettings?.subjectSettingsByAffiliation || DEFAULT_SUBJECT_SETTINGS);
  // 曜日ごとのデフォルトシフト時限を管理する新しいstate
  const [defaultShiftPeriodsByDay, setDefaultShiftPeriodsByDay] = useState(
    currentSettings?.defaultShiftPeriodsByDay || 
    // デフォルトで全ての曜日を1限から6限に設定
    DAYS_OF_WEEK_JP.reduce((acc, day) => ({ ...acc, [day]: AVAILABLE_PERIOD_NUMBERS }), {})
  );
  // 全曜日一括設定用のstate
  const [globalPeriodStart, setGlobalPeriodStart] = useState(1); // デフォルトは1限
  const [globalPeriodEnd, setGlobalPeriodEnd] = useState(6); // デフォルトは6限

  const [calendarDates, setCalendarDates] = useState([]);
  const [errors, setErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [activeAffiliationTab, setActiveAffiliationTab] = useState(AFFILIATIONS[0]);

  useEffect(() => {
    if (commonShiftStartDate && commonShiftEndDate) {
      setCalendarDates(getDatesInRange(commonShiftStartDate, commonShiftEndDate));
    } else {
      setCalendarDates([]);
    }
  }, [commonShiftStartDate, commonShiftEndDate]);

  // グローバル設定が変更されたときに、各曜日の設定を更新
  useEffect(() => {
    const newDefaultPeriods = DAYS_OF_WEEK_JP.reduce((acc, day) => {
      const periods = AVAILABLE_PERIOD_NUMBERS.filter(p => p >= globalPeriodStart && p <= globalPeriodEnd);
      return { ...acc, [day]: periods };
    }, {});
    setDefaultShiftPeriodsByDay(newDefaultPeriods);
  }, [globalPeriodStart, globalPeriodEnd]);


  const validate = () => { 
    const newErrors = {};
    if (!commonShiftStartDate) newErrors.commonShiftStartDate = "共通シフト開始日は必須です。";
    if (!commonShiftEndDate) newErrors.commonShiftEndDate = "共通シフト終了日は必須です。";
    if (commonShiftStartDate && commonShiftEndDate && new Date(commonShiftStartDate) > new Date(commonShiftEndDate)) {
      newErrors.commonShiftEndDate = "共通シフト終了日は開始日以降である必要があります。";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const toggleHoliday = (dateStr) => {
    setSelectedHolidays(prev =>
      prev.includes(dateStr) ? prev.filter(d => d !== dateStr) : [...prev, dateStr].sort()
    );
    if (!selectedHolidays.includes(dateStr)) {
        setSelectedSuspensionDays(prev => prev.filter(d => d !== dateStr));
    }
  };

  const toggleSuspensionDay = (dateStr) => {
    setSelectedSuspensionDays(prev =>
      prev.includes(dateStr) ? prev.filter(d => d !== dateStr) : [...prev, dateStr].sort()
    );
    if (!selectedSuspensionDays.includes(dateStr)) {
        setSelectedHolidays(prev => prev.filter(d => d !== dateStr));
    }
  };

  const handleSubjectSettingChange = (affiliation, subject) => {
    setSubjectSettings(prev => {
      const currentSubjects = prev[affiliation]?.availableSubjects || [];
      const newSubjects = currentSubjects.includes(subject)
        ? currentSubjects.filter(s => s !== subject)
        : [...currentSubjects, subject].sort();
      return { ...prev, [affiliation]: { ...prev[affiliation], availableSubjects: newSubjects } };
    });
  };

  const handleGradeSettingChange = (affiliation, gradesText) => {
    const gradesArray = gradesText.split(',').map(g => g.trim()).filter(g => g);
    setSubjectSettings(prev => ({
      ...prev,
      [affiliation]: { ...prev[affiliation], grades: gradesArray }
    }));
  };

  // 曜日ごとの時限設定を変更するハンドラ
  const handleDayPeriodChange = (day, periodNum, isChecked) => {
    setDefaultShiftPeriodsByDay(prev => {
      const currentPeriods = prev[day] || [];
      const updatedPeriods = isChecked
        ? [...currentPeriods, periodNum].sort((a, b) => a - b)
        : currentPeriods.filter(p => p !== periodNum);
      return { ...prev, [day]: updatedPeriods };
    });
  };


  const handleSave = async () => {
    if (!validate()) return;
    setIsSaving(true);
    const settingsData = {
      commonShiftStartDate,
      commonShiftEndDate,
      holidays: selectedHolidays.sort(), 
      suspensionDays: selectedSuspensionDays.sort(),
      subjectSettingsByAffiliation: subjectSettings,
      defaultShiftPeriodsByDay: defaultShiftPeriodsByDay, // 更新された時限設定を保存
    };
    try {
      const settingsRef = doc(db, ADMIN_SETTINGS_PATH_COLLECTION, ADMIN_SETTINGS_DOC_ID);
      await setDoc(settingsRef, settingsData, { merge: true }); 
      onSave(settingsData); 
      displayNotification("管理設定が保存されました。", "success");
      onClose();
    } catch (error) {
      console.error("Error saving admin settings:", error);
      setErrors(prev => ({ ...prev, firestore: `管理設定の保存に失敗: ${error.message}` }));
      displayNotification(`管理設定の保存に失敗: ${error.message}`, "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      {errors.firestore && <p className="text-red-500 text-sm mb-3 p-2 bg-red-50 rounded-md flex items-center"><AlertTriangle size={16} className="mr-1"/>{errors.firestore}</p>}
      <div className="space-y-6">
        <fieldset className="border p-4 rounded-md">
            <legend className="text-md font-semibold text-indigo-700 px-1">共通シフト入力期間設定</legend>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">開始日 <span className="text-red-500">*</span></label>
                <input type="date" value={commonShiftStartDate} onChange={(e) => setCommonShiftStartDate(e.target.value)}
                    className={`w-full p-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500 ${errors.commonShiftStartDate ? 'border-red-500' : 'border-gray-300'}`} />
                {errors.commonShiftStartDate && <p className="text-red-500 text-xs mt-1">{errors.commonShiftStartDate}</p>}
                </div>
                <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">終了日 <span className="text-red-500">*</span></label>
                <input type="date" value={commonShiftEndDate} onChange={(e) => setCommonShiftEndDate(e.target.value)}
                    className={`w-full p-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500 ${errors.commonShiftEndDate ? 'border-red-500' : 'border-gray-300'}`} />
                {errors.commonShiftEndDate && <p className="text-red-500 text-xs mt-1">{errors.commonShiftEndDate}</p>}
                </div>
            </div>
        </fieldset>

        {commonShiftStartDate && commonShiftEndDate && new Date(commonShiftStartDate) <= new Date(commonShiftEndDate) && (
            <>
                <fieldset className="border p-4 rounded-md">
                    <legend className="text-md font-semibold text-red-700 px-1">休校日設定 (塾全体の休み)</legend>
                    {calendarDates.length > 0 ? (
                    <div className="max-h-[150px] overflow-y-auto border rounded-md p-2 bg-gray-50 mt-2">
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-2">
                            {calendarDates.map(dateObj => {
                                const dateStr = formatDateToYyyyMmDd(dateObj);
                                const dayOfWeekJP = DAYS_OF_WEEK_JP[dateObj.getDay()];
                                const isSelectedHoliday = selectedHolidays.includes(dateStr);
                                const isSuspension = selectedSuspensionDays.includes(dateStr);
                                return (
                                    <button type="button" key={`${dateStr}-holiday`} onClick={() => toggleHoliday(dateStr)} disabled={isSuspension}
                                        className={`p-2 border rounded-md text-xs text-center transition-colors ${isSelectedHoliday ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-white hover:bg-red-100 text-gray-700'} ${isSuspension ? 'opacity-50 cursor-not-allowed bg-gray-200' : ''} `}>
                                        <span className="block font-medium">{dateStr.substring(5)} ({dayOfWeekJP})</span>
                                        {isSelectedHoliday ? <CalendarX size={14} className="mx-auto mt-0.5"/> : <CalendarCheck size={14} className="mx-auto mt-0.5 text-gray-400"/>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    ) : <p className="text-sm text-gray-500 mt-2">共通シフト入力期間に日付がありません。</p>}
                </fieldset>

                <fieldset className="border p-4 rounded-md">
                    <legend className="text-md font-semibold text-amber-700 px-1">通常授業休止日設定 (講習会は実施)</legend>
                    {calendarDates.length > 0 ? (
                    <div className="max-h-[150px] overflow-y-auto border rounded-md p-2 bg-gray-50 mt-2">
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-2">
                            {calendarDates.map(dateObj => {
                                const dateStr = formatDateToYyyyMmDd(dateObj);
                                const dayOfWeekJP = DAYS_OF_WEEK_JP[dateObj.getDay()];
                                const isSelectedSuspensionDay = selectedSuspensionDays.includes(dateStr);
                                const isHoliday = selectedHolidays.includes(dateStr); 
                                return (
                                    <button type="button" key={`${dateStr}-suspension`} onClick={() => toggleSuspensionDay(dateStr)} disabled={isHoliday}
                                        className={`p-2 border rounded-md text-xs text-center transition-colors ${isSelectedSuspensionDay ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-white hover:bg-amber-100 text-gray-700'} ${isHoliday ? 'opacity-50 cursor-not-allowed bg-gray-200' : ''}`}>
                                        <span className="block font-medium">{dateStr.substring(5)} ({dayOfWeekJP})</span>
                                        {isSelectedSuspensionDay ? <CalendarClock size={14} className="mx-auto mt-0.5"/> : <CalendarCheck size={14} className="mx-auto mt-0.5 text-gray-400"/>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ) : <p className="text-sm text-gray-500 mt-2">共通シフト入力期間に日付がありません。</p>}
                </fieldset>
            </>
        )}

        <fieldset className="border p-4 rounded-md">
            <legend className="text-md font-semibold text-purple-700 px-1">デフォルト勤務時限設定</legend>
            <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">全曜日一括設定</h4>
                <div className="flex items-center space-x-2">
                    <label className="text-sm">開始時限:</label>
                    <select
                        value={globalPeriodStart}
                        onChange={(e) => setGlobalPeriodStart(Number(e.target.value))}
                        className="p-2 border rounded-md text-sm"
                    >
                        {AVAILABLE_PERIOD_NUMBERS.map(p => <option key={`global-start-${p}`} value={p}>{p}限</option>)}
                    </select>
                    <label className="text-sm">終了時限:</label>
                    <select
                        value={globalPeriodEnd}
                        onChange={(e) => setGlobalPeriodEnd(Number(e.target.value))}
                        className="p-2 border rounded-md text-sm"
                    >
                        {AVAILABLE_PERIOD_NUMBERS.map(p => <option key={`global-end-${p}`} value={p}>{p}限</option>)}
                    </select>
                </div>
            </div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">曜日別詳細設定</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {DAYS_OF_WEEK_JP.map(day => (
                    <div key={day} className="border p-3 rounded-md bg-white">
                        <h5 className="font-semibold text-sm mb-2 text-gray-800">{day}</h5>
                        <div className="grid grid-cols-3 gap-1">
                            {AVAILABLE_PERIOD_NUMBERS.map(periodNum => (
                                <label key={`${day}-${periodNum}`} className="flex items-center text-xs space-x-1 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={defaultShiftPeriodsByDay[day]?.includes(periodNum) || false}
                                        onChange={(e) => handleDayPeriodChange(day, periodNum, e.target.checked)}
                                        className="form-checkbox h-3.5 w-3.5 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                                    />
                                    <span>{PERIOD_DEFINITIONS[periodNum].label}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </fieldset>

        <fieldset className="border p-4 rounded-md">
            <legend className="text-md font-semibold text-sky-700 px-1">所属別 科目・学年設定</legend>
            <div className="flex border-b mb-4">
                {AFFILIATIONS.map(aff => (
                    <button
                        key={aff}
                        type="button"
                        onClick={() => setActiveAffiliationTab(aff)}
                        className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors
                            ${activeAffiliationTab === aff ? 'border-sky-500 text-sky-600' : 'border-transparent text-gray-500 hover:text-sky-600 hover:border-gray-300'}`}
                    >
                        {aff}
                    </button>
                ))}
            </div>
            {AFFILIATIONS.map(affiliation => (
                <div key={affiliation} className={activeAffiliationTab === affiliation ? 'block' : 'hidden'}>
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">{affiliation}の学年 (カンマ区切り)</label>
                        <input
                            type="text"
                            value={subjectSettings[affiliation]?.grades.join(', ') || ''}
                            onChange={(e) => handleGradeSettingChange(affiliation, e.target.value)}
                            placeholder="例: 1年, 2年, 3年"
                            className="w-full p-2 border border-gray-300 rounded-md focus:ring-sky-500 focus:border-sky-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{affiliation}の受講可能科目</label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-60 overflow-y-auto p-2 border rounded-md bg-gray-50">
                            {ALL_SUBJECTS_MASTER.map(subject => (
                                <label key={`${affiliation}-${subject}`} className="flex items-center space-x-2 p-1 hover:bg-sky-50 rounded-md cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={subjectSettings[affiliation]?.availableSubjects.includes(subject) || false}
                                        onChange={() => handleSubjectSettingChange(affiliation, subject)}
                                        className="form-checkbox h-4 w-4 text-sky-600 border-gray-300 rounded focus:ring-sky-500"
                                    />
                                    <span className="text-sm text-gray-700">{subject}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>
            ))}
        </fieldset>
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

export default AdminSettingsForm;

