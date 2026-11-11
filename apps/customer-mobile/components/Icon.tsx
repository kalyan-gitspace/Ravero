import type { LucideIcon } from 'lucide-react-native';

interface IconProps {
  icon: LucideIcon;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Icon({
  icon: IconComponent,
  size = 20,
  color = '#000000',
  strokeWidth = 1.8,
}: IconProps) {
  return <IconComponent color={color} size={size} strokeWidth={strokeWidth} />;
}
