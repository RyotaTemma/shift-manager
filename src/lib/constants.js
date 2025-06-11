export const DAYS_OF_WEEK_JP = ["日", "月", "火", "水", "木", "金", "土"];
export const ALL_SUBJECTS_MASTER = [ 
  "算数", "国語", "理科", "社会", "生活", "英語", "道徳", "音楽", "図画工作", "体育", "家庭科",
  "数学", "物理", "化学", "生物", "地学", 
  "現代文", "古文", "漢文", "日本史A", "日本史B", "世界史A", "世界史B", "地理A", "地理B", "現代社会", "倫理", "政治・経済",
  "数学I", "数学A", "数学II", "数学B", "数学III", 
  "物理基礎", "化学基礎", "生物基礎", "地学基礎",
  "情報", "プログラミング", "書道"
].sort();

export const PERIOD_DEFINITIONS = {
  1: { id: 1, label: "1限", time: "14:00-15:30" },
  2: { id: 2, label: "2限", time: "16:20-17:50" },
  3: { id: 3, label: "3限", time: "18:00-19:30" },
  4: { id: 4, label: "4限", time: "19:40-21:10" },
  5: { id: 5, label: "5限", time: "21:20-22:00" },
  6: { id: 6, label: "6限", time: "22:10-22:50" },
};
export const AVAILABLE_PERIOD_NUMBERS = Object.keys(PERIOD_DEFINITIONS).map(Number);
export const MIN_DESIRED_PERIODS_OPTIONS = [1, 2, 3, 4];
export const AFFILIATIONS = ["小学生", "中学生", "高校生"];

export const DEFAULT_SUBJECT_SETTINGS = {
  "小学生": {
    grades: ["1年", "2年", "3年", "4年", "5年", "6年"],
    availableSubjects: ["算数", "国語", "理科", "社会", "英語"],
  },
  "中学生": {
    grades: ["1年", "2年", "3年"],
    availableSubjects: ["数学", "国語", "理科", "社会", "英語"],
  },
  "高校生": {
    grades: ["1年", "2年", "3年"],
    availableSubjects: ["数学I", "数学A", "数学II", "数学B", "英語", "現代文", "古文", "物理基礎", "化学基礎"],
  },
};

export const DEFAULT_OPERATION_SETTINGS = {
  defaultShiftPeriodsByDay: { 
    "月": [2, 3, 4, 5, 6], "火": [2, 3, 4, 5, 6], "水": [2, 3, 4, 5, 6],
    "木": [2, 3, 4, 5, 6], "金": [2, 3, 4, 5, 6], "土": [2, 3, 4, 5], "日": [],
  },
  commonShiftStartDate: '', 
  commonShiftEndDate: '',   
  holidays: [], 
  suspensionDays: [], 
  subjectSettingsByAffiliation: DEFAULT_SUBJECT_SETTINGS,
};
