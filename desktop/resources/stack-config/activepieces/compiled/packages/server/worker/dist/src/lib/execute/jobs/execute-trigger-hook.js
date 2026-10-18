"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeTriggerHookJob = void 0;
const core_utils_1 = require("@activepieces/core-utils");
const shared_1 = require("@activepieces/shared");
const worker_settings_1 = require("../../config/worker-settings");
const types_1 = require("../types");
const sandbox_helpers_1 = require("../utils/sandbox-helpers");
const synchronous_result_1 = require("../utils/synchronous-result");
const webhook_url_1 = require("../utils/webhook-url");
exports.executeTriggerHookJob = {
    jobType: shared_1.WorkerJobType.EXECUTE_TRIGGER_HOOK,
    async execute(ctx, data) {
        const timeoutInSeconds = worker_settings_1.workerSettings.getSettings().TRIGGER_HOOKS_TIMEOUT_SECONDS;
        const resolved = await ctx.resolver.resolve({ platformId: data.platformId, internalApiUrl: ctx.internalApiUrl, engineToken: ctx.engineToken, flow: { id: data.flowId, versionId: data.flowVersionId, projectId: data.projectId } });
        if (resolved.kind === 'flow-not-found') {
            ctx.log.info({ flowVersion: { id: data.flowVersionId } }, 'Flow version not found for trigger hook, skipping');
            return { kind: types_1.JobResultKind.SYNCHRONOUS, status: shared_1.EngineResponseStatus.OK, response: undefined };
        }
        if (resolved.kind === 'disabled') {
            ctx.log.info({ flow: { id: data.flowId } }, 'Failed to resolve pieces for trigger hook, skipping');
            return { kind: types_1.JobResultKind.SYNCHRONOUS, status: shared_1.EngineResponseStatus.OK, response: undefined };
        }
        // resolved.kind === 'ready' — flowVersion is guaranteed present when flow: is passed to resolve
        if ((0, core_utils_1.isNil)(resolved.flowVersion)) {
            return { kind: types_1.JobResultKind.SYNCHRONOUS, status: shared_1.EngineResponseStatus.OK, response: undefined };
        }
        const flowVersion = resolved.flowVersion;
        const { data: result, error } = await (0, core_utils_1.tryCatch)(async () => {
            return ctx.runtime.execute({
                workerIndex: ctx.workerIndex,
                log: ctx.log,
                operationType: shared_1.EngineOperationType.EXECUTE_TRIGGER_HOOK,
                operation: {
                    hookType: data.hookType,
                    flowVersion,
                    webhookUrl: (0, webhook_url_1.getWebhookUrl)(ctx.publicApiUrl, data.flowId, data.test),
                    triggerPayload: (0, core_utils_1.isNil)(data.triggerPayload) ? undefined : { type: 'inline', value: data.triggerPayload },
                    isRepublish: data.isRepublish,
                    test: data.test,
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
        });
        if (error) {
            if ((0, sandbox_helpers_1.isSandboxTimeout)(error)) {
                return { kind: types_1.JobResultKind.SYNCHRONOUS, status: shared_1.EngineResponseStatus.TIMEOUT, response: undefined };
            }
            throw error;
        }
        return (0, synchronous_result_1.buildSynchronousResult)(result);
    },
};
//# sourceMappingURL=execute-trigger-hook.js.map