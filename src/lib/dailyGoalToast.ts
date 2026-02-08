import { todayYmd } from './progress';

const KEY = 'ets_daily_goal_reached_toast_ymd';

export function hasShownDailyGoalReachedToast(ymd?: string): boolean {
  const key = ymd ?? todayYmd();
  try {
    return localStorage.getItem(KEY) === key;
  } catch {
    return false;
  }
}

export function markDailyGoalReachedToastShown(ymd?: string) {
  const key = ymd ?? todayYmd();
  try {
    localStorage.setItem(KEY, key);
  } catch {
    // ignore (e.g. private mode)
  }
}
