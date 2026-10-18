"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveConnectionIdentifierJob = void 0;
const core_utils_1 = require("@activepieces/core-utils");
const shared_1 = require("@activepieces/shared");
const worker_settings_1 = require("../../config/worker-settings");
const types_1 = require("../types");
exports.resolveConnectionIdentifierJob = {
    jobType: shared_1.WorkerJobType.EXECUTE_RESOLVE_CONNECTION_IDENTIFIER,
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
                operationType: shared_1.EngineOperationType.EXECUTE_RESOLVE_CONNECTION_IDENTIFIER,
                operation: {
                    piece: data.piece,
                    auth: data.connectionValue,
                    connectionType: data.connectionType,
                    platformId: data.platformId,
                    engineToken: ctx.engineToken,
                    internalApiUrl: ctx.internalApiUrl,
                    publicApiUrl: ctx.publicApiUrl,
                    timeoutInSeconds,
                },
                timeoutInSeconds,
                provision: resolved.provision,
            });
            return {
                kind: types_1.JobResultKind.SYNCHRONOUS,
                status: result.status,
                response: result.response,
                errorMessage: result.error,
                logs: result.logs,
            };
        }
        catch (e) {
            if (e instanceof core_utils_1.ActivepiecesError && e.error.code === core_utils_1.ErrorCode.SANDBOX_EXECUTION_TIMEOUT) {
                return {
                    kind: types_1.JobResultKind.SYNCHRONOUS,
                    status: shared_1.EngineResponseStatus.TIMEOUT,
                    response: { identifier: undefined },
                };
            }
            throw e;
        }
    },
};
//# sourceMappingURL=resolve-connection-identifier.js.map