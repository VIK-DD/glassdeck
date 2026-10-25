// CPU and memory from Node's os module; GPU from nvidia-smi (NVIDIA cards only) running in loop mode.
// CPU temperature is deliberately absent: Windows only exposes it to elevated processes.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { cpus, freemem, totalmem, type CpuInfo } from 'node:os';
import { createInterface } from 'node:readline';
import type { GpuInfo, SystemInfo } from '../../src/core/pc';

const SAMPLE_MS = 1000;
const NVIDIA_QUERY = 'name,utilization.gpu,temperature.gpu,memory.used,memory.total';
const BYTES_PER_MB = 1024 * 1024;

type CpuTimes = CpuInfo['times'];

/** Busy share (0–100) of all cores between two os.cpus() snapshots. */
export function cpuLoad(previous: readonly CpuTimes[], current: readonly CpuTimes[]): number {
  let busy = 0;
  let total = 0;
  current.forEach((times, i) => {
    const before = previous[i];
    if (!before) return;
    const idle = times.idle - before.idle;
    const all = times.user + times.nice + times.sys + times.irq + times.idle - (before.user + before.nice + before.sys + before.irq + before.idle);
    busy += all - idle;
    total += all;
  });
  return total > 0 ? Math.round((busy / total) * 1000) / 10 : 0;
}

/** Parses one `nvidia-smi --format=csv,noheader,nounits` line, e.g. "NVIDIA GeForce RTX 4060, 31, 53.09, 1827, 8188". */
export function parseNvidiaSmiLine(line: string): GpuInfo | null {
  const parts = line.split(',').map((part) => part.trim());
  if (parts.length < 5) return null;
  const numbers = parts.slice(-4).map(Number);
  if (numbers.some((value) => !Number.isFinite(value))) return null;
  const [load, temperatureC, memoryUsedMb, memoryTotalMb] = numbers;
  return { name: parts.slice(0, -4).join(', '), load, temperatureC: Math.round(temperatureC), memoryUsedMb, memoryTotalMb };
}

export function createSystemMonitor(onSample: (info: SystemInfo) => void) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let gpuProcess: ChildProcessWithoutNullStreams | null = null;
  let gpu: GpuInfo | null = null;
  let previousCpu = cpus().map((cpu) => cpu.times);

  function startGpu() {
    try {
      gpuProcess = spawn('nvidia-smi', [`--query-gpu=${NVIDIA_QUERY}`, '--format=csv,noheader,nounits', `-lms`, String(SAMPLE_MS)], {
        windowsHide: true,
      });
    } catch {
      return;
    }
    gpuProcess.on('error', () => {
      gpuProcess = null; // No NVIDIA driver: GPU stays null.
    });
    gpuProcess.on('exit', () => {
      gpuProcess = null;
      gpu = null;
    });
    // Multi-GPU systems print one line per GPU each tick; the first one is the one we show.
    let firstName: string | null = null;
    createInterface({ input: gpuProcess.stdout }).on('line', (line) => {
      const parsed = parseNvidiaSmiLine(line);
      if (!parsed) return;
      firstName ??= parsed.name;
      if (parsed.name === firstName) gpu = parsed;
    });
  }

  return {
    get gpuName(): string | null {
      return gpu?.name ?? null;
    },
    start() {
      startGpu();
      timer = setInterval(() => {
        const currentCpu = cpus().map((cpu) => cpu.times);
        const info: SystemInfo = {
          cpuLoad: cpuLoad(previousCpu, currentCpu),
          memoryUsedMb: Math.round((totalmem() - freemem()) / BYTES_PER_MB),
          memoryTotalMb: Math.round(totalmem() / BYTES_PER_MB),
          gpu,
        };
        previousCpu = currentCpu;
        onSample(info);
      }, SAMPLE_MS);
    },
    stop() {
      clearInterval(timer);
      gpuProcess?.kill();
      gpuProcess = null;
    },
  };
}
