"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executePollingJob = void 0;
const core_utils_1 = require("@activepieces/core-utils");
const shared_1 = require("@activepieces/shared");
const worker_settings_1 = require("../../config/worker-settings");
const types_1 = require("../types");
const trigger_run_recorder_1 = require("../utils/trigger-run-recorder");
const webhook_url_1 = require("../utils/webhook-url");
exports.executePollingJob = {
    jobType: shared_1.WorkerJobType.EXECUTE_POLLING,
    async execute(ctx, data) {
        const timeoutInSeconds = worker_settings_1.workerSettings.getSettings().TRIGGER_TIMEOUT_SECONDS;
        const resolved = await ctx.resolver.resolve({ platformId: data.platformId, internalApiUrl: ctx.internalApiUrl, engineToken: ctx.engineToken, flow: { id: data.flowId, versionId: data.flowVersionId, projectId: data.projectId } });
        if (resolved.kind === 'flow-not-found') {
            ctx.log.info({ flowVersion: { id: data.flowVersionId } }, 'Flow version not found for polling trigger, skipping');
            return { kind: types_1.JobResultKind.FIRE_AND_FORGET, status: shared_1.EngineResponseStatus.OK };
        }
        if (resolved.kind === 'disabled') {
            return { kind: types_1.JobResultKind.FIRE_AND_FORGET, status: shared_1.EngineResponseStatus.OK };
        }
        // resolved.kind === 'ready' — flowVersion is guaranteed present when flow: is passed to resolve
        if ((0, core_utils_1.isNil)(resolved.flowVersion)) {
            throw new Error('flowVersion missing after resolve');
        }
        const flowVersion = resolved.flowVersion;
        try {
            const result = await ctx.runtime.execute({
                workerIndex: ctx.workerIndex,
                log: ctx.log,
                operationType: shared_1.EngineOperationType.EXECUTE_TRIGGER_HOOK,
                operation: {
                    hookType: shared_1.TriggerHookType.RUN,
                    flowVersion,
                    webhookUrl: (0, webhook_url_1.getWebhookUrl)(ctx.publicApiUrl, data.flowId),
                    test: false,
                    projectId: data.projectId,
                    platformId: data.platformId,
                    engineToken: ctx.engineToken,
                    internalApiUrl: ctx.internalApiUrl,
                    publicApiUrl: ctx.publicApiUrl,
                    timeoutInSeconds,
                },
                timeoutInSeconds,
                provision: resolved.provision,
            });
            if (result.status === shared_1.EngineResponseStatus.OK) {
                const triggerResult = result.response;
                if (triggerResult.output.length > 0) {
                    await ctx.apiClient.submitPayloads({
                        flowVersionId: data.flowVersionId,
                        projectId: data.projectId,
                        payloads: triggerResult.output,
                        environment: shared_1.RunEnvironment.PRODUCTION,
                        streamStepProgress: shared_1.StreamStepProgress.NONE,
                    });
                }
            }
            await (0, trigger_run_recorder_1.recordTriggerRun)({ apiClient: ctx.apiClient, log: ctx.log, flowVersion, platformId: data.platformId, status: result.status, error: result.error });
            return { kind: types_1.JobResultKind.FIRE_AND_FORGET, status: shared_1.EngineResponseStatus.OK, logs: result.logs };
        }
        catch (e) {
            ctx.log.error({ error: String(e) }, 'Polling trigger failed, will retry on next scheduled cycle');
            await (0, trigger_run_recorder_1.recordTriggerRun)({ apiClient: ctx.apiClient, log: ctx.log, flowVersion, platformId: data.platformId, status: shared_1.EngineResponseStatus.INTERNAL_ERROR });
            return { kind: types_1.JobResultKind.FIRE_AND_FORGET, status: shared_1.EngineResponseStatus.OK };
        }
    },
};
//# sourceMappingURL=execute-polling.js.map