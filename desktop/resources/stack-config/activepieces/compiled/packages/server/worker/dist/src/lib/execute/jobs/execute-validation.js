"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeValidationJob = void 0;
const shared_1 = require("@activepieces/shared");
const worker_settings_1 = require("../../config/worker-settings");
const types_1 = require("../types");
const sandbox_helpers_1 = require("../utils/sandbox-helpers");
const synchronous_result_1 = require("../utils/synchronous-result");
exports.executeValidationJob = {
    jobType: shared_1.WorkerJobType.EXECUTE_VALIDATION,
    async execute(ctx, data) {
        const timeoutInSeconds = worker_settings_1.workerSettings.getSettings().TRIGGER_TIMEOUT_SECONDS;
        const resolved = await ctx.resolver.resolve({ platformId: data.platformId, internalApiUrl: ctx.internalApiUrl, engineToken: ctx.engineToken, pieces: [data.piece] });
        if (resolved.kind !== 'ready') {
            throw new Error(`Unexpected resolve outcome "${resolved.kind}" for piece-only job`);
        }
        try {
            const result = await ctx.runtime.execute({
                workerIndex: ctx.workerIndex,
                log: ctx.log,
                operationType: shared_1.EngineOperationType.EXECUTE_VALIDATE_AUTH,
                operation: {
                    piece: data.piece,
                    auth: data.connectionValue,
                    platformId: data.platformId,
                    engineToken: ctx.engineToken,
                    internalApiUrl: ctx.internalApiUrl,
                    publicApiUrl: ctx.publicApiUrl,
                    timeoutInSeconds,
                },
                timeoutInSeconds,
                provision: resolved.provision,
            });
            return (0, synchronous_result_1.buildSynchronousResult)(result);
        }
        catch (e) {
            if ((0, sandbox_helpers_1.isSandboxTimeout)(e)) {
                return {
                    kind: types_1.JobResultKind.SYNCHRONOUS,
                    status: shared_1.EngineResponseStatus.TIMEOUT,
                    response: { valid: false, error: 'Validation timed out' },
                };
            }
            throw e;
        }
    },
};
//# sourceMappingURL=execute-validation.js.map