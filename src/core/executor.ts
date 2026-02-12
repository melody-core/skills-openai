/**
 * 脚本执行器 - 安全执行 skill 脚本
 */

import * as path from 'path';
import { spawn } from 'child_process';
import { readFile } from 'fs/promises';

const SUPPORTED_EXT: Record<string, string[]> = {
  '.py': ['python'],
  '.sh': ['/bin/bash'],
  '.bash': ['/bin/bash'],
  '.js': ['node'],
  '.ts': ['npx', 'ts-node'],
};

export class ScriptExecutionError extends Error {
  returncode: number;
  stderr: string;
  constructor(message: string, returncode = -1, stderr = '') {
    super(message);
    this.name = 'ScriptExecutionError';
    this.returncode = returncode;
    this.stderr = stderr;
  }
}

export class ScriptExecutor {
  defaultTimeout: number;
  maxOutputSize: number;

  constructor(defaultTimeout = 30, maxOutputSize = 1024 * 1024) {
    this.defaultTimeout = defaultTimeout;
    this.maxOutputSize = maxOutputSize;
  }

  async execute(
    scriptPath: string,
    options: {
      timeout?: number;
      sandbox?: boolean;
      args?: string[];
      env?: Record<string, string>;
      inputData?: string;
      [key: string]: unknown;
    } = {}
  ): Promise<string> {
    const {
      timeout = this.defaultTimeout,
      args = [],
      env = {},
      inputData,
      ...rest
    } = options;

    const ext = path.extname(scriptPath).toLowerCase();
    const interpreter = SUPPORTED_EXT[ext];
    if (!interpreter) {
      throw new Error(`Unsupported script type: ${ext}`);
    }

    const cmd = [...interpreter, scriptPath, ...args];
    const scriptEnv = this.prepareEnv(env, options.sandbox !== false);
    const cwd = path.dirname(scriptPath);

    let stdinData: string | undefined = inputData;
    if (!stdinData && Object.keys(rest).length > 0) {
      stdinData = JSON.stringify(rest);
    }

    return new Promise((resolve, reject) => {
      const proc = spawn(cmd[0], cmd.slice(1), {
        cwd,
        env: { ...process.env, ...scriptEnv },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      const timer = setTimeout(() => {
        proc.kill('SIGTERM');
        reject(
          new ScriptExecutionError(
            `Script execution timed out after ${timeout} seconds`,
            -1
          )
        );
      }, (timeout || 60) * 1000);

      proc.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
        if (stdout.length > this.maxOutputSize) {
          stdout = stdout.slice(0, this.maxOutputSize) + '\n... (output truncated)';
        }
      });
      proc.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      proc.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(
            new ScriptExecutionError(
              `Script failed with exit code ${code}`,
              code ?? -1,
              stderr
            )
          );
          return;
        }
        resolve(stdout);
      });

      if (stdinData) {
        proc.stdin?.write(stdinData, (err) => {
          if (err) reject(err);
          proc.stdin?.end();
        });
      }
    });
  }

  private prepareEnv(
    extra: Record<string, string>,
    sandbox: boolean
  ): Record<string, string> {
    const env = { ...process.env, ...extra } as Record<string, string>;
    if (sandbox) {
      const sensitive = [
        'AWS_SECRET_ACCESS_KEY',
        'AWS_SESSION_TOKEN',
        'GITHUB_TOKEN',
        'OPENAI_API_KEY',
        'ANTHROPIC_API_KEY',
        'DATABASE_URL',
        'DB_PASSWORD',
      ];
      for (const v of sensitive) {
        delete env[v];
      }
      env['OPENSKILLS_SANDBOX'] = '1';
    }
    return env;
  }
}
