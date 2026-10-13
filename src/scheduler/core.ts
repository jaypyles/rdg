/*
 * Lightweight in-process scheduler for named interval and daily tasks.
 * Supports immediate or delayed first runs, and optional overlap skipping.
 */

export type ScheduleTask = {
  id: string;
  intervalMs: number;
  run: () => void | Promise<void>;
  /** Run as soon as the task is scheduled. Defaults to true. */
  immediate?: boolean;
  /** Delay before the first run when immediate is false. */
  delayMs?: number;
  /** When a tick is still running, skip the next one. Defaults to true. */
  skipIfRunning?: boolean;
  onError?: (error: unknown) => void;
};

export type DailyTask = {
  id: string;
  /** Local hour of day, 0–23. */
  hour: number;
  /** Local minute, 0–59. Defaults to 0. */
  minute?: number;
  run: () => void | Promise<void>;
  /** When a tick is still running, skip the next one. Defaults to true. */
  skipIfRunning?: boolean;
  onError?: (error: unknown) => void;
};

export type ScheduledHandle = {
  id: string;
  stop: () => void;
};

type TaskOptions = ScheduleTask | (DailyTask & { intervalMs?: never });

type InternalTask = {
  options: TaskOptions;
  timer: ReturnType<typeof setInterval> | null;
  delayTimer: ReturnType<typeof setTimeout> | null;
  running: boolean;
  kind: "every" | "daily";
};

export type Scheduler = {
  every: (task: ScheduleTask) => ScheduledHandle;
  daily: (task: DailyTask) => ScheduledHandle;
  stop: (id: string) => boolean;
  stopAll: () => void;
  has: (id: string) => boolean;
  ids: () => string[];
};

export const msUntilNextLocalTime = (hour: number, minute = 0): number => {
  const now = new Date();
  const next = new Date(now);

  next.setHours(hour, minute, 0, 0);

  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }

  return next.getTime() - now.getTime();
};

export const createScheduler = (): Scheduler => {
  const tasks = new Map<string, InternalTask>();

  const clearTimers = (task: InternalTask): void => {
    if (task.timer !== null) {
      clearInterval(task.timer);
      task.timer = null;
    }

    if (task.delayTimer !== null) {
      clearTimeout(task.delayTimer);
      task.delayTimer = null;
    }
  };

  const stop = (id: string): boolean => {
    const task = tasks.get(id);

    if (!task) {
      return false;
    }

    clearTimers(task);
    tasks.delete(id);

    return true;
  };

  const tick = async (task: InternalTask): Promise<void> => {
    const { options } = task;

    if (options.skipIfRunning !== false && task.running) {
      return;
    }

    task.running = true;

    try {
      await options.run();
    } catch (error) {
      options.onError?.(error);
    } finally {
      task.running = false;
    }
  };

  const startInterval = (task: InternalTask): void => {
    const intervalMs = task.options.intervalMs;

    if (intervalMs === undefined) {
      throw new Error(`schedule "${task.options.id}": missing intervalMs`);
    }

    task.timer = setInterval(() => void tick(task), intervalMs);
  };

  const scheduleDaily = (task: InternalTask): void => {
    const { hour, minute = 0 } = task.options as DailyTask;
    const delayMs = msUntilNextLocalTime(hour, minute);

    task.delayTimer = setTimeout(() => {
      task.delayTimer = null;

      void (async () => {
        await tick(task);

        if (tasks.get(task.options.id) === task) {
          scheduleDaily(task);
        }
      })();
    }, delayMs);
  };

  const handleFor = (id: string): ScheduledHandle => ({
    id,
    stop: () => {
      stop(id);
    },
  });

  const every = (options: ScheduleTask): ScheduledHandle => {
    if (options.intervalMs <= 0) {
      throw new Error(`schedule "${options.id}": intervalMs must be > 0`);
    }

    stop(options.id);

    const task: InternalTask = {
      options,
      timer: null,
      delayTimer: null,
      running: false,
      kind: "every",
    };

    tasks.set(options.id, task);

    const immediate = options.immediate !== false;
    const delayMs = options.delayMs ?? 0;

    if (immediate) {
      void tick(task);
      startInterval(task);
    } else if (delayMs > 0) {
      task.delayTimer = setTimeout(() => {
        task.delayTimer = null;
        void tick(task);
        startInterval(task);
      }, delayMs);
    } else {
      startInterval(task);
    }

    return handleFor(options.id);
  };

  const daily = (options: DailyTask): ScheduledHandle => {
    if (options.hour < 0 || options.hour > 23) {
      throw new Error(`schedule "${options.id}": hour must be 0–23`);
    }

    const minute = options.minute ?? 0;

    if (minute < 0 || minute > 59) {
      throw new Error(`schedule "${options.id}": minute must be 0–59`);
    }

    stop(options.id);

    const task: InternalTask = {
      options: { ...options, minute },
      timer: null,
      delayTimer: null,
      running: false,
      kind: "daily",
    };

    tasks.set(options.id, task);
    scheduleDaily(task);

    return handleFor(options.id);
  };

  return {
    every,
    daily,
    stop,
    stopAll: () => {
      for (const id of [...tasks.keys()]) {
        stop(id);
      }
    },
    has: (id) => tasks.has(id),
    ids: () => [...tasks.keys()],
  };
};

export const scheduler = createScheduler();
