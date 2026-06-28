import type { ScheduleUnit } from '@/components/admin/config-center/types';

/** 调度工具函数（自然语言 → cron） */
export function buildCronFromSchedule(
  unit: ScheduleUnit | undefined,
  every: number | undefined,
  time: string | undefined,
  weekDay: number | undefined,
  monthDay: number | undefined,
): string {
  // 安全默认值
  const safeUnit: ScheduleUnit = unit === 'day' || unit === 'week' || unit === 'month' ? unit : 'week';
  const safeEvery = typeof every === 'number' && every > 0 ? every : 1;
  const [hr, mn] = (time || '09:00').split(':').map((x) => parseInt(x, 10));
  const safeHr = isNaN(hr) ? 9 : hr;
  const safeMn = isNaN(mn) ? 0 : mn;

  if (safeUnit === 'day') {
    if (safeEvery <= 1) return `${safeMn} ${safeHr} * * *`;
    return `${safeMn} ${safeHr} */${safeEvery} * *`;
  }
  if (safeUnit === 'week') {
    const wd = typeof weekDay === 'number' ? Math.max(0, Math.min(6, weekDay - 1)) : 1;
    if (safeEvery <= 1) return `${safeMn} ${safeHr} * * ${wd}`;
    return `${safeMn} ${safeHr} * * ${wd}/${safeEvery}`;
  }
  // month
  const md = typeof monthDay === 'number' ? Math.max(1, Math.min(31, monthDay)) : 1;
  if (safeEvery <= 1) return `${safeMn} ${safeHr} ${md} * *`;
  return `${safeMn} ${safeHr} ${md} */${safeEvery} *`;
}
