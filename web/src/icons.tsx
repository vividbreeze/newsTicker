import { Star, Landmark, TrendingUp, Cpu, Atom, HeartPulse, Drama, Trophy, type LucideIcon } from 'lucide-react';
const map: Record<string, LucideIcon> = { Star, Landmark, TrendingUp, Cpu, Atom, HeartPulse, Drama, Trophy };
export function CategoryIcon({ name, size = 16 }: { name: string; size?: number }) {
  const I = map[name] ?? Star;
  return <I size={size} aria-hidden />;
}
