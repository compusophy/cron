/**
 * Cron schedule parser and matcher
 * Supports standard cron format: * * * * *
 */
export function shouldRunJob(
  cronSchedule: string,
  lastRunTime: number | null
): boolean {
  const now = new Date()
  const parts = cronSchedule.split(' ').filter((p: string) => p !== '')
  
  if (parts.length !== 5) {
    return false
  }
  
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts
  
  // Check minute
  if (!matchesCronField(minute, now.getMinutes())) return false
  
  // Check hour
  if (!matchesCronField(hour, now.getHours())) return false
  
  // Check day of month
  if (!matchesCronField(dayOfMonth, now.getDate())) return false
  
  // Check month (0-indexed in JS, 1-indexed in cron)
  if (!matchesCronField(month, now.getMonth() + 1)) return false
  
  // Check day of week (0 = Sunday in JS, 0 = Sunday in cron)
  if (!matchesCronField(dayOfWeek, now.getDay())) return false
  
  // If we have a last run time, make sure we haven't already run during this minute slot
  if (lastRunTime !== null) {
    const lastRun = new Date(lastRunTime)

    const sameMinute =
      lastRun.getFullYear() === now.getFullYear() &&
      lastRun.getMonth() === now.getMonth() &&
      lastRun.getDate() === now.getDate() &&
      lastRun.getHours() === now.getHours() &&
      lastRun.getMinutes() === now.getMinutes()

    if (sameMinute) {
      return false
    }
  }
  
  return true
}

function matchesCronField(field: string, value: number): boolean {
  // Exact match
  if (field === value.toString()) return true
  
  // Wildcard
  if (field === '*') return true
  
  // Step values (e.g., */10)
  if (field.includes('/')) {
    const [range, step] = field.split('/')
    const stepNum = parseInt(step, 10)
    
    if (range === '*') {
      return value % stepNum === 0
    }
    
    // Range with step (e.g., 0-59/10)
    if (range.includes('-')) {
      const [start, end] = range.split('-').map(Number)
      return value >= start && value <= end && (value - start) % stepNum === 0
    }
  }
  
  // Ranges (e.g., 0-5)
  if (field.includes('-')) {
    const [start, end] = field.split('-').map(Number)
    return value >= start && value <= end
  }
  
  // Lists (e.g., 1,3,5)
  if (field.includes(',')) {
    const values = field.split(',').map(Number)
    return values.includes(value)
  }
  
  return false
}

