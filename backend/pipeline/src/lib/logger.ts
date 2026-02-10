import chalk from 'chalk';

type LogLevel = 'trace' | 'info' | 'warn' | 'error' | 'fatal';
type LogMessage = {
  module?: string;
  context: string;
  message: string;
  level: LogLevel;
};

const LEVEL_ORDER: Record<LogLevel, number> = {
  trace: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

export class Logger {
  static level: LogLevel = 'trace';

  static log({ module = 'Pipeline', context, message, level }: LogMessage) {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[Logger.level]) return;

    const fullMessage = `[${new Date().toLocaleTimeString()}][${level.toUpperCase()}][${module}][${context}] ${message}`;
    switch (level) {
      case 'trace':
        console.log(chalk.gray(fullMessage));
        return;
      case 'info':
        console.log(fullMessage);
        return;
      case 'warn':
        console.log(chalk.yellow(fullMessage));
        return;
      case 'error':
        console.log(chalk.red(fullMessage));
        return;
      case 'fatal':
        console.log(chalk.magenta(fullMessage));
        return;
      default:
        console.log(chalk.blue(fullMessage));
    }
  }
}
