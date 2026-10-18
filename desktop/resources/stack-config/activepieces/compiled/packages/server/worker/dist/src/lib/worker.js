"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.worker = void 0;
exports.ensurePublicApiUrl = ensurePublicApiUrl;
exports.findStalledLoopIndex = findStalledLoopIndex;
const tslib_1 = require("tslib");
const http_1 = require("http");
const os_1 = tslib_1.__importDefault(require("os"));
const core_utils_1 = require("@activepieces/core-utils");
const sandbox_1 = require("@activepieces/sandbox");
const server_utils_1 = require("@activepieces/server-utils");
const shared_1 = require("@activepieces/shared");
const nanoid_1 = require("nanoid");
const socket_io_client_1 = require("socket.io-client");
const api_notify_service_1 = require("./api-notify-service");
const configs_1 = require("./config/configs");
const logger_1 = require("./config/logger");
const worker_settings_1 = require("./config/worker-settings");
const job_registry_1 = require("./execute/job-registry");
const types_1 = require("./execute/types");
const sandbox_config_1 = require("./runtime/sandbox-config");
const version_checker_1 = require("./utils/version-checker");
let socket = null;
let polling = false;
let connectionGeneration = 0;
const workerId = `worker-${(0, nanoid_1.nanoid)()}`;
const workerHostname = os_1.default.hostname();
let healthServerInstance = null;
let shouldStartHealthServer = false;
let runtime = null;
// Jobs executing across all poll loops. stop() waits for these to finish + report before tearing
// down, so a deploy doesn't orphan them in the app's BullMQ `active` list. Abrupt death (OOM/SIGKILL)
// still falls to the stalled-scan.
let inFlightJobs = 0;
const DRAIN_TIMEOUT_MS = 25_000;
// Sandbox memory/state is UI-only telemetry (the workers page). Computing it needs a full
// process-table scan (si.processes()), so it must NOT run on the poll hot path — sampling it on
// every poll pegged worker CPU and collapsed throughput (~7x, #13497). Sample it on a slow
// interval instead and have buildMachineInfo() read the cached snapshot.
let cachedSandboxInfo = [];
let sandboxInfoInterval = null;
const SANDBOX_INFO_REFRESH_MS = 15_000;
const SERVER_PING_TIMEOUT_MS = 5_000;
const MACHINE_INFO_TIMEOUT_MS = 15_000;
const POLL_LIVENESS_TIMEOUT_MS = 600_000;
const POLL_WATCHDOG_INTERVAL_MS = 30_000;
const RPC_TIMEOUT_MS = 60_000;
const LONG_RUNNING_RPC_MARGIN_MS = 120_000;
const FALLBACK_FLOW_TIMEOUT_SECONDS = 600;
let pollLoopLiveness = [];
let pollWatchdogInterval = null;
let cacheSweepInterval = null;
let cacheSweepFirstRunTimeout = null;
exports.worker = {
    async start({ apiUrl, socketUrl, workerToken, withHealthServer = false }) {
        version_checker_1.versionChecker.assertReleaseReadable();
        server_utils_1.modelCatalog.load().catch(() => undefined);
        const workerGroupId = configs_1.system.get(configs_1.WorkerSystemProp.WORKER_GROUP_ID);
        const projectWorker = configs_1.system.getBoolean(configs_1.WorkerSystemProp.PROJECT_WORKER) ?? true;
        socket = (0, socket_io_client_1.io)(socketUrl.url, {
            auth: { token: workerToken, workerId, workerGroupId, projectWorker },
            path: socketUrl.path,
            transports: ['websocket'],
            reconnection: true,
        });
        const apiClient = (0, shared_1.createRpcClient)(socket, rpcTimeoutMsFor);
        server_utils_1.aiCostReporter.install({
            log: logger_1.logger,
            report: (request) => apiClient.reportAiUsage(request),
            pageWebhookUrl: () => (0, core_utils_1.tryCatchSync)(() => worker_settings_1.workerSettings.getSettings()).data?.PAGE_ONCALL_WEBHOOK,
        });
        socket.on('connect', async () => {
            logger_1.logger.info('Connected to API server via Socket.IO');
            resetPollLoopLiveness({ loopCount: 0 });
            await fetchAndStoreSettings(socket);
            void startPollingWorkers(apiClient).catch((err) => {
                logger_1.logger.error({ error: err }, 'Polling workers crashed unexpectedly');
            });
        });
        socket.on('disconnect', (reason) => {
            connectionGeneration++;
            polling = false;
            logger_1.logger.warn({ reason }, 'Disconnected from API server');
            // 'io client disconnect' is our own stop() — it already drained and tore down the runtime.
            // For any other reason the socket dropped while a job may still be running locally; the app
            // reclaims that job on disconnect, so kill the runtime now or the original keeps executing
            // to completion and double-runs the requeued copy. (The reconnect path recreates it.)
            // Also close the health server so orchestrators stop routing/keeping traffic on a worker
            // that can't consume jobs; the reconnect path brings it back up after prewarm completes.
            if (reason !== 'io client disconnect') {
                abortInFlightRuntime();
                stopHealthServer();
            }
            // Socket.IO does NOT auto-reconnect when the server initiates the disconnect
            // (reason 'io server disconnect' — e.g. the API process restarts/hot-reloads).
            // Without a manual reconnect the worker stays dead and silently stops consuming
            // jobs. Every other non-client reason already triggers built-in reconnection.
            if (reason === 'io server disconnect') {
                socket?.connect();
            }
        });
        socket.on('connect_error', (error) => {
            logger_1.logger.error({ error: error.message }, 'Socket.IO connection error');
        });
        (0, shared_1.createNotifyServer)(socket, (0, api_notify_service_1.createApiToWorkerHandlers)({
            getRuntime: () => runtime,
            apiClient,
            getInternalApiUrl: () => (0, configs_1.getApiUrl)(),
            log: logger_1.logger,
        }), logger_1.logger);
        shouldStartHealthServer = withHealthServer;
        startSandboxInfoSampling();
        startPollWatchdog();
        startCacheSweeper();
        logger_1.logger.info({ apiUrl, socketUrl }, 'Worker started, polling for jobs...');
    },
    async stop() {
        polling = false;
        pollLoopLiveness = [];
        stopPollWatchdog();
        stopSandboxInfoSampling();
        stopCacheSweeper();
        await drainInFlightJobs();
        if (runtime) {
            await runtime.shutdown(logger_1.logger);
            runtime = null;
        }
        socket?.disconnect();
        socket = null;
        stopHealthServer();
        logger_1.logger.info('Worker stopped');
    },
};
async function startPollingWorkers(apiClient) {
    if (polling)
        return;
    polling = true;
    const generation = connectionGeneration;
    // The destination is one box per worker (concurrency 1), scaling out with replicas (ADR 0003).
    // Transitional compatibility mode (ADR 0004): honor AP_WORKER_CONCURRENCY=N by running N poll
    // loops over N in-process boxes, each routed by its workerIndex. The default (5, main's historical
    // value) is registered in configs.ts to preserve old behavior, so system.get always returns it; the
    // '1' below is an unreachable belt-and-suspenders fallback. At N>1 an OOM takes down all N in-flight
    // jobs, so the operator must size the container accordingly.
    const rawConcurrency = Number(configs_1.system.get(configs_1.WorkerSystemProp.WORKER_CONCURRENCY) ?? '1');
    const concurrency = Number.isInteger(rawConcurrency) && rawConcurrency > 0 ? rawConcurrency : 1;
    if (!Number.isInteger(rawConcurrency) || rawConcurrency < 1) {
        logger_1.logger.warn({ rawConcurrency }, 'Invalid AP_WORKER_CONCURRENCY value, falling back to 1');
    }
    // Bring up a fresh runtime on every (re)connect — a prior connection's in-flight job is killed
    // along with its box (usually already done by the disconnect handler), so it fails fast and is
    // retried instead of lingering on a reused box. Reusing the box made the next generation's poll
    // loop run a second operation on the same single-operation engine child (acquire() hands back a
    // busy sandbox) and let the lingering job's lock lapse during the reconnect → BullMQ "stalled";
    // a deploy disconnects every worker at once, so reuse turned that into mass stalls.
    abortInFlightRuntime();
    const createdRuntime = (0, sandbox_1.createSandboxRuntime)({
        concurrency,
        basePath: sandbox_config_1.sandboxConfig.getCacheBasePath(),
        getSettings: () => sandbox_config_1.sandboxConfig.getSandboxSettings(),
    });
    runtime = createdRuntime;
    // Opt-in via AP_PREWARM_CACHE_ON_STARTUP: the warm-up resolves and compiles every enabled flow,
    // so its startup memory/CPU spike grows with flow count and can OOM small workers on large instances.
    // When enabled it is awaited so the health server only comes up once the cache is warm and
    // orchestrators don't route/keep traffic on a cold worker; when disabled it is skipped entirely.
    if (configs_1.system.getBoolean(configs_1.WorkerSystemProp.PREWARM_CACHE_ON_STARTUP) ?? false) {
        while (polling && connectionGeneration === generation && !version_checker_1.versionChecker.connectedAppVersionIsCompatible(logger_1.logger)) {
            await sleep(version_checker_1.VERSION_MISMATCH_POLL_PAUSE_MS);
        }
        if (polling && connectionGeneration === generation) {
            const { error: prewarmError } = await (0, core_utils_1.tryCatch)(() => createdRuntime.prewarm({
                log: logger_1.logger,
                apiClient,
                publicApiUrl: ensurePublicApiUrl(worker_settings_1.workerSettings.getSettings().PUBLIC_URL),
            }));
            if (prewarmError) {
                logger_1.logger.error({ error: prewarmError }, 'Prewarm failed, continuing without a warm cache');
            }
        }
    }
    // The generation check keeps a disconnect that landed mid-prewarm from re-opening the health
    // server for a connection that no longer exists — the reconnect's own run brings it back up.
    const stillCurrentConnection = polling && connectionGeneration === generation;
    if (shouldStartHealthServer && stillCurrentConnection && (0, core_utils_1.isNil)(healthServerInstance)) {
        healthServerInstance = startHealthServer();
    }
    logger_1.logger.info({ concurrency }, 'Starting poll loops');
    resetPollLoopLiveness({ loopCount: concurrency });
    await Promise.all(Array.from({ length: concurrency }, (_, workerIndex) => pollAndExecute(apiClient, createdRuntime, workerIndex, generation)));
}
async function pollAndExecute(apiClient, runtime, workerIndex, generation) {
    const workerLog = logger_1.logger.child({ workerIndex });
    workerLog.info('Polling worker started');
    while (polling && connectionGeneration === generation) {
        markPollLoopIteration({ workerIndex, busy: false });
        if (!version_checker_1.versionChecker.connectedAppVersionIsCompatible(workerLog)) {
            await sleep(version_checker_1.VERSION_MISMATCH_POLL_PAUSE_MS);
            continue;
        }
        const { data: machineInfo, error: machineError } = await (0, core_utils_1.tryCatch)(buildMachineInfo);
        if (machineError) {
            workerLog.error({ error: machineError }, 'Failed to build machine info');
            await sleep(20000);
            continue;
        }
        const { data: job, error: pollError } = await (0, core_utils_1.tryCatch)(() => apiClient.poll(machineInfo));
        if (pollError) {
            workerLog.error({ error: pollError }, 'Poll failed');
            await sleep(25000);
            continue;
        }
        if (!job) {
            workerLog.debug('Poll returned null, re-polling');
            continue;
        }
        workerLog.debug({ job: { id: job.jobId, type: job.jobData.jobType } }, 'Job received from poll');
        // Counted for the duration of execute + completeJob so a graceful shutdown can wait for
        // the report to land before tearing down the socket (otherwise the job is orphaned in active).
        inFlightJobs++;
        markPollLoopIteration({ workerIndex, busy: true });
        try {
            const lockExtensionInterval = setInterval(() => {
                void (0, core_utils_1.tryCatch)(() => apiClient.extendLock({ jobId: job.jobId, token: job.token, queueName: job.queueName })).then(({ error }) => {
                    if (error) {
                        workerLog.warn({ error, job: { id: job.jobId } }, 'Failed to extend lock');
                    }
                });
            }, 30_000);
            const { data: result, error: execError } = await (0, core_utils_1.tryCatch)(() => executeJob(apiClient, job, runtime, workerIndex));
            const { error: completeError } = await (0, core_utils_1.tryCatch)(() => apiClient.completeJob({
                jobId: job.jobId,
                token: job.token,
                queueName: job.queueName,
                status: execError
                    ? shared_1.EngineResponseStatus.INTERNAL_ERROR
                    : result.status,
                errorMessage: buildErrorMessage(execError ?? undefined, result ?? undefined),
                logs: extractLogs(execError ?? undefined, result ?? undefined),
                response: result?.kind === types_1.JobResultKind.SYNCHRONOUS ? result.response : undefined,
            }));
            clearInterval(lockExtensionInterval);
            if (completeError) {
                workerLog.error({ error: completeError, job: { id: job.jobId } }, 'Failed to complete job');
            }
        }
        finally {
            inFlightJobs--;
            markPollLoopIteration({ workerIndex, busy: false });
        }
    }
    workerLog.warn({ polling, generation, connectionGeneration }, 'Poll loop exited — this worker consumes no jobs until it starts again');
}
async function drainInFlightJobs() {
    const deadline = Date.now() + DRAIN_TIMEOUT_MS;
    while (inFlightJobs > 0 && Date.now() < deadline) {
        await sleep(100);
    }
    if (inFlightJobs > 0) {
        logger_1.logger.warn({ inFlightJobs }, 'Drain timeout reached with jobs still in flight; leaving them for the stalled-scan to reclaim');
    }
}
// Kill the current runtime (and the job running on it) without awaiting — awaiting the shutdown
// while a job is in-flight deadlocks (the await never resolves, polling never restarts). Nulling
// `runtime` lets the next (re)connect create a fresh box.
function abortInFlightRuntime() {
    if ((0, core_utils_1.isNil)(runtime)) {
        return;
    }
    const oldRuntime = runtime;
    runtime = null;
    void (0, core_utils_1.tryCatch)(() => oldRuntime.shutdown(logger_1.logger)).then(({ error }) => {
        if (error) {
            logger_1.logger.error({ error }, 'Failed to shut down runtime');
        }
    });
}
function flowTimeoutMs() {
    const { data: settings } = (0, core_utils_1.tryCatchSync)(() => worker_settings_1.workerSettings.getSettings());
    return (settings?.FLOW_TIMEOUT_SECONDS ?? FALLBACK_FLOW_TIMEOUT_SECONDS) * 1000;
}
function rpcTimeoutMsFor(method) {
    if (!shared_1.LONG_RUNNING_RPC_METHODS.includes(method)) {
        return RPC_TIMEOUT_MS;
    }
    const { data: settings } = (0, core_utils_1.tryCatchSync)(() => worker_settings_1.workerSettings.getSettings());
    if ((0, core_utils_1.isNil)(settings)) {
        logger_1.logger.warn({ rpc: { method } }, 'Worker settings have not arrived, timing a long-running RPC by the default flow timeout');
    }
    return flowTimeoutMs() + LONG_RUNNING_RPC_MARGIN_MS;
}
async function executeJob(apiClient, job, runtime, workerIndex) {
    const rawData = job.jobData;
    const jobData = shared_1.JobData.parse(rawData);
    // Chat jobs reuse `runId` as the per-message chat run id (NOT a flow run);
    // map it to the `run`/`conversation` groups so chat logs correlate correctly.
    const isAgentJob = jobData.jobType === shared_1.WorkerJobType.EXECUTE_AGENT_RUN;
    const jobLogger = (0, server_utils_1.createLogger)({
        event: 'job.execute',
        job: { id: job.jobId, type: jobData.jobType },
        ...(0, core_utils_1.spreadIfDefined)('requestId', 'requestId' in jobData ? jobData.requestId : 'httpRequestId' in jobData ? jobData.httpRequestId : undefined),
        ...(0, core_utils_1.spreadIfDefined)('project', 'projectId' in jobData && jobData.projectId != null ? { id: jobData.projectId } : undefined),
        ...(0, core_utils_1.spreadIfDefined)('platform', 'platformId' in jobData ? { id: jobData.platformId } : undefined),
        ...(0, core_utils_1.spreadIfDefined)('flow', 'flowId' in jobData ? { id: jobData.flowId } : undefined),
        ...(0, core_utils_1.spreadIfDefined)('flowRun', !isAgentJob && 'runId' in jobData ? { id: jobData.runId } : undefined),
        ...(0, core_utils_1.spreadIfDefined)('run', isAgentJob && 'runId' in jobData ? { id: jobData.runId } : undefined),
        ...(0, core_utils_1.spreadIfDefined)('conversation', 'conversationId' in jobData ? { id: jobData.conversationId } : undefined),
        ...(0, core_utils_1.spreadIfDefined)('flowVersion', 'flowVersionId' in jobData ? { id: jobData.flowVersionId } : undefined),
    });
    return server_utils_1.wideEvent.run({
        logger: jobLogger,
        fn: async () => {
            const log = logger_1.logger.child({ job: { id: job.jobId, type: jobData.jobType } });
            const apiUrl = (0, configs_1.getApiUrl)();
            const { PUBLIC_URL: publicUrl } = await worker_settings_1.workerSettings.waitForSettings();
            log.debug({ apiUrl, publicUrl }, 'Worker settings resolved');
            const publicApiUrl = ensurePublicApiUrl(publicUrl);
            // The engine forks in-process inside this worker, so it reaches the app over the worker's own
            // app URL (cluster-internal when co-located with the app, the public URL for a standalone worker).
            const internalApiUrl = apiUrl;
            const ctx = {
                apiClient,
                runtime,
                resolver: (0, sandbox_1.createResolver)({
                    apiClient,
                    basePath: sandbox_config_1.sandboxConfig.getCacheBasePath(),
                    getSettings: () => sandbox_config_1.sandboxConfig.getSandboxSettings(),
                    log,
                }),
                workerIndex,
                jobId: job.jobId,
                lastAttempt: job.lastAttempt ?? true,
                engineToken: job.engineToken,
                internalApiUrl,
                publicApiUrl,
                log,
            };
            try {
                const handler = await (0, job_registry_1.getHandler)(jobData.jobType);
                log.debug({ handlerType: handler.jobType }, 'Executing job with handler');
                const { data: result, error } = await (0, core_utils_1.tryCatch)(() => handler.execute(ctx, jobData));
                if (error) {
                    log.error({ error }, 'Job execution failed');
                    server_utils_1.wideEvent.error(error);
                    server_utils_1.wideEvent.set({ outcome: 'failed' });
                    throw error;
                }
                log.debug('Job completed');
                server_utils_1.wideEvent.set({ outcome: 'success' });
                return result;
            }
            finally {
                jobLogger.emit();
            }
        },
    });
}
function ensurePublicApiUrl(publicUrl) {
    if (publicUrl.endsWith('/api/'))
        return publicUrl;
    if (publicUrl.endsWith('/api'))
        return publicUrl + '/';
    if (publicUrl.endsWith('/'))
        return publicUrl + 'api/';
    return publicUrl + '/api/';
}
async function fetchAndStoreSettings(sock) {
    const { data: request, error } = await (0, core_utils_1.tryCatch)(buildMachineInfo);
    if (error) {
        logger_1.logger.error({ error }, 'Failed to build machine info for settings fetch');
        return;
    }
    return new Promise((resolve) => {
        sock.emit(shared_1.WebsocketServerEvent.FETCH_WORKER_SETTINGS, request, (response) => {
            const localExecutionMode = configs_1.system.get(configs_1.WorkerSystemProp.EXECUTION_MODE);
            if (!(0, core_utils_1.isNil)(localExecutionMode)) {
                response.EXECUTION_MODE = localExecutionMode;
            }
            const workerGroupId = configs_1.system.get(configs_1.WorkerSystemProp.WORKER_GROUP_ID);
            if (!(0, core_utils_1.isNil)(workerGroupId)) {
                if (response.EDITION === shared_1.ApEdition.CLOUD) {
                    const processSandboxedModes = [shared_1.ExecutionMode.SANDBOX_PROCESS, shared_1.ExecutionMode.SANDBOX_CODE_AND_PROCESS];
                    if (!processSandboxedModes.includes(response.EXECUTION_MODE)) {
                        throw new Error(`Worker group "${workerGroupId}" requires AP_EXECUTION_MODE to be one of: ${processSandboxedModes.join(', ')}. Got: ${response.EXECUTION_MODE}`);
                    }
                }
                const reuseSandbox = configs_1.system.get(configs_1.WorkerSystemProp.REUSE_SANDBOX);
                if ((0, core_utils_1.isNil)(reuseSandbox)) {
                    throw new Error(`Worker group "${workerGroupId}" requires AP_REUSE_SANDBOX to be set (true or false)`);
                }
            }
            worker_settings_1.workerSettings.set(response);
            logger_1.logger.info({ environment: response.ENVIRONMENT, executionMode: response.EXECUTION_MODE }, 'Worker settings loaded');
            resolve();
        });
    });
}
function getWorkerProps() {
    try {
        const settings = sandbox_config_1.sandboxConfig.getSandboxSettings();
        return {
            EXECUTION_MODE: settings.EXECUTION_MODE,
            WORKER_CONCURRENCY: configs_1.system.get(configs_1.WorkerSystemProp.WORKER_CONCURRENCY),
            SANDBOX_MEMORY_LIMIT: settings.SANDBOX_MEMORY_LIMIT,
            REUSE_SANDBOX: configs_1.system.get(configs_1.WorkerSystemProp.REUSE_SANDBOX) ?? 'false',
            version: version_checker_1.versionChecker.workerVersion,
        };
    }
    catch {
        return {};
    }
}
async function buildMachineInfo() {
    return withTimeout({
        promise: collectMachineInfo(),
        timeoutMs: MACHINE_INFO_TIMEOUT_MS,
        message: 'Timed out collecting machine info',
    });
}
async function collectMachineInfo() {
    const memInfo = await server_utils_1.systemUsage.getContainerMemoryUsage();
    const diskInfo = await server_utils_1.systemUsage.getDiskInfo();
    const cpuCores = await server_utils_1.systemUsage.getCpuCores();
    const serverPingMs = await probeServerPing();
    return {
        workerId,
        cpuUsagePercentage: server_utils_1.systemUsage.getCpuUsage(),
        diskInfo,
        workerProps: getWorkerProps(),
        ramUsagePercentage: memInfo.ramUsage,
        totalAvailableRamInBytes: memInfo.totalRamInBytes,
        totalCpuCores: cpuCores,
        ip: workerHostname,
        serverPingMs,
        sandboxes: cachedSandboxInfo,
    };
}
async function probeServerPing() {
    const startedAt = Date.now();
    const probe = (0, core_utils_1.tryCatch)(() => fetch(`${(0, configs_1.getApiUrl)()}v1/health`, { signal: AbortSignal.timeout(SERVER_PING_TIMEOUT_MS) }))
        .then(({ data: response, error }) => {
        void response?.body?.cancel();
        return error ? undefined : Date.now() - startedAt;
    });
    return Promise.race([probe, sleep(SERVER_PING_TIMEOUT_MS).then(() => undefined)]);
}
function withTimeout({ promise, timeoutMs, message }) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
        promise.then(resolve, reject).finally(() => clearTimeout(timer));
    });
}
function startSandboxInfoSampling() {
    if (!(0, core_utils_1.isNil)(sandboxInfoInterval)) {
        return;
    }
    void refreshSandboxInfo();
    sandboxInfoInterval = setInterval(() => void refreshSandboxInfo(), SANDBOX_INFO_REFRESH_MS);
    sandboxInfoInterval.unref();
}
function stopSandboxInfoSampling() {
    if (!(0, core_utils_1.isNil)(sandboxInfoInterval)) {
        clearInterval(sandboxInfoInterval);
        sandboxInfoInterval = null;
    }
    cachedSandboxInfo = [];
}
async function refreshSandboxInfo() {
    const { data, error } = await (0, core_utils_1.tryCatch)(buildSandboxInfo);
    if (error) {
        logger_1.logger.warn({ error }, 'Failed to refresh sandbox info');
        return;
    }
    cachedSandboxInfo = data;
}
async function buildSandboxInfo() {
    const activeExecutors = runtime?.getActiveExecutors() ?? [];
    if (activeExecutors.length === 0) {
        return [];
    }
    const memoryByPid = await server_utils_1.systemUsage.getProcessTreeMemoryBytesByPids(activeExecutors.map((executor) => executor.pid));
    return activeExecutors.map((executor) => ({
        sandboxId: executor.sandboxId,
        boxId: executor.boxId,
        busy: executor.busy,
        memoryUsageBytes: memoryByPid.get(executor.pid) ?? 0,
    }));
}
function buildErrorMessage(execError, result) {
    if (execError) {
        return execError.message;
    }
    const isFailure = result?.kind === types_1.JobResultKind.SYNCHRONOUS && result.status !== shared_1.EngineResponseStatus.OK;
    if (!isFailure) {
        return undefined;
    }
    return result.errorMessage;
}
function extractLogs(execError, result) {
    if (execError instanceof core_utils_1.ActivepiecesError) {
        const params = execError.error.params;
        const parts = [];
        if (params?.['standardOutput'])
            parts.push(`stdout:\n${params['standardOutput']}`);
        if (params?.['standardError'])
            parts.push(`stderr:\n${params['standardError']}`);
        return parts.length > 0 ? parts.join('\n') : undefined;
    }
    if (result && 'logs' in result) {
        return result.logs;
    }
    return undefined;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function resetPollLoopLiveness({ loopCount }) {
    const startedAt = Date.now();
    pollLoopLiveness = Array.from({ length: loopCount }, () => ({ iteratedAt: startedAt, busy: false }));
}
function markPollLoopIteration({ workerIndex, busy }) {
    const liveness = pollLoopLiveness[workerIndex];
    if ((0, core_utils_1.isNil)(liveness)) {
        return;
    }
    liveness.iteratedAt = Date.now();
    liveness.busy = busy;
}
function findStalledPollLoop() {
    const connected = socket?.connected ?? false;
    if (!connected) {
        return undefined;
    }
    const now = Date.now();
    const workerIndex = findStalledLoopIndex({ loops: pollLoopLiveness, now, timeoutMs: POLL_LIVENESS_TIMEOUT_MS });
    if (workerIndex === -1) {
        return undefined;
    }
    return { workerIndex, stalledForMs: now - pollLoopLiveness[workerIndex].iteratedAt };
}
function startCacheSweeper() {
    if (!(0, core_utils_1.isNil)(cacheSweepInterval) || !(0, core_utils_1.isNil)(cacheSweepFirstRunTimeout)) {
        return;
    }
    cacheSweepFirstRunTimeout = setTimeout(() => {
        cacheSweepFirstRunTimeout = null;
        void sweepActionRunCache();
        cacheSweepInterval = setInterval(() => void sweepActionRunCache(), sandbox_1.ACTION_RUN_CACHE_SWEEP_INTERVAL_MS);
        cacheSweepInterval.unref();
    }, sandbox_1.ACTION_RUN_CACHE_FIRST_SWEEP_DELAY_MS);
    cacheSweepFirstRunTimeout.unref();
}
function stopCacheSweeper() {
    if (!(0, core_utils_1.isNil)(cacheSweepFirstRunTimeout)) {
        clearTimeout(cacheSweepFirstRunTimeout);
        cacheSweepFirstRunTimeout = null;
    }
    if (!(0, core_utils_1.isNil)(cacheSweepInterval)) {
        clearInterval(cacheSweepInterval);
        cacheSweepInterval = null;
    }
}
async function sweepActionRunCache() {
    const { error } = await (0, core_utils_1.tryCatch)(() => sandbox_1.actionRunCache.sweep({
        basePath: sandbox_config_1.sandboxConfig.getCacheBasePath(),
        log: logger_1.logger,
        activeWindowMs: Math.max(sandbox_1.ACTION_RUN_CACHE_ACTIVE_WINDOW_MS, flowTimeoutMs()),
    }));
    if (error) {
        logger_1.logger.warn({ error }, 'Action-run code cache sweep failed');
    }
    // Reclaims the directories left by earlier LATEST_CACHE_VERSION values. It rides the periodic
    // sweep rather than startup because it can only run once the rollout grace period has passed,
    // which is long after a worker boots. Canary workers never reclaim: they run ahead of prod for
    // days, and deleting the previous version's cache there would make a rollback start cold.
    if (configs_1.system.getBoolean(configs_1.WorkerSystemProp.IS_CANARY_WORKER) ?? false) {
        return;
    }
    await (0, sandbox_1.cacheUtils)(sandbox_config_1.sandboxConfig.getCacheBasePath()).deleteStaleCache(logger_1.logger);
}
function startPollWatchdog() {
    if (!(0, core_utils_1.isNil)(pollWatchdogInterval)) {
        return;
    }
    pollWatchdogInterval = setInterval(() => {
        const stalled = findStalledPollLoop();
        if ((0, core_utils_1.isNil)(stalled)) {
            return;
        }
        logger_1.logger.error({ ...stalled, loopCount: pollLoopLiveness.length }, 'Poll loop stalled — exiting so the process manager restarts a worker that can consume jobs');
        process.exit(1);
    }, POLL_WATCHDOG_INTERVAL_MS);
    pollWatchdogInterval.unref();
}
function stopPollWatchdog() {
    if (!(0, core_utils_1.isNil)(pollWatchdogInterval)) {
        clearInterval(pollWatchdogInterval);
        pollWatchdogInterval = null;
    }
}
function startHealthServer() {
    const port = Number(process.env[configs_1.WorkerSystemProp.PORT] ?? configs_1.system.get(configs_1.WorkerSystemProp.PORT));
    const healthPaths = new Set(['/worker/health', '/v1/health', '/api/v1/health']);
    const server = (0, http_1.createServer)((req, res) => {
        if (req.method === 'GET' && req.url && healthPaths.has(req.url)) {
            const stalled = !(0, core_utils_1.isNil)(findStalledPollLoop());
            res.writeHead(stalled ? 503 : 200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: stalled ? 'poll_loop_stalled' : 'ok' }));
        }
        else {
            res.writeHead(404);
            res.end();
        }
    });
    server.listen(port, () => {
        logger_1.logger.info({ port }, 'Health server listening');
    });
    return server;
}
// closeAllConnections drops kubelet keep-alive sockets too, so the next probe is refused
// immediately instead of riding an already-open connection until it happens to close.
function stopHealthServer() {
    if ((0, core_utils_1.isNil)(healthServerInstance)) {
        return;
    }
    healthServerInstance.closeAllConnections();
    healthServerInstance.close();
    healthServerInstance = null;
    logger_1.logger.info('Health server stopped, probes will fail until reconnect and prewarm complete');
}
function findStalledLoopIndex({ loops, now, timeoutMs }) {
    return loops.findIndex((loop) => !loop.busy && now - loop.iteratedAt > timeoutMs);
}
//# sourceMappingURL=worker.js.map