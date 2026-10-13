const { spawn } = require('node:child_process');
const koffi = require('koffi');

(() => {
try {
  const kernel = koffi.load('kernel32.dll');
  const create = kernel.func('void * __stdcall CreateJobObjectW(void * security, void * name)');
  const limit = kernel.func('int __stdcall SetInformationJobObject(void * job, int type, void * info, uint32_t size)');
  const assign = kernel.func('int __stdcall AssignProcessToJobObject(void * job, void * process)');
  const current = kernel.func('void * __stdcall GetCurrentProcess()');
  const job = create(null, null);
  const info = Buffer.alloc(process.arch === 'ia32' ? 112 : 144);
  info.writeUInt32LE(0x2000, 16);
  // The host alone owns the non-inheritable handle; OS exit closes it and reaps every descendant.
  // https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects
  if (!job || !limit(job, 9, info, info.length) || !assign(job, current())) throw new Error('Job ownership unavailable');
  const payload = JSON.parse(process.argv[2]);
  if (typeof payload.command !== 'string' || !Array.isArray(payload.args) || payload.args.some(arg => typeof arg !== 'string')) throw new Error('Invalid process request');
  const env = { ...process.env };
  if (payload.nodeOptions !== undefined) {
    if (typeof payload.nodeOptions !== 'string') throw new Error('Invalid node options');
    env.NODE_OPTIONS = payload.nodeOptions;
  }
  const child = /\.(cmd|bat)$/i.test(payload.command)
    ? require('cross-spawn')(payload.command, payload.args, { env, stdio: 'inherit', windowsHide: true })
    : spawn(payload.command, payload.args, {
      env, stdio: 'inherit', windowsHide: true, windowsVerbatimArguments: payload.windowsVerbatimArguments === true,
    });

  child.once('error', () => { process.stderr.write('Owned Windows child startup failed\n', () => process.exit(1)); });
  child.once('close', code => process.exit(code ?? 1));
} catch {
  process.stderr.write('Owned Windows job startup failed\n', () => process.exit(1));
}
})();
