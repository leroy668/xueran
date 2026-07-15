import {
  Bird,
  BookOpen,
  ChefHat,
  CircleDot,
  Crown,
  Cross,
  Eye,
  FlaskConical,
  Ghost,
  GitBranch,
  Hand,
  Heart,
  HeartCrack,
  Landmark,
  Search,
  Shield,
  Shirt,
  Shovel,
  Umbrella,
  Wine,
  type LucideIcon,
} from "lucide-react";

const roleIconMap: Record<string, LucideIcon> = {
  washerwoman: Shirt,
  librarian: BookOpen,
  investigator: Search,
  chef: ChefHat,
  empath: Heart,
  "fortune-teller": Eye,
  monk: Hand,
  undertaker: Shovel,
  ravenkeeper: Bird,
  soldier: Shield,
  mayor: Landmark,
  recluse: Ghost,
  drunk: Wine,
  butler: Umbrella,
  saint: Cross,
  poisoner: FlaskConical,
  "scarlet-woman": HeartCrack,
  baron: Crown,
  imp: GitBranch,
};

export function RoleIcon({
  roleId,
  size = 18,
  strokeWidth = 1.8,
  className,
}: {
  roleId: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const Icon = roleIconMap[roleId] ?? CircleDot;
  return (
    <Icon
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden="true"
    />
  );
}
