"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executePropertyJob = void 0;
const core_utils_1 = require("@activepieces/core-utils");
const shared_1 = require("@activepieces/shared");
const worker_settings_1 = require("../../config/worker-settings");
const types_1 = require("../types");
const sandbox_helpers_1 = require("../utils/sandbox-helpers");
const synchronous_result_1 = require("../utils/synchronous-result");
exports.executePropertyJob = {
    jobType: shared_1.WorkerJobType.EXECUTE_PROPERTY,
    async execute(ctx, data) {
        const timeoutInSeconds = worker_settings_1.workerSettings.getSettings().TRIGGER_TIMEOUT_SECONDS;
        const resolved = await ctx.resolver.resolve({ platformId: data.platformId, internalApiUrl: ctx.internalApiUrl, engineToken: ctx.engineToken, pieces: [data.piece] });
        if (resolved.kind !== 'ready') {
            throw new Error(`Unexpected resolve outcome "${resolved.kind}" for piece-only job`);
        }
        const { data: result, error } = await (0, core_utils_1.tryCatch)(async () => {
            return ctx.runtime.execute({
                workerIndex: ctx.workerIndex,
                log: ctx.log,
                operationType: shared_1.EngineOperationType.EXECUTE_PROPERTY,
                operation: {
                    piece: data.piece,
                    propertyName: data.propertyName,
                    actionOrTriggerName: data.actionOrTriggerName,
                    flowVersion: data.flowVersion,
                    input: data.input,
                    sampleData: data.sampleData,
                    projectId: data.projectId,
                    searchValue: data.searchValue,
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
                return { kind: types_1.JobResultKind.SYNCHRONOUS, status: shared_1.EngineResponseStatus.TIMEOUT, response: {} };
            }
            throw error;
        }
        return (0, synchronous_result_1.buildSynchronousResult)(result);
    },
};
//# sourceMappingURL=execute-property.js.map