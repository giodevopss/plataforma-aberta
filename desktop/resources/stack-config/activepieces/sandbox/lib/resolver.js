"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createResolver = createResolver;
const core_utils_1 = require("@activepieces/core-utils");
const flow_provisioning_1 = require("./cache/flow/flow-provisioning");
// The Resolver is the worker-side, Runtime-Kind-independent half of the seam. It owns the only
// apiClient and turns a job into a fully-materialized ProvisionInput before `execute` is ever called,
// so the pool only sees healthy, complete inputs. Code steps are built from source during provision
// (bun install + index.ts); the bundle carries no code, so publishing needs no build gate.
// fetchArchive is bound to the apiClient and handed to the pool as an opaque thunk — the pool never
// imports WorkerToApiContract.
function createResolver({ apiClient, basePath, getSettings, log }) {
    return {
        async resolve(input) {
            let pieces = input.pieces ?? [];
            let codes = input.codes ?? [];
            let flowVersion;
            if (!(0, core_utils_1.isNil)(input.flow)) {
                const resolved = await (0, flow_provisioning_1.flowProvisioning)(log, apiClient, basePath, getSettings).resolve({ flow: input.flow, platformId: input.platformId });
                if (resolved.kind === 'flow-not-found') {
                    return { kind: 'flow-not-found' };
                }
                if (resolved.kind === 'disabled') {
                    return { kind: 'disabled', failedStep: resolved.failedStep };
                }
                flowVersion = resolved.flowVersion;
                pieces = [...pieces, ...resolved.pieces];
                codes = [...codes, ...resolved.codeSteps];
                if (!(0, core_utils_1.isNil)(resolved.publishBundle)) {
                    void resolved.publishBundle();
                }
            }
            const uniquePieces = (0, core_utils_1.unique)(pieces);
            const provision = {
                platformId: input.platformId,
                flowVersionId: flowVersion?.id,
                pieces: uniquePieces,
                codes,
                internalApiUrl: input.internalApiUrl,
                engineToken: input.engineToken,
            };
            return { kind: 'ready', provision, flowVersion };
        },
    };
}
//# sourceMappingURL=resolver.js.map