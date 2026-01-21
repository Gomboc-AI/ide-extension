import * as vscode from 'vscode';
import logger from './logger';

/**
 * Unique marker to filter profiling logs reliably.
 * Intentionally weird so it won't collide with other log messages.
 */
export const PROFILING_MARKER = 'GOMBOC_PROFILING::V1::TIMING_EVENT';

type TimerPoint = {
  name: string;
  msSinceStart: number;
  msSincePrev: number;
};

type Profiler = {
  enabled: boolean;
  scanId: string;
  mark: (name: string, fields?: Record<string, unknown>) => void;
  end: (fields?: Record<string, unknown>) => void;
};

function nowMs(): number {
  // High-resolution timing; convert to ms.
  return Number(process.hrtime.bigint() / 1_000_000n);
}

export function isProfilingEnabled(): boolean {
  // Env toggle (useful for CI/dev runs)
  const env =
    (process.env.GOMBOC_PROFILING_ENABLED || process.env.GOMBOC_PROFILE) ?? '';
  if (typeof env === 'string' && env.trim()) {
    const v = env.trim().toLowerCase();
    if (v === '1' || v === 'true' || v === 'yes' || v === 'on') {
      return true;
    }
    if (v === '0' || v === 'false' || v === 'no' || v === 'off') {
      return false;
    }
  }

  // Settings toggle (user-friendly)
  try {
    const cfg = vscode.workspace.getConfiguration('gomboc-vscode-extension');
    const v = cfg.get('profilingEnabled') as unknown;
    return typeof v === 'boolean' ? v : false;
  } catch {
    return false;
  }
}

export function createProfiler(args: {
  scanId: string;
  component: string;
  baseFields?: Record<string, unknown>;
}): Profiler {
  const enabled = isProfilingEnabled();
  const { scanId, component, baseFields } = args;
  if (!enabled) {
    return {
      enabled: false,
      scanId,
      mark: () => {},
      end: () => {},
    };
  }

  const startMs = nowMs();
  let prevMs = startMs;
  const points: TimerPoint[] = [];

  const emit = (event: string, fields?: Record<string, unknown>) => {
    logger.info(PROFILING_MARKER, {
      event,
      scanId,
      component,
      ...(baseFields || {}),
      ...(fields || {}),
    });
  };

  emit('start');

  return {
    enabled: true,
    scanId,
    mark: (name, fields) => {
      const t = nowMs();
      const msSinceStart = t - startMs;
      const msSincePrev = t - prevMs;
      prevMs = t;
      points.push({ name, msSinceStart, msSincePrev });
      emit('mark', { name, msSinceStart, msSincePrev, ...(fields || {}) });
    },
    end: fields => {
      const endMs = nowMs();
      const totalMs = endMs - startMs;
      emit('end', {
        totalMs,
        points,
        ...(fields || {}),
      });
    },
  };
}
