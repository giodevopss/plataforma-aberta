"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeFlowJob = void 0;
const node_util_1 = require("node:util");
const core_utils_1 = require("@activepieces/core-utils");
const server_utils_1 = require("@activepieces/server-utils");
const shared_1 = require("@activepieces/shared");
const configs_1 = require("../../config/configs");
const worker_settings_1 = require("../../config/worker-settings");
const types_1 = require("../types");
const sandbox_helpers_1 = require("../utils/sandbox-helpers");
exports.executeFlowJob = {
    jobType: shared_1.WorkerJobType.EXECUTE_FLOW,
    async execute(ctx, data) {
        const timeoutInSeconds = worker_settings_1.workerSettings.getSettings().FLOW_TIMEOUT_SECONDS;
        const { data: resolved, error: provisionError } = await (0, core_utils_1.tryCatch)(() => ctx.resolver.resolve({ platformId: data.platformId, internalApiUrl: ctx.internalApiUrl, engineToken: ctx.engineToken, flow: { id: data.flowId, versionId: data.flowVersionId, projectId: data.projectId } }));
        if (provisionError) {
            await reportFlowStatus({ ctx, data, status: shared_1.FlowRunStatus.INTERNAL_ERROR, internalError: toInternalError(shared_1.RunInternalErrorSource.WORKER, provisionError) });
            throw provisionError;
        }
        // A deleted/disabled flow can't run — the run is correctly marked FAILED, but the job itself must
        // COMPLETE, not return INTERNAL_ERROR. INTERNAL_ERROR fails+retries the job and pages oncall for a
        // user condition (the flow was disabled/removed while jobs were still queued).
        if (resolved.kind === 'flow-not-found') {
            ctx.log.info({ flowVersion: { id: data.flowVersionId } }, 'Flow version not found, skipping');
            await reportFlowStatus({ ctx, data, status: shared_1.FlowRunStatus.FAILED });
            return { kind: types_1.JobResultKind.FIRE_AND_FORGET, status: shared_1.EngineResponseStatus.OK };
        }
        if (resolved.kind === 'disabled') {
            await reportFlowStatus({ ctx, data, status: shared_1.FlowRunStatus.FAILED, failedStep: resolved.failedStep });
            return { kind: types_1.JobResultKind.FIRE_AND_FORGET, status: shared_1.EngineResponseStatus.OK };
        }
        // resolved.kind === 'ready' — flowVersion is guaranteed present when flow: is passed to resolve
        if ((0, core_utils_1.isNil)(resolved.flowVersion)) {
            const error = new core_utils_1.ActivepiecesError({ code: core_utils_1.ErrorCode.VALIDATION, params: { message: 'flowVersion missing after resolve' } });
            await reportFlowStatus({ ctx, data, status: shared_1.FlowRunStatus.INTERNAL_ERROR, internalError: toInternalError(shared_1.RunInternalErrorSource.WORKER, error) });
            throw error;
        }
        const flowVersion = resolved.flowVersion;
        if (data.executionType === shared_1.ExecutionType.RESUME && (0, core_utils_1.isNil)(data.logsFileId)) {
            const error = new core_utils_1.ActivepiecesError({
                code: core_utils_1.ErrorCode.RESUME_LOGS_FILE_MISSING,
                params: { runId: data.runId },
            }, 'logsFileId is missing for RESUME operation');
            await reportFlowStatus({ ctx, data, status: shared_1.FlowRunStatus.INTERNAL_ERROR, internalError: toInternalError(shared_1.RunInternalErrorSource.WORKER, error) });
            throw error;
        }
        try {
            const operation = buildFlowOperation(ctx, data, flowVersion, timeoutInSeconds);
            const result = await ctx.runtime.execute({
                workerIndex: ctx.workerIndex,
                log: ctx.log,
                operationType: shared_1.EngineOperationType.EXECUTE_FLOW,
                operation,
                timeoutInSeconds,
                provision: resolved.provision,
            });
            // Best-effort latency breakdown for the runs page; reuses the run-log metadata upload
            // with no status so it only merges the timings the engine's own report can't measure.
            await (0, core_utils_1.tryCatch)(() => ctx.apiClient.uploadRunLog({
                runId: data.runId,
                projectId: data.projectId,
                provisionMs: result.timings.provisionMs,
                bootMs: result.timings.bootMs,
                runMs: result.timings.runMs,
            }));
            if (result.status === shared_1.EngineResponseStatus.LOG_SIZE_EXCEEDED) {
                await reportFlowStatus({ ctx, data, status: shared_1.FlowRunStatus.LOG_SIZE_EXCEEDED });
                return { kind: types_1.JobResultKind.FIRE_AND_FORGET, status: shared_1.EngineResponseStatus.LOG_SIZE_EXCEEDED, logs: result.logs };
            }
            if (result.status === shared_1.EngineResponseStatus.INTERNAL_ERROR) {
                await reportFlowStatus({ ctx, data, status: shared_1.FlowRunStatus.INTERNAL_ERROR, internalError: {
                        source: shared_1.RunInternalErrorSource.ENGINE,
                        message: result.error ?? 'Engine reported an internal error without details',
                        occurredAt: new Date().toISOString(),
                    } });
                return { kind: types_1.JobResultKind.FIRE_AND_FORGET, status: shared_1.EngineResponseStatus.INTERNAL_ERROR, logs: result.logs };
            }
            return { kind: types_1.JobResultKind.FIRE_AND_FORGET, status: shared_1.EngineResponseStatus.OK, logs: result.logs };
        }
        catch (e) {
            if ((0, sandbox_helpers_1.isSandboxTimeout)(e)) {
                await reportFlowStatus({ ctx, data, status: shared_1.FlowRunStatus.TIMEOUT });
                return { kind: types_1.JobResultKind.FIRE_AND_FORGET, status: shared_1.EngineResponseStatus.TIMEOUT };
            }
            if (e instanceof core_utils_1.ActivepiecesError) {
                if (e.error.code === core_utils_1.ErrorCode.SANDBOX_MEMORY_ISSUE) {
                    await reportFlowStatus({ ctx, data, status: shared_1.FlowRunStatus.MEMORY_LIMIT_EXCEEDED });
                    return { kind: types_1.JobResultKind.FIRE_AND_FORGET, status: shared_1.EngineResponseStatus.MEMORY_ISSUE };
                }
                if (e.error.code === core_utils_1.ErrorCode.SANDBOX_LOG_SIZE_EXCEEDED) {
                    await reportFlowStatus({ ctx, data, status: shared_1.FlowRunStatus.LOG_SIZE_EXCEEDED });
                    return { kind: types_1.JobResultKind.FIRE_AND_FORGET, status: shared_1.EngineResponseStatus.LOG_SIZE_EXCEEDED };
                }
                if (e.error.code === core_utils_1.ErrorCode.PIECE_BUNDLE_NOT_AVAILABLE) {
                    const { pieceName, pieceVersion } = e.error.params;
                    const owner = findStepOwningPiece({ flowVersion, pieceName, pieceVersion });
                    await reportFlowStatus({
                        ctx,
                        data,
                        status: shared_1.FlowRunStatus.FAILED,
                        failedStep: {
                            name: owner.name,
                            displayName: owner.displayName,
                            message: `Piece "${pieceName}@${pieceVersion}" is unavailable in this environment (bundle not accessible). Confirm the piece and version are installed and visible in this project, or update the step to a supported version.`,
                        },
                    });
                    return { kind: types_1.JobResultKind.FIRE_AND_FORGET, status: shared_1.EngineResponseStatus.OK };
                }
            }
            await reportFlowStatus({ ctx, data, status: shared_1.FlowRunStatus.INTERNAL_ERROR, internalError: toInternalError(shared_1.RunInternalErrorSource.WORKER, e) });
            throw e;
        }
    },
};
function buildFlowOperation(ctx, data, flowVersion, timeoutInSeconds) {
    const base = {
        flowVersion,
        flowRunId: data.runId,
        projectId: data.projectId,
        workerHandlerId: data.workerHandlerId ?? null,
        runEnvironment: data.environment,
        httpRequestId: data.httpRequestId ?? null,
        streamStepProgress: data.streamStepProgress,
        stepNameToTest: data.stepNameToTest ?? null,
        logsFileId: data.logsFileId,
        timeoutInSeconds,
        platformId: data.platformId,
        engineToken: ctx.engineToken,
        internalApiUrl: ctx.internalApiUrl,
        publicApiUrl: ctx.publicApiUrl,
    };
    if (data.executionType === shared_1.ExecutionType.RESUME) {
        return {
            ...base,
            executionType: shared_1.ExecutionType.RESUME,
            resumePayload: data.payload,
            resumeReason: data.resumeReason,
        };
    }
    return {
        ...base,
        executionType: shared_1.ExecutionType.BEGIN,
        triggerPayload: data.payload,
        executeTrigger: data.executeTrigger ?? false,
        sampleData: data.sampleData,
    };
}
function findStepOwningPiece({ flowVersion, pieceName, pieceVersion }) {
    const match = shared_1.flowStructureUtil.getAllSteps(flowVersion.trigger).find(step => {
        if (step.type !== shared_1.FlowActionType.PIECE)
            return false;
        return step.settings.pieceName === pieceName && step.settings.pieceVersion === pieceVersion;
    });
    if (match)
        return { name: match.name, displayName: match.displayName };
    return { name: flowVersion.trigger.name, displayName: flowVersion.trigger.displayName };
}
function toInternalError(source, error) {
    const isApError = error instanceof core_utils_1.ActivepiecesError;
    const base = error instanceof Error
        ? [error.name, error.message, error.stack].filter(Boolean).join('\n')
        : (0, node_util_1.inspect)(error, { depth: 1 });
    return {
        source,
        message: base,
        code: isApError ? error.error.code : undefined,
        occurredAt: new Date().toISOString(),
    };
}
async function reportFlowStatus({ ctx, data, status, internalError, failedStep }) {
    const willRetry = status === shared_1.FlowRunStatus.INTERNAL_ERROR && !ctx.lastAttempt;
    // A status report has no log file of its own; carry logsFileId only for an internalError the server may
    // persist into one (see uploadRunLog). Sending it on a plain status report would dangle flow_run.logsFileId.
    await ctx.apiClient.uploadRunLog({
        runId: data.runId,
        status,
        projectId: data.projectId,
        streamStepProgress: data.streamStepProgress,
        finishTime: new Date().toISOString(),
        ...((0, core_utils_1.isNil)(internalError) ? {} : { logsFileId: data.logsFileId }),
        internalError,
        failedStep,
        willRetry,
        ...(0, core_utils_1.spreadIfDefined)('workerHandlerId', data.workerHandlerId ?? undefined),
        ...(0, core_utils_1.spreadIfDefined)('httpRequestId', data.httpRequestId),
    });
    if (status === shared_1.FlowRunStatus.INTERNAL_ERROR && isDedicatedWorker()) {
        (0, server_utils_1.onCallService)(ctx.log, worker_settings_1.workerSettings.getSettings().PAGE_ONCALL_WEBHOOK).page({
            code: core_utils_1.ErrorCode.ENGINE_OPERATION_FAILURE,
            message: `Flow run ${data.runId} ended with INTERNAL_ERROR`,
            params: { runId: data.runId, flowId: data.flowId, projectId: data.projectId, willRetry },
        }).catch((e) => ctx.log.error({ flowRun: { id: data.runId }, error: (0, node_util_1.inspect)(e) }, 'Failed to send on-call page for INTERNAL_ERROR'));
    }
}
function isDedicatedWorker() {
    return !(0, core_utils_1.isNil)(configs_1.system.get(configs_1.WorkerSystemProp.WORKER_GROUP_ID));
}
//# sourceMappingURL=execute-flow.js.map