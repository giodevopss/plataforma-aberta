"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSandboxRuntime = createSandboxRuntime;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const core_utils_1 = require("@activepieces/core-utils");
const server_utils_1 = require("@activepieces/server-utils");
const cache_paths_1 = require("./cache/cache-paths");
const local_execution_cache_1 = require("./cache/local-execution-cache");
const resolver_1 = require("./resolver");
const sandbox_manager_1 = require("./sandbox-manager");
const bundle_http_1 = require("./utils/bundle-http");
// One box per worker at the destination (concurrency 1), or N independent boxes in the transitional
// compatibility mode that honors AP_WORKER_CONCURRENCY. Each box is its own manager, holding one
// in-flight operation at a time; the worker runs one poll loop per box and routes each execute to its
// box by workerIndex. The boxes share the on-disk caches, which are already concurrency-safe
// (threadSafeMkdir / cache-state), so there is no per-key provision dedup here. execute owns the slot
// lifecycle: acquire -> provision -> run -> release on success / invalidate on throw, re-raising the
// sandbox ActivepiecesError codes (timeout / memory / log-size) that handlers already catch. See ADR 0004.
function createSandboxRuntime({ concurrency = 1, basePath, getSettings }) {
    const managers = Array.from({ length: concurrency }, (_, index) => (0, sandbox_manager_1.createSandboxManager)({ boxId: index + 1, basePath, getSettings }));
    return {
        async execute({ workerIndex, log, operationType, operation, timeoutInSeconds, expiresAt, provision }) {
            const manager = managers[workerIndex];
            if ((0, core_utils_1.isNil)(manager)) {
                throw new core_utils_1.ActivepiecesError({
                    code: core_utils_1.ErrorCode.VALIDATION,
                    params: { message: `No sandbox manager for worker index ${workerIndex} (concurrency=${concurrency})` },
                });
            }
            const sandbox = manager.acquire({ log });
            const provisionStartedAt = Date.now();
            const { error: provisionError } = await (0, core_utils_1.tryCatch)(() => (0, local_execution_cache_1.localExecutionCache)(log, basePath, getSettings).provision({
                pieces: provision.pieces,
                codeSteps: provision.codes,
                internalApiUrl: provision.internalApiUrl,
                engineToken: provision.engineToken,
            }));
            if (provisionError) {
                await manager.invalidate(log);
                throw provisionError;
            }
            const provisionMs = Date.now() - provisionStartedAt;
            try {
                let bootMs = 0;
                let runMs = 0;
                // Break the engine timeline into its two worker-observable phases:
                //   sandboxStart = fork the engine child + Node boot + parse main.js (V8-cached) +
                //                  isolated-vm init + socket connect handshake.
                //   sandboxRun   = send the operation + the engine runs the flow steps + returns.
                // executionMs wraps both (total), so the report shows execution = start + run.
                const result = await server_utils_1.wideEvent.timed({
                    name: 'execution',
                    fn: async () => {
                        const bootStartedAt = Date.now();
                        await server_utils_1.wideEvent.timed({
                            name: 'sandboxStart',
                            fn: () => sandbox.start({
                                flowVersionId: provision.flowVersionId,
                                platformId: provision.platformId,
                                mounts: [],
                            }),
                        });
                        bootMs = Date.now() - bootStartedAt;
                        const runTimeoutInSeconds = remainingTimeoutInSeconds({ timeoutInSeconds, expiresAt });
                        if (runTimeoutInSeconds <= 0) {
                            throw new core_utils_1.ActivepiecesError({
                                code: core_utils_1.ErrorCode.SANDBOX_EXECUTION_TIMEOUT,
                                params: {
                                    standardOutput: '',
                                    standardError: `Caller deadline passed while starting the sandbox (provisionMs=${provisionMs}, bootMs=${bootMs}), the operation was never started`,
                                    neverStarted: true,
                                },
                            });
                        }
                        const runStartedAt = Date.now();
                        const runResult = await server_utils_1.wideEvent.timed({
                            name: 'sandboxRun',
                            fn: () => sandbox.execute(operationType, operation, { timeoutInSeconds: runTimeoutInSeconds }),
                        });
                        runMs = Date.now() - runStartedAt;
                        return runResult;
                    },
                });
                await manager.release(log);
                return { ...result, timings: { provisionMs, bootMs, runMs } };
            }
            catch (error) {
                await manager.invalidate(log);
                throw error;
            }
        },
        getActiveExecutors() {
            return managers
                .map((manager) => manager.getActiveSandbox())
                .filter((info) => !(0, core_utils_1.isNil)(info))
                .map((info) => ({
                sandboxId: info.sandboxId,
                boxId: info.boxId,
                pid: info.pid,
                busy: info.busy,
            }));
        },
        async prewarm({ log, apiClient, internalApiUrl, flow }) {
            if ((0, core_utils_1.isNil)(apiClient) || (0, core_utils_1.isNil)(internalApiUrl)) {
                return;
            }
            const startedAt = Date.now();
            const { error } = await (0, core_utils_1.tryCatch)(async () => {
                if (!(0, core_utils_1.isNil)(flow)) {
                    // The version JSON may have been updated in place (e.g. admin deno migration):
                    // drop the local copies so the resolve below refetches fresh data.
                    await evictFlowVersionCaches({ basePath, flowVersionId: flow.versionId });
                }
                const prewarmData = await apiClient.getPrewarmData({
                    workerGroupId: getSettings().WORKER_GROUP_ID,
                    projectWorker: getSettings().PROJECT_WORKER,
                    workerVersion: server_utils_1.apVersionUtil.getCurrentRelease(),
                    flow,
                });
                const { platformId, engineToken } = prewarmData;
                // Platform-wide prewarm uses the distinct piece/code set the app computed in one pass.
                // The targeted (flowPublished) prewarm still resolves worker-side, which also publishes
                // the flow bundle.
                const { pieces, codeSteps } = (0, core_utils_1.isNil)(flow)
                    ? await fetchScopeFile({ apiClient, scopeFileId: prewarmData.scopeFileId })
                    : await resolveFlowsForPrewarm({
                        resolver: (0, resolver_1.createResolver)({ apiClient, basePath, getSettings, log }),
                        flows: prewarmData.flows ?? [],
                        platformId,
                        internalApiUrl,
                        engineToken,
                        log,
                    });
                await (0, local_execution_cache_1.localExecutionCache)(log, basePath, getSettings).provision({ pieces, codeSteps, internalApiUrl, engineToken, bestEffort: true });
                log.info({ pieceCount: pieces.length, codeStepCount: codeSteps.length, durationMs: Date.now() - startedAt }, 'Prewarmed sandbox cache');
            });
            if (error) {
                log.warn({ error: String(error) }, 'Cache prewarm failed');
            }
        },
        async shutdown(shutdownLog) {
            await Promise.all(managers.map((manager) => manager.shutdown(shutdownLog)));
        },
    };
}
async function evictFlowVersionCaches({ basePath, flowVersionId }) {
    const paths = (0, cache_paths_1.cacheUtils)(basePath);
    await Promise.all([
        (0, promises_1.rm)((0, node_path_1.join)(paths.getGlobalCacheFlowsPath(), flowVersionId), { recursive: true, force: true }),
        (0, promises_1.rm)((0, node_path_1.join)(paths.getGlobalCacheBundlesPath(), flowVersionId), { recursive: true, force: true }),
    ]);
}
async function fetchScopeFile({ apiClient, scopeFileId }) {
    if ((0, core_utils_1.isNil)(scopeFileId)) {
        return { pieces: [], codeSteps: [] };
    }
    const response = await apiClient.getPrewarmScopeFile({ fileId: scopeFileId });
    if ((0, core_utils_1.isNil)(response)) {
        return { pieces: [], codeSteps: [] };
    }
    const data = response.kind === 'url' ? await bundle_http_1.bundleHttp.getBuffer(response.url) : response.data;
    const content = JSON.parse(data.toString('utf8'));
    return { pieces: content.pieces, codeSteps: content.codes };
}
async function resolveFlowsForPrewarm({ resolver, flows, platformId, internalApiUrl, engineToken, log }) {
    const resolvedFlows = await Promise.all(flows.map(async (flow) => {
        const { data: resolved, error: flowError } = await (0, core_utils_1.tryCatch)(() => resolver.resolve({ flow, platformId, internalApiUrl, engineToken }));
        if (flowError) {
            log.warn({ error: String(flowError), flow: { id: flow.id } }, 'Failed to resolve flow for prewarm');
            return null;
        }
        return resolved.kind === 'ready' ? resolved.provision : null;
    }));
    const provisions = resolvedFlows.filter((provision) => !(0, core_utils_1.isNil)(provision));
    return {
        pieces: provisions.flatMap((provision) => provision.pieces),
        codeSteps: provisions.flatMap((provision) => provision.codes),
    };
}
function remainingTimeoutInSeconds({ timeoutInSeconds, expiresAt }) {
    if ((0, core_utils_1.isNil)(expiresAt)) {
        return timeoutInSeconds;
    }
    return Math.min(timeoutInSeconds, Math.floor((expiresAt - Date.now()) / 1000));
}
//# sourceMappingURL=sandbox.js.map