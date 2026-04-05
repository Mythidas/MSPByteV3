export function severityClass(severity: number): string {
  switch (severity) {
    case 3:
      return 'bg-destructive/15 text-destructive border-destructive/30';
    case 2:
      return 'bg-orange-500/15 text-orange-600 border-orange-500/30';
    case 1:
      return 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30';
    case 0:
      return 'bg-blue-500/15 text-blue-600 border-blue-500/30';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

export function alertStatusClass(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-destructive/15 text-destructive border-destructive/30';
    case 'resolved':
      return 'bg-green-500/15 text-green-600 border-green-500/30';
    case 'suppressed':
      return 'bg-muted text-muted-foreground';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

export const AlertSeverity = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
} as const;
export type AlertSeverity = (typeof AlertSeverity)[keyof typeof AlertSeverity];

export const SEVERITY_LABELS: Record<number, string> = {
  [AlertSeverity.LOW]: 'Low',
  [AlertSeverity.MEDIUM]: 'Medium',
  [AlertSeverity.HIGH]: 'High',
  [AlertSeverity.CRITICAL]: 'Critical',
};
