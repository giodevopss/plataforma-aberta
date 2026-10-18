"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeActionJob = void 0;
const core_utils_1 = require("@activepieces/core-utils");
const sandbox_1 = require("@activepieces/sandbox");
const server_utils_1 = require("@activepieces/server-utils");
const shared_1 = require("@activepieces/shared");
const types_1 = require("../types");
const sandbox_helpers_1 = require("../utils/sandbox-helpers");
const synchronous_result_1 = require("../utils/synchronous-result");
exports.executeActionJob = {
    jobType: shared_1.WorkerJobType.EXECUTE_ACTION,
    async execute(ctx, data) {
        const { codes, namespace: codeNamespace } = await resolveCodeStep({ step: data.step, platformId: data.platformId });
        const resolved = await ctx.resolver.resolve({ platformId: data.platformId, internalApiUrl: ctx.internalApiUrl, engineToken: ctx.engineToken, pieces: data.piece ? [data.piece] : [], codes });
        if (resolved.kind !== 'ready') {
            throw new Error(`Unexpected resolve outcome "${resolved.kind}" for action-run action job`);
        }
        const timeoutInSeconds = Math.ceil((data.expiresAt - Date.now()) / 1000);
        const { data: result, error } = await (0, core_utils_1.tryCatch)(async () => {
            return ctx.runtime.execute({
                workerIndex: ctx.workerIndex,
                log: ctx.log,
                operationType: shared_1.EngineOperationType.EXECUTE_ACTION,
                operation: {
                    step: data.step,
                    projectId: data.projectId,
                    platformId: data.platformId,
                    engineToken: ctx.engineToken,
                    internalApiUrl: ctx.internalApiUrl,
                    publicApiUrl: ctx.publicApiUrl,
                    timeoutInSeconds,
                    ...(0, core_utils_1.spreadIfDefined)('flowVersionId', codeNamespace),
                },
                timeoutInSeconds,
                expiresAt: data.expiresAt,
                provision: { ...resolved.provision, ...(0, core_utils_1.spreadIfDefined)('flowVersionId', codeNamespace) },
            });
        });
        if (error) {
            if ((0, sandbox_helpers_1.isSandboxTimeout)(error)) {
                return {
                    kind: types_1.JobResultKind.SYNCHRONOUS,
                    status: shared_1.EngineResponseStatus.TIMEOUT,
                    response: { success: false, input: {}, output: null, neverStarted: error.error.params.neverStarted === true },
                };
            }
            throw error;
        }
        return (0, synchronous_result_1.buildSynchronousResult)(result);
    },
};
async function resolveCodeStep({ step, platformId }) {
    if (step.type !== shared_1.FlowActionType.CODE) {
        return { codes: [] };
    }
    const sourceHash = await server_utils_1.cryptoUtils.hashObject(step.settings.sourceCode);
    const namespace = sandbox_1.actionRunCache.namespace({ platformId, sourceHash });
    return {
        namespace,
        codes: [{
                name: step.name,
                sourceCode: step.settings.sourceCode,
                flowVersionId: namespace,
                flowVersionState: shared_1.DEFAULT_MCP_DATA.flowVersionState,
                useDeno: step.settings.useDeno === true,
            }],
    };
}
//# sourceMappingURL=execute-action.js.map