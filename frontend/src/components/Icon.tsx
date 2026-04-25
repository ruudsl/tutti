import {
  Home,
  Music,
  Calendar,
  Users,
  Wrench,
  BookOpen,
  Package,
  Settings as SettingsIcon,
  GraduationCap,
  User,
  Search,
  Bell,
  Sun,
  Moon,
  Monitor,
  X,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  ChevronRight,
  Music2,
  Hand,
  Upload,
  FileText,
  ListMusic,
  PartyPopper,
  Pencil,
  type LucideIcon,
} from 'lucide-react';

const iconMap: Record<string, LucideIcon> = {
  home: Home,
  music: Music,
  music2: Music2,
  calendar: Calendar,
  users: Users,
  wrench: Wrench,
  book: BookOpen,
  package: Package,
  settings: SettingsIcon,
  graduationCap: GraduationCap,
  user: User,
  search: Search,
  bell: Bell,
  sun: Sun,
  moon: Moon,
  monitor: Monitor,
  close: X,
  menu: Menu,
  collapse: PanelLeftClose,
  expand: PanelLeftOpen,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  hand: Hand,
  upload: Upload,
  fileText: FileText,
  listMusic: ListMusic,
  partyPopper: PartyPopper,
  pencil: Pencil,
};

interface IconProps {
  name: keyof typeof iconMap;
  size?: number;
  strokeWidth?: number;
  className?: string;
  'aria-hidden'?: boolean;
}

export function Icon({ name, size = 20, strokeWidth = 2, className, ...rest }: IconProps) {
  const Component = iconMap[name];
  if (!Component) return null;
  return (
    <Component
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden={rest['aria-hidden'] ?? true}
    />
  );
}

export type IconName = keyof typeof iconMap;
