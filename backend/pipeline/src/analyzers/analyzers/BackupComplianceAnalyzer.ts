import { BaseAnalyzer } from '../BaseAnalyzer.js';
import { Logger } from '../../lib/logger.js';
import type { AnalysisContext, AnalyzerResult } from '../../types.js';

/**
 * BackupComplianceAnalyzer - Cove-specific.
 * Detects backup devices with failed or missed backups.
 */
export class BackupComplianceAnalyzer extends BaseAnalyzer {
  getName(): string {
    return 'BackupComplianceAnalyzer';
  }

  async analyze(context: AnalysisContext): Promise<AnalyzerResult> {
    const result = this.createEmptyResult();

    if (context.integrationId !== 'cove') return result;

    for (const device of context.entities.backup_devices) {
      const data = device.raw_data;
      const flags = data?.Flags;
      const settings = data?.Settings;

      // Check for common Cove failure indicators
      const hasErrors = flags?.FS_ERRORS || flags?.BackupServerSynchronizationFailed;
      const lastSessionStatus = settings?.OsType ? data?.LastSessionStatus : null;
      const isOverdue = this.isBackupOverdue(data);

      if (hasErrors || lastSessionStatus === 'Failed' || isOverdue) {
        const deviceName =
          settings?.DS_SYSTEM_NAME || device.display_name || device.external_id;

        const severity = hasErrors ? 'high' : isOverdue ? 'medium' : 'high';

        const alert = this.createAlert(
          device.id,
          'backup-failed',
          severity,
          hasErrors
            ? `Backup device '${deviceName}' has errors`
            : isOverdue
              ? `Backup device '${deviceName}' backup is overdue`
              : `Backup device '${deviceName}' last backup failed`,
          {
            deviceName,
            hasErrors: !!hasErrors,
            isOverdue,
            lastSessionStatus,
          },
        );

        result.alerts.push(alert);
        this.addTags(result, device.id, [
          {
            tag: hasErrors ? 'Backup Error' : isOverdue ? 'Backup Overdue' : 'Backup Failed',
            category: 'status',
            source: 'backup-analyzer',
          },
        ]);
        this.setState(result, device.id, hasErrors ? 'critical' : 'warn');
      } else {
        this.setState(result, device.id, 'normal');
      }
    }

    Logger.log({
      module: 'BackupComplianceAnalyzer',
      context: 'analyze',
      message: `Complete: ${result.alerts.length} alerts, ${result.entityTags.size} tagged`,
      level: 'info',
    });

    return result;
  }

  private isBackupOverdue(data: any): boolean {
    const lastCompletedSession = data?.Settings?.DS_LAST_BACKUP_TIME;
    if (!lastCompletedSession) return false;

    const lastBackup = new Date(lastCompletedSession).getTime();
    const overdueThreshold = Date.now() - 48 * 60 * 60 * 1000; // 48 hours
    return lastBackup < overdueThreshold;
  }
}
