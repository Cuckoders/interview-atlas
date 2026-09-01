import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import type { CodeRunResult, TaskRunnerConfig } from '../learning-lab-domain.js';

export interface CodeRunner {
  run(code: string, config: TaskRunnerConfig): Promise<CodeRunResult>;
}

export class DisabledCodeRunner implements CodeRunner {
  async run(): Promise<CodeRunResult> {
    throw new CodeRunnerUnavailableError('Изолированный запуск кода не настроен');
  }
}

export class DockerCodeRunner implements CodeRunner {
  constructor(
    private readonly image = 'node:24-alpine',
    private readonly timeoutMs = 6_000,
    private readonly maxConcurrentRuns = 4,
  ) {}

  async run(code: string, config: TaskRunnerConfig): Promise<CodeRunResult> {
    if (activeDockerRuns >= this.maxConcurrentRuns) {
      throw new CodeRunnerUnavailableError('Все слоты запуска заняты, повторите попытку позже');
    }
    activeDockerRuns += 1;
    try {
      return await this.runInContainer(code, config);
    } finally {
      activeDockerRuns -= 1;
    }
  }

  private async runInContainer(code: string, config: TaskRunnerConfig): Promise<CodeRunResult> {
    const startedAt = Date.now();
    const containerName = `interview-atlas-run-${randomUUID()}`;
    const innerTimeoutSeconds = Math.max(1, Math.floor((this.timeoutMs - 500) / 1_000));
    const args = [
      'run', '--rm', '--name', containerName, '--network=none', '--memory=64m', '--memory-swap=64m', '--cpus=0.5', '--pids-limit=32',
      '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--user=65534:65534',
      '--tmpfs', '/tmp:rw,noexec,nosuid,size=8m', '--pull=never', '-i', this.image,
      'timeout', '-s', 'KILL', `${innerTimeoutSeconds}s`, 'node', '-e', CONTAINER_RUNNER,
    ];
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { if (stdout.length < 64_000) stdout += chunk; });
    child.stderr.resume();
    const completion = waitForContainer(child, containerName, this.timeoutMs);
    child.stdin.end(JSON.stringify({ code, entrypoint: config.entrypoint, tests: config.tests }));
    const exitCode = await completion;
    if (exitCode !== 0) {
      if (exitCode === 124 || exitCode === 137) throw new CodeRunnerTimeoutError();
      throw new CodeRunnerUnavailableError('Контейнер запуска кода недоступен');
    }
    let parsed: unknown;
    try { parsed = JSON.parse(stdout); } catch { throw new CodeRunnerExecutionError('Среда вернула некорректный результат'); }
    if (!isRunnerResult(parsed, config)) throw new CodeRunnerExecutionError('Среда вернула некорректный результат');
    return { ...parsed, durationMs: Date.now() - startedAt };
  }
}

let activeDockerRuns = 0;

export class CodeRunnerUnavailableError extends Error {}
export class CodeRunnerTimeoutError extends Error {
  constructor() { super('Превышен лимит времени выполнения'); }
}
export class CodeRunnerExecutionError extends Error {}

function waitForContainer(child: ReturnType<typeof spawn>, containerName: string, timeoutMs: number): Promise<number> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true; clearTimeout(timer); child.kill('SIGKILL'); removeContainer(containerName);
      reject(new CodeRunnerUnavailableError(error.message));
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new CodeRunnerTimeoutError());
      removeContainer(containerName);
    }, timeoutMs);
    child.stdin?.once('error', fail);
    child.once('error', fail);
    child.once('close', (value) => {
      if (settled) return;
      settled = true; clearTimeout(timer); resolve(value ?? 1);
    });
  });
}

function removeContainer(containerName: string): void {
  try {
    const cleanup = spawn('docker', ['rm', '-f', containerName], { stdio: 'ignore', windowsHide: true });
    const cleanupTimer = setTimeout(() => cleanup.kill('SIGKILL'), 1_000);
    cleanup.once('error', () => clearTimeout(cleanupTimer));
    cleanup.once('close', () => clearTimeout(cleanupTimer));
    cleanup.unref();
  } catch { /* Внутренний container timeout остаётся последней границей очистки. */ }
}

function isRunnerResult(value: unknown, config: TaskRunnerConfig): value is Omit<CodeRunResult, 'durationMs'> {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<CodeRunResult>;
  return Number.isInteger(item.passedCount) && Number.isInteger(item.totalCount) && Array.isArray(item.tests)
    && item.totalCount === config.tests.length && item.tests.length === config.tests.length
    && item.tests.every((test, index) => test && test.name === config.tests[index]?.name && typeof test.passed === 'boolean')
    && item.passedCount === item.tests.filter((test) => test.passed).length;
}

const CHILD_RUNNER = String.raw`
const { serialize } = require('node:v8');
const { writeSync } = require('node:fs');
let raw=''; process.stdin.setEncoding('utf8'); process.stdin.on('data',c=>raw+=c);
process.stdin.on('end',()=>{
  try {
    const input=JSON.parse(raw);
    if(!/^[A-Za-z_$][\w$]*$/.test(input.entrypoint)) throw new Error('bad entrypoint');
    const factory=new Function('"use strict";\nvar '+input.entrypoint+';\n{\n'+input.code+'\n;return typeof '+input.entrypoint+'==="function"?'+input.entrypoint+':null;\n}');
    const fn=factory(); if(!fn) throw new Error('entrypoint not found');
    const value=fn(...structuredClone(input.args));
    if(value&&typeof value.then==='function') throw new Error('async entrypoint');
    writeSync(3,serialize({ok:true,value}));
  } catch { process.stderr.write('submission failed'); process.exitCode=1; }
});`;

const CONTAINER_RUNNER = String.raw`
const { spawnSync } = require('node:child_process');
const { isDeepStrictEqual } = require('node:util');
const { deserialize } = require('node:v8');
const childRunner = ${JSON.stringify(CHILD_RUNNER)};
let raw=''; process.stdin.setEncoding('utf8'); process.stdin.on('data',c=>raw+=c);
process.stdin.on('end',()=>{
  try {
    const input=JSON.parse(raw);
    if(!/^[A-Za-z_$][\w$]*$/.test(input.entrypoint)) throw new Error('bad entrypoint');
    const results=[];
    for(const test of input.tests){
      try {
        const child=spawnSync(process.execPath,['-e',childRunner],{
          input:JSON.stringify({code:input.code,entrypoint:input.entrypoint,args:test.args}),
          timeout:1000,maxBuffer:65536,stdio:['pipe','ignore','ignore','pipe']
        });
        if(child.status!==0||child.error) throw new Error('submission failed');
        const actual=deserialize(child.output[3]);
        results.push({name:test.name,passed:actual.ok===true&&isDeepStrictEqual(actual.value,test.expected)});
      }
      catch { results.push({name:test.name,passed:false,message:'Ошибка выполнения'}); }
    }
    process.stdout.write(JSON.stringify({passedCount:results.filter(x=>x.passed).length,totalCount:results.length,tests:results}));
  } catch { process.stderr.write('runner failed'); process.exitCode=1; }
});`;
