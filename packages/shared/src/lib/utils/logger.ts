import { SupabaseClient } from "@supabase/supabase-js";
import { isJson, isString } from "@workspace/shared/lib/utils/validators";
import { Database } from "@workspace/shared/types/schema";

export type LogLevel = "trace" | "info" | "warn" | "error" | "fatal";

export type APIError = {
  module: string;
  context: string;
  message: string;
  time?: string;
};

export type APIResponse<T> =
  | { data: T; error?: undefined; meta?: Record<string, unknown> }
  | { data?: undefined; error: APIError; meta?: Record<string, unknown> };

export interface LogInfo {
  module: string;
  context: string;
  message: string;
  meta?: Record<string, unknown>;
  /** Attach the original error to include its stack trace in console output. */
  err?: unknown;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  trace: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

function format(level: LogLevel, info: LogInfo): string {
  const time = new Date().toLocaleTimeString();
  return `[${time}][${level.toUpperCase()}][${info.module}][${info.context}] ${info.message}`;
}

function extractStack(err: unknown): string | undefined {
  if (err instanceof Error && err.stack) return err.stack;
  return undefined;
}

export class Logger {
  static level: LogLevel = "trace";

  static trace(info: LogInfo): void {
    if (LEVEL_ORDER["trace"] < LEVEL_ORDER[Logger.level]) return;
    console.debug(format("trace", info));
  }

  static info(info: LogInfo): void {
    if (LEVEL_ORDER["info"] < LEVEL_ORDER[Logger.level]) return;
    console.info(format("info", info));
  }

  static warn(info: LogInfo): void {
    if (LEVEL_ORDER["warn"] < LEVEL_ORDER[Logger.level]) return;
    console.warn(format("warn", info));
  }

  static error(info: LogInfo): { error: APIError } {
    if (LEVEL_ORDER["error"] >= LEVEL_ORDER[Logger.level]) {
      const stack = extractStack(info.err);
      console.error(format("error", info), stack ? `\n${stack}` : "");
    }
    return {
      error: {
        module: info.module,
        context: info.context,
        message: info.message,
        time: new Date().toISOString(),
      },
    };
  }

  static fatal(info: LogInfo): { error: APIError } {
    if (LEVEL_ORDER["fatal"] >= LEVEL_ORDER[Logger.level]) {
      const stack = extractStack(info.err);
      console.error(format("fatal", info), stack ? `\n${stack}` : "");
    }
    return {
      error: {
        module: info.module,
        context: info.context,
        message: info.message,
        time: new Date().toISOString(),
      },
    };
  }

  static response(body: APIResponse<unknown>, status: number): Response {
    if (status !== 200 && body.error) {
      console.error(
        format("error", {
          module: body.error.module,
          context: body.error.context,
          message: `${body.error.message} | ${status}`,
        }),
      );
    }
    return Response.json(body, { status });
  }

  static isLogLevel(value: unknown): value is LogLevel {
    if (!isString(value)) return false;
    return ["trace", "info", "warn", "error", "fatal"].includes(value);
  }

  static async diagnosticLog(
    supabase: SupabaseClient<Database>,
    entry: {
      tenant_id: string;
      level: LogLevel;
      module: string;
      context: string;
      message: string;
      meta?: Record<string, unknown>;
    },
  ): Promise<void> {
    await supabase.from("diagnostic_logs").insert({
      tenant_id: entry.tenant_id,
      level: entry.level,
      module: entry.module,
      context: entry.context,
      message: entry.message,
      meta: isJson(entry.meta) ? entry.meta : null,
    });
  }

  static async auditLog(
    supabase: SupabaseClient<Database>,
    entry: {
      tenant_id: string;
      actor: string; // 'system' | userId | 'pipeline'
      action: string; // 'role_assigned' | 'consent_granted' | 'connection_deleted' | etc.
      target_type: string; // 'integration_connection' | 'site' | etc.
      target_id: string;
      result: "success" | "failure";
      detail?: Record<string, unknown>;
    },
  ): Promise<void> {
    await supabase.from("audit_logs").insert({
      tenant_id: entry.tenant_id,
      actor: entry.actor,
      action: entry.action,
      target_type: entry.target_type,
      target_id: entry.target_id,
      result: entry.result,
      detail: isJson(entry.detail) ? entry.detail : null,
    });
  }
}
