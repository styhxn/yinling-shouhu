import React from "react";
import {
  ChevronDown,
  ChevronRight,
  SquarePen,
  FileText,
  MapPin,
  Settings,
  Home,
  TriangleAlert,
  Sun,
  LoaderCircle,
  Sparkles,
  CircleAlert,
  MessageSquare,
  Mic,
  Activity,
  Bell,
  Smartphone,
  ArrowRight,
  User,
  LayoutGrid,
  Smile,
  Shield,
  Bot,
  CreditCard,
  CircleCheck,
  Send,
  BookOpen,
  Phone,
  LogOut,
  Users,
  Image as ImageIcon,
  Link2,
  X,
  Check,
  Clock,
  ShieldCheck,
  Map,
  Pill,
  Volume2,
  VolumeX,
  Camera,
  RefreshCw,
  Plus,
  ChevronLeft,
  Play,
  Square,
  Download,
  type LucideIcon,
} from "lucide-react";

/**
 * 统一图标注册表：界面所有图标均从此处取用，确保风格一致（24px 线性描边）、多端适配完善。
 * 新增图标时，从 lucide-react 引入并登记到 REGISTRY 即可。
 */
const REGISTRY = {
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  pencil: SquarePen,
  fileText: FileText,
  mapPin: MapPin,
  settings: Settings,
  home: Home,
  alertTriangle: TriangleAlert,
  sun: Sun,
  spinner: LoaderCircle,
  sparkles: Sparkles,
  alertCircle: CircleAlert,
  message: MessageSquare,
  mic: Mic,
  activity: Activity,
  bell: Bell,
  smartphone: Smartphone,
  arrowRight: ArrowRight,
  user: User,
  layoutGrid: LayoutGrid,
  smile: Smile,
  shield: Shield,
  bot: Bot,
  creditCard: CreditCard,
  circleCheck: CircleCheck,
  send: Send,
  bookOpen: BookOpen,
  phone: Phone,
  logOut: LogOut,
  users: Users,
  image: ImageIcon,
  link: Link2,
  close: X,
  check: Check,
  clock: Clock,
  shieldCheck: ShieldCheck,
  map: Map,
  pill: Pill,
  volume: Volume2,
  volumeOff: VolumeX,
  camera: Camera,
  refresh: RefreshCw,
  plus: Plus,
  chevronLeft: ChevronLeft,
  play: Play,
  stop: Square,
  download: Download,
} as const;

export type IconName = keyof typeof REGISTRY;

const SIZE_PX: Record<"sm" | "md" | "lg" | "xl", number> = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
};

export interface IconProps {
  name: IconName;
  size?: "sm" | "md" | "lg" | "xl" | number;
  strokeWidth?: number;
  className?: string;
  color?: string;
}

export function Icon({ name, size = "md", strokeWidth = 2, className, color }: IconProps) {
  const Cmp: LucideIcon = REGISTRY[name];
  const px = typeof size === "number" ? size : SIZE_PX[size];
  return (
    <Cmp
      size={px}
      strokeWidth={strokeWidth}
      className={className}
      color={color}
      aria-hidden="true"
      focusable="false"
    />
  );
}
