"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeWebhookJob = void 0;
const core_utils_1 = require("@activepieces/core-utils");
const shared_1 = require("@activepieces/shared");
const worker_settings_1 = require("../../config/worker-settings");
const types_1 = require("../types");
const sandbox_helpers_1 = require("../utils/sandbox-helpers");
const trigger_run_recorder_1 = require("../utils/trigger-run-recorder");
const webhook_url_1 = require("../utils/webhook-url");
function getAppWebhookDetails(flowVersion, publicApiUrl, appWebhookSecretsJson) {
    const trigger = flowVersion.trigger;
    const pieceName = trigger?.settings?.pieceName;
    if ((0, core_utils_1.isNil)(pieceName)) {
        return {};
    }
    const secrets = (0, core_utils_1.parseToJsonIfPossible)(appWebhookSecretsJson);
    const webhookSecret = secrets?.[pieceName]?.webhookSecret;
    const pieceUrlName = pieceName.replace('@activepieces/piece-', '');
    return {
        appWebhookUrl: (0, webhook_url_1.getAppWebhookUrl)(publicApiUrl, pieceUrlName),
        webhookSecret,
    };
}
exports.executeWebhookJob = {
    jobType: shared_1.WorkerJobType.EXECUTE_WEBHOOK,
    async execute(ctx, data) {
        const settings = worker_settings_1.workerSettings.getSettings();
        const timeoutInSeconds = settings.TRIGGER_TIMEOUT_SECONDS;
        const resolved = await ctx.resolver.resolve({ platformId: data.platformId, internalApiUrl: ctx.internalApiUrl, engineToken: ctx.engineToken, flow: { id: data.flowId, versionId: data.flowVersionIdToRun, projectId: data.projectId } });
        if (resolved.kind === 'flow-not-found') {
            ctx.log.info({ flowVersion: { id: data.flowVersionIdToRun } }, 'Flow version not found for webhook, skipping');
            return { kind: types_1.JobResultKind.FIRE_AND_FORGET, status: shared_1.EngineResponseStatus.OK };
        }
        if (resolved.kind === 'disabled') {
            return { kind: types_1.JobResultKind.FIRE_AND_FORGET, status: shared_1.EngineResponseStatus.OK };
        }
        // resolved.kind === 'ready' — flowVersion is guaranteed present when flow: is passed to resolve
        if ((0, core_utils_1.isNil)(resolved.flowVersion)) {
            return { kind: types_1.JobResultKind.FIRE_AND_FORGET, status: shared_1.EngineResponseStatus.INTERNAL_ERROR };
        }
        const flowVersion = resolved.flowVersion;
        const { appWebhookUrl, webhookSecret } = getAppWebhookDetails(flowVersion, ctx.publicApiUrl, settings.APP_WEBHOOK_SECRETS);
        let realExecutionStarted = false;
        const { data: execResult, error } = await (0, core_utils_1.tryCatch)(async () => {
            if (data.saveSampleData) {
                const sampleResult = await ctx.runtime.execute({
                    workerIndex: ctx.workerIndex,
                    log: ctx.log,
                    operationType: shared_1.EngineOperationType.EXECUTE_TRIGGER_HOOK,
                    operation: {
                        hookType: shared_1.TriggerHookType.RUN,
                        flowVersion,
                        webhookUrl: (0, webhook_url_1.getWebhookUrl)(ctx.publicApiUrl, data.flowId, true),
                        triggerPayload: data.payload,
                        test: true,
                        projectId: data.projectId,
                        platformId: data.platformId,
                        engineToken: ctx.engineToken,
                        internalApiUrl: ctx.internalApiUrl,
                        publicApiUrl: ctx.publicApiUrl,
                        timeoutInSeconds,
                        appWebhookUrl,
                        webhookSecret,
                    },
                    timeoutInSeconds,
                    provision: resolved.provision,
                });
                if (sampleResult.status === shared_1.EngineResponseStatus.OK) {
                    const sampleTriggerResult = sampleResult.response;
                    if (sampleTriggerResult.output.length > 0) {
                        await ctx.apiClient.savePayloads({
                            flowId: data.flowId,
                            flowVersionId: flowVersion.id,
                            projectId: data.projectId,
                            payloads: sampleTriggerResult.output,
                        });
                    }
                }
            }
            if (!data.execute) {
                return null;
            }
            realExecutionStarted = true;
            const result = await ctx.runtime.execute({
                workerIndex: ctx.workerIndex,
                log: ctx.log,
                operationType: shared_1.EngineOperationType.EXECUTE_TRIGGER_HOOK,
                operation: {
                    hookType: shared_1.TriggerHookType.RUN,
                    flowVersion,
                    webhookUrl: (0, webhook_url_1.getWebhookUrl)(ctx.publicApiUrl, data.flowId),
                    triggerPayload: data.payload,
                    test: false,
                    projectId: data.projectId,
                    platformId: data.platformId,
                    engineToken: ctx.engineToken,
                    internalApiUrl: ctx.internalApiUrl,
                    publicApiUrl: ctx.publicApiUrl,
                    timeoutInSeconds,
                    appWebhookUrl,
                    webhookSecret,
                },
                timeoutInSeconds,
                provision: resolved.provision,
            });
            return result;
        });
        if (error) {
            if (realExecutionStarted) {
                await (0, trigger_run_recorder_1.recordTriggerRun)({ apiClient: ctx.apiClient, log: ctx.log, flowVersion, platformId: data.platformId, status: shared_1.EngineResponseStatus.INTERNAL_ERROR });
            }
            if ((0, sandbox_helpers_1.isSandboxTimeout)(error)) {
                ctx.log.warn({ flowVersion: { id: data.flowVersionIdToRun } }, 'Webhook execution timed out in sandbox');
                return { kind: types_1.JobResultKind.FIRE_AND_FORGET, status: shared_1.EngineResponseStatus.OK };
            }
            throw error;
        }
        if ((0, core_utils_1.isNil)(execResult)) {
            return { kind: types_1.JobResultKind.FIRE_AND_FORGET, status: shared_1.EngineResponseStatus.OK };
        }
        if (execResult.status === shared_1.EngineResponseStatus.OK) {
            const triggerResult = execResult.response;
            if (triggerResult.output.length > 0) {
                await ctx.apiClient.submitPayloads({
                    flowVersionId: flowVersion.id,
                    projectId: data.projectId,
                    payloads: triggerResult.output,
                    httpRequestId: data.requestId,
                    environment: data.runEnvironment,
                    streamStepProgress: shared_1.StreamStepProgress.NONE,
                    parentRunId: data.parentRunId,
                    failParentOnFailure: data.failParentOnFailure,
                });
            }
        }
        await (0, trigger_run_recorder_1.recordTriggerRun)({ apiClient: ctx.apiClient, log: ctx.log, flowVersion, platformId: data.platformId, status: execResult.status, error: execResult.error });
        return { kind: types_1.JobResultKind.FIRE_AND_FORGET, status: shared_1.EngineResponseStatus.OK, logs: execResult.logs };
    },
};
//# sourceMappingURL=execute-webhook.js.map