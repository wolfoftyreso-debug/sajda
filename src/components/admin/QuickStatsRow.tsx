import { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";

interface QuickStatProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color?: "primary" | "success" | "warning" | "destructive";
  subtext?: string;
}

function QuickStat({ label, value, icon: Icon, color = "primary", subtext }: QuickStatProps) {
  const colorClasses = {
    primary: "text-primary bg-primary/10",
    success: "text-success bg-success/10",
    warning: "text-warning bg-warning/10",
    destructive: "text-destructive bg-destructive/10"
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-xl border border-border bg-card p-5 hover:border-primary/50 transition-colors group"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-3xl font-bold mt-1">{value}</p>
          {subtext && <p className="text-xs text-muted-foreground mt-1">{subtext}</p>}
        </div>
        <div className={`p-3 rounded-xl ${colorClasses[color]} transition-transform group-hover:scale-110`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      
      {/* Decorative gradient */}
      <div className={`absolute -bottom-8 -right-8 w-24 h-24 rounded-full ${colorClasses[color]} opacity-30 blur-2xl`} />
    </motion.div>
  );
}

interface QuickStatsRowProps {
  stats: QuickStatProps[];
}

export function QuickStatsRow({ stats }: QuickStatsRowProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map((stat, index) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
        >
          <QuickStat {...stat} />
        </motion.div>
      ))}
    </div>
  );
}
