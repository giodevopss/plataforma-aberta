"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.localExecutionCache = void 0;
const core_utils_1 = require("@activepieces/core-utils");
const server_utils_1 = require("@activepieces/server-utils");
const action_run_cache_1 = require("./action-run-cache");
const cache_paths_1 = require("./cache-paths");
const engine_installer_1 = require("./engine/engine-installer");
const code_builder_1 = require("./flow/code/code-builder");
const code_cache_1 = require("./flow/code/code-cache");
const piece_installer_1 = require("./pieces/piece-installer");
const localExecutionCache = (log, basePath, getSettings) => ({
    async provision({ pieces, codeSteps, internalApiUrl, engineToken, bestEffort, }) {
        await server_utils_1.wideEvent.timed({
            name: 'provision',
            fn: async () => {
                const paths = (0, cache_paths_1.cacheUtils)(basePath);
                const cachePathLatestVersion = paths.getGlobalCachePathLatestVersion();
                const codeCachePath = paths.getGlobalCodeCachePath();
                const commonPath = paths.getGlobalCacheCommonPath();
                await server_utils_1.fileSystemUtils.threadSafeMkdir(cachePathLatestVersion);
                await server_utils_1.wideEvent.timed({
                    name: 'installCode',
                    fn: async () => {
                        await server_utils_1.fileSystemUtils.threadSafeMkdir(codeCachePath);
                        for (const artifact of codeSteps) {
                            await installCodeStep({ artifact, codeCachePath, log, getSettings });
                        }
                        log.info({ path: codeCachePath }, 'Installed code in sandbox');
                    },
                });
                await server_utils_1.wideEvent.timed({
                    name: 'installEngine',
                    fn: async () => {
                        const { cacheHit } = await (0, engine_installer_1.engineInstaller)(log, getSettings).install({
                            path: commonPath,
                        });
                        log.info({ path: commonPath, cacheHit }, 'Installed engine in sandbox');
                    },
                });
                const uniquePieces = (0, core_utils_1.unique)(pieces);
                if (uniquePieces.length > 0) {
                    await server_utils_1.wideEvent.timed({
                        name: 'installPieces',
                        fn: async () => {
                            await (0, piece_installer_1.pieceInstaller)(log, basePath, getSettings).install({
                                pieces: uniquePieces,
                                includeFilters: true,
                                internalApiUrl,
                                engineToken,
                                bestEffort,
                            });
                            log.info({
                                pieces: uniquePieces.map(p => `${p.pieceName}@${p.pieceVersion}`),
                                path: commonPath,
                            }, 'Installed pieces in sandbox');
                        },
                    });
                }
                log.info('Sandbox installation complete');
            },
        });
    },
});
exports.localExecutionCache = localExecutionCache;
async function installCodeStep({ artifact, codeCachePath, log, getSettings }) {
    const build = async () => {
        await (0, code_builder_1.codeBuilder)(log, getSettings).processCodeStep({
            artifact,
            codesFolderPath: codeCachePath,
        });
    };
    if (!action_run_cache_1.actionRunCache.isActionRunNamespace(artifact.flowVersionId)) {
        await build();
        return;
    }
    const dirPath = (0, code_cache_1.codeCache)(codeCachePath).flowVersionDir(artifact.flowVersionId);
    do {
        await build();
        await action_run_cache_1.actionRunCache.touch(dirPath);
    } while (await sweptWhileProvisioning({ dirPath, log }));
}
async function sweptWhileProvisioning({ dirPath, log }) {
    const swept = await action_run_cache_1.actionRunCache.settlePendingRemoval(dirPath);
    if (swept) {
        log.warn({ cache: { path: dirPath } }, 'Action-run code cache was swept while provisioning, rebuilding');
    }
    return swept;
}
//# sourceMappingURL=local-execution-cache.js.map