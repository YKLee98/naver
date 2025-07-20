// packages/shared/src/utils/date.utils.ts
import { format, parseISO, differenceInSeconds, differenceInMinutes, differenceInHours, differenceInDays } from 'date-fns';
import { ko } from 'date-fns/locale';

export function formatDate(date: string | Date, formatString: string = 'yyyy-MM-dd'): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return format(dateObj, formatString, { locale: ko });
}

export function formatDateTime(date: string | Date): string {
  return formatDate(date, 'yyyy-MM-dd HH:mm:ss');
}

export function formatRelativeTime(date: string | Date): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  const now = new Date();
  
  const seconds = differenceInSeconds(now, dateObj);
  const minutes = differenceInMinutes(now, dateObj);
  const hours = differenceInHours(now, dateObj);
  const days = differenceInDays(now, dateObj);

  if (seconds < 60) return `${seconds}초 전`;
  if (minutes < 60) return `${minutes}분 전`;
  if (hours < 24) return `${hours}시간 전`;
  if (days < 7) return `${days}일 전`;
  
  return formatDate(dateObj, 'MM월 dd일');
}

