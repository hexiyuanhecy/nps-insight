import type { ScheduleUnit } from '@/components/admin/config-center/types';

/** 调度工具函数（自然语言 → cron） */
export function buildCronFromSchedule(
  unit: ScheduleUnit,
  every: number,
  time: string,
  weekDay: number,
  monthDay: number,
): string {
  const [hr, mn] = (time || '09:00').split(':').map((x) => parseInt(x, 10));
  const safeHr = isNaN(hr) ? 9 : hr;
  const safeMn = isNaN(mn) ? 0 : mn;
  if (unit === 'day') {
    if (every <= 1) return `${safeMn} ${safeHr} * * *`;
    return `${safeMn} ${safeHr} */${every} * *`;
  }
  if (unit === 'week') {
    const wd = Math.max(0, Math.min(6, (weekDay || 1) - 1));
    if (every <= 1) return `${safeMn} ${safeHr} * * ${wd}`;
    return `${safeMn} ${safeHr} * * ${wd}/${every}`;
  }
  // month
  const md = Math.max(1, Math.min(31, monthDay || 1));
  if (every <= 1) return `${safeMn} ${safeHr} ${md} * *`;
  return `${safeMn} ${safeHr} ${md} */${every} *`;
}
