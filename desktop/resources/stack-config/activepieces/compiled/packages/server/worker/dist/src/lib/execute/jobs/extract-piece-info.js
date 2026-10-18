"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractPieceInfoJob = void 0;
const shared_1 = require("@activepieces/shared");
const worker_settings_1 = require("../../config/worker-settings");
const synchronous_result_1 = require("../utils/synchronous-result");
exports.extractPieceInfoJob = {
    jobType: shared_1.WorkerJobType.EXECUTE_EXTRACT_PIECE_INFORMATION,
    async execute(ctx, data) {
        const timeoutInSeconds = worker_settings_1.workerSettings.getSettings().TRIGGER_TIMEOUT_SECONDS;
        const resolved = await ctx.resolver.resolve({ platformId: data.platformId, internalApiUrl: ctx.internalApiUrl, engineToken: ctx.engineToken, pieces: [data.piece] });
        if (resolved.kind !== 'ready') {
            throw new Error(`Unexpected resolve outcome "${resolved.kind}" for piece-only job`);
        }
        const result = await ctx.runtime.execute({
            workerIndex: ctx.workerIndex,
            log: ctx.log,
            operationType: shared_1.EngineOperationType.EXTRACT_PIECE_METADATA,
            operation: {
                ...data.piece,
                platformId: data.platformId,
                timeoutInSeconds,
            },
            timeoutInSeconds,
            provision: resolved.provision,
        });
        return (0, synchronous_result_1.buildSynchronousResult)(result);
    },
};
//# sourceMappingURL=extract-piece-info.js.map