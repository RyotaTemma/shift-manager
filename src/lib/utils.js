export const formatDateToYyyyMmDd = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return ''; 
  const year = d.getFullYear();
  const month = (`0${d.getMonth() + 1}`).slice(-2);
  const day = (`0${d.getDate()}`).slice(-2);
  return `${year}-${month}-${day}`;
};

export const getDatesInRange = (startDate, endDate) => {
  if (!startDate || !endDate) return [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  const dates = [];
  
  start.setHours(0, 0, 0, 0);
  end.setHours(0,0,0,0);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return []; 
  }

  let currentDate = new Date(start);
  while (currentDate <= end) {
    dates.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return dates;
};
