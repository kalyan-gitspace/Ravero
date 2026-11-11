export function getGreetingForTime(date: Date): string {
  const hour = date.getHours();

  if (hour < 5) return 'Hello there!';
  if (hour < 12) return 'Good morning';
  if (hour < 16) return 'Good afternoon';
  return 'Good evening';
}
