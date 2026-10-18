"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renewWebhookJob = void 0;
const core_utils_1 = require("@activepieces/core-utils");
const shared_1 = require("@activepieces/shared");
const worker_settings_1 = require("../../config/worker-settings");
const types_1 = require("../types");
const webhook_url_1 = require("../utils/webhook-url");
exports.renewWebhookJob = {
    jobType: shared_1.WorkerJobType.RENEW_WEBHOOK,
    async execute(ctx, data) {
        const timeoutInSeconds = worker_settings_1.workerSettings.getSettings().TRIGGER_HOOKS_TIMEOUT_SECONDS;
        const resolved = await ctx.resolver.resolve({ platformId: data.platformId, internalApiUrl: ctx.internalApiUrl, engineToken: ctx.engineToken, flow: { id: data.flowId, versionId: data.flowVersionId, projectId: data.projectId } });
        if (resolved.kind === 'flow-not-found') {
            ctx.log.info({ flowVersion: { id: data.flowVersionId } }, 'Flow version not found for renew webhook, skipping');
            return { kind: types_1.JobResultKind.FIRE_AND_FORGET, status: shared_1.EngineResponseStatus.OK };
        }
        if (resolved.kind === 'disabled') {
            return { kind: types_1.JobResultKind.FIRE_AND_FORGET, status: shared_1.EngineResponseStatus.OK };
        }
        // resolved.kind === 'ready' — flowVersion is guaranteed present when flow: is passed to resolve
        if ((0, core_utils_1.isNil)(resolved.flowVersion)) {
            return { kind: types_1.JobResultKind.FIRE_AND_FORGET, status: shared_1.EngineResponseStatus.OK };
        }
        const flowVersion = resolved.flowVersion;
        await ctx.runtime.execute({
            workerIndex: ctx.workerIndex,
            log: ctx.log,
            operationType: shared_1.EngineOperationType.EXECUTE_TRIGGER_HOOK,
            operation: {
                hookType: shared_1.TriggerHookType.RENEW,
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
        return { kind: types_1.JobResultKind.FIRE_AND_FORGET, status: shared_1.EngineResponseStatus.OK };
    },
};
//# sourceMappingURL=renew-webhook.js.map