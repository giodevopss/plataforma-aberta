"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pieceInstaller = void 0;
exports.isValidPackageName = isValidPackageName;
const tslib_1 = require("tslib");
const promises_1 = require("node:fs/promises");
const node_path_1 = tslib_1.__importStar(require("node:path"));
const core_utils_1 = require("@activepieces/core-utils");
const server_utils_1 = require("@activepieces/server-utils");
const shared_1 = require("@activepieces/shared");
const write_file_atomic_1 = tslib_1.__importDefault(require("write-file-atomic"));
const bun_runner_1 = require("../../utils/bun-runner");
const cache_paths_1 = require("../cache-paths");
const BUNDLE_DOWNLOAD_ATTEMPTS = 3;
const VALID_SCOPED_NAME_REGEX = /^@[^/]+\/[^/]+$/;
const VALID_UNSCOPED_NAME_REGEX = /^[^/]+$/;
const relativePiecePath = (piece) => (0, node_path_1.join)('./', 'pieces', `${piece.pieceName}-${piece.pieceVersion}`);
const piecePath = (rootWorkspace, piece) => (0, node_path_1.join)(rootWorkspace, 'pieces', `${piece.pieceName}-${piece.pieceVersion}`);
const pieceInstaller = (log, basePath, getSettings) => ({
    async install({ pieces, includeFilters, internalApiUrl, engineToken, bestEffort }) {
        const groupedPieces = groupPiecesByPackagePath(pieces, basePath, getSettings);
        const installPromises = Object.entries(groupedPieces).map(async ([packagePath, piecesInGroup]) => {
            await installPieces(packagePath, piecesInGroup, includeFilters, log, { internalApiUrl, engineToken }, getSettings, bestEffort ?? false);
        });
        await Promise.all(installPromises);
    },
    getCustomPiecesPath(platformId) {
        return getCustomPiecesPath(basePath, platformId, getSettings);
    },
});
exports.pieceInstaller = pieceInstaller;
function getCustomPiecesPath(basePath, platformId, getSettings) {
    const paths = (0, cache_paths_1.cacheUtils)(basePath);
    switch (getSettings().EXECUTION_MODE) {
        case shared_1.ExecutionMode.SANDBOX_PROCESS:
        case shared_1.ExecutionMode.SANDBOX_CODE_AND_PROCESS:
            return node_path_1.default.resolve(paths.getGlobalCachePathLatestVersion(), 'custom_pieces', platformId);
        case shared_1.ExecutionMode.UNSANDBOXED:
        case shared_1.ExecutionMode.SANDBOX_CODE_ONLY:
            return paths.getGlobalCacheCommonPath();
        default:
            throw new Error('Invalid execution mode');
    }
}
async function installPieces(rootWorkspace, pieces, includeFilters, log, bundleSource, getSettings, bestEffort) {
    const devPieces = getSettings().DEV_PIECES;
    const nonDevPieces = pieces.filter(piece => !devPieces.includes((0, shared_1.getPieceNameFromAlias)(piece.pieceName)));
    const { validPieces, invalidPieces } = partitionValidPieceNames(nonDevPieces);
    if (!(0, core_utils_1.isEmpty)(invalidPieces)) {
        log.error({
            rootWorkspace,
            invalidPieces: invalidPieces.map(piece => `${piece.pieceName}@${piece.pieceVersion}`),
        }, '[pieceInstaller] Skipping pieces with invalid package names to protect the shared lockfile');
    }
    const { piecesToInstall } = await partitionPiecesToInstall(rootWorkspace, validPieces);
    if ((0, core_utils_1.isEmpty)(piecesToInstall)) {
        log.debug({ rootWorkspace }, '[pieceInstaller] No new pieces to install (already installed)');
        return;
    }
    log.info({
        rootWorkspace,
        piecesToInstall: piecesToInstall.map(piece => `${piece.pieceName}-${piece.pieceVersion}`),
    }, '[pieceInstaller] Installing pieces in workspace');
    await server_utils_1.memoryLock.runExclusive({
        key: `install-pieces-${rootWorkspace}`,
        fn: async () => {
            const { piecesToInstall } = await partitionPiecesToInstall(rootWorkspace, validPieces);
            if ((0, core_utils_1.isEmpty)(piecesToInstall)) {
                log.info({ rootWorkspace }, '[pieceInstaller] No new pieces to install in lock (already installed)');
                return;
            }
            log.info({
                rootWorkspace,
                pieces: piecesToInstall.map(piece => `${piece.pieceName}-${piece.pieceVersion}`),
            }, '[pieceInstaller] acquired lock and starting to install pieces');
            await createRootWorkspaceFiles({
                path: rootWorkspace,
            });
            const { downloaded, failures } = await saveBundlesToDiskIfNotCached(rootWorkspace, piecesToInstall, bundleSource);
            if (!(0, core_utils_1.isEmpty)(failures)) {
                log.error({
                    rootWorkspace,
                    failedPieces: failures.map(({ piece }) => `${piece.pieceName}@${piece.pieceVersion}`),
                }, '[pieceInstaller] Skipping pieces whose bundle download failed after retries');
            }
            if (!(0, core_utils_1.isEmpty)(downloaded)) {
                await Promise.all(downloaded.map(piece => createPiecePackageJson({
                    rootWorkspace,
                    piecePackage: piece,
                })));
                await server_utils_1.wideEvent.timed({
                    name: 'bunInstall',
                    fn: async () => {
                        const { error: batchError } = await (0, core_utils_1.tryCatch)(async () => (0, bun_runner_1.bunRunner)(log).install({
                            path: rootWorkspace,
                            filtersPath: includeFilters ? downloaded.map(relativePiecePath) : [],
                        }));
                        if ((0, core_utils_1.isNil)(batchError)) {
                            await markPiecesAsUsed(rootWorkspace, downloaded);
                            log.info({
                                rootWorkspace,
                                piecesCount: downloaded.length,
                            }, '[pieceInstaller] Installed registry pieces using bun');
                            return;
                        }
                        if (downloaded.length === 1) {
                            log.error({ rootWorkspace, error: batchError }, '[pieceInstaller] Piece installation failed, rolling back');
                            await rollbackInstallation(rootWorkspace, downloaded);
                            throw batchError;
                        }
                        log.warn({
                            rootWorkspace,
                            pieces: downloaded.map(piece => `${piece.pieceName}-${piece.pieceVersion}`),
                            error: batchError,
                        }, '[pieceInstaller] Batch install failed, retrying pieces individually');
                        const failedPieces = await tryInstallPiecesIndividually(rootWorkspace, downloaded, log);
                        if (failedPieces.length > 0) {
                            const names = failedPieces.map(p => `${p.pieceName}@${p.pieceVersion}`).join(', ');
                            throw new Error(`[pieceInstaller] Failed to install: ${names}`);
                        }
                        log.info({
                            rootWorkspace,
                            piecesCount: downloaded.length,
                        }, '[pieceInstaller] Installed registry pieces using bun (individual fallback)');
                    },
                });
            }
            if (!bestEffort && !(0, core_utils_1.isEmpty)(failures)) {
                throw failures[0].error;
            }
        },
    });
}
// A workspace member name (and its dependency key) must be a plain npm package name. A relative
// path such as `../../../common/pieces/@activepieces/piece-x` — fed in via stale `usedPieces` data
// from a since-reverted build — makes bun write an unparseable resolution token into the SHARED
// bun.lock. That lock then fails to parse on the next install and takes down EVERY piece in the
// workspace (so cache pre-warm and the deploy fail). Worse, because the install joins the name onto
// `<workspace>/pieces/`, a `..` name escapes a per-platform `custom_pieces/<id>` workspace and lands
// the poisoned member inside the shared `common` workspace. Such names are skipped at the source.
function isValidPackageName(name) {
    if (name.includes('..')) {
        return false;
    }
    return VALID_SCOPED_NAME_REGEX.test(name) || VALID_UNSCOPED_NAME_REGEX.test(name);
}
function partitionValidPieceNames(pieces) {
    return {
        validPieces: pieces.filter(piece => isValidPackageName(piece.pieceName)),
        invalidPieces: pieces.filter(piece => !isValidPackageName(piece.pieceName)),
    };
}
async function rollbackInstallation(rootWorkspace, pieces) {
    await Promise.all(pieces.map(piece => (0, promises_1.rm)(node_path_1.default.resolve(rootWorkspace, relativePiecePath(piece)), {
        recursive: true,
        force: true,
    })));
}
async function tryInstallPiecesIndividually(rootWorkspace, pieces, log) {
    const failures = [];
    for (const piece of pieces) {
        const { error } = await (0, core_utils_1.tryCatch)(async () => (0, bun_runner_1.bunRunner)(log).install({
            path: rootWorkspace,
            filtersPath: [relativePiecePath(piece)],
        }));
        if (error) {
            log.error({
                piece: `${piece.pieceName}@${piece.pieceVersion}`,
                error,
            }, '[pieceInstaller] Individual piece installation failed, rolling back');
            await rollbackInstallation(rootWorkspace, [piece]);
            failures.push(piece);
        }
        else {
            await markPiecesAsUsed(rootWorkspace, [piece]);
        }
    }
    return failures;
}
function groupPiecesByPackagePath(pieces, basePath, getSettings) {
    const paths = (0, cache_paths_1.cacheUtils)(basePath);
    return (0, core_utils_1.groupBy)(pieces, (piece) => {
        switch (piece.packageType) {
            case shared_1.PackageType.ARCHIVE:
                return getCustomPiecesPath(basePath, piece.platformId, getSettings);
            case shared_1.PackageType.REGISTRY: {
                if (piece.pieceType === shared_1.PieceType.CUSTOM && !(0, core_utils_1.isNil)(piece.platformId)) {
                    return getCustomPiecesPath(basePath, piece.platformId, getSettings);
                }
                return paths.getGlobalCacheCommonPath();
            }
            default:
                throw new Error('Invalid package type');
        }
    });
}
const WORKSPACE_BUNFIG = '[install]\nlinker = "isolated"\nminimumReleaseAge = 259200\n';
async function createRootWorkspaceFiles({ path }) {
    const packageJsonPath = (0, node_path_1.join)(path, 'package.json');
    await server_utils_1.fileSystemUtils.threadSafeMkdir((0, node_path_1.dirname)(packageJsonPath));
    await (0, write_file_atomic_1.default)(packageJsonPath, JSON.stringify({
        'name': 'fast-workspace',
        'version': '1.0.0',
        'workspaces': [
            'pieces/**',
        ],
    }, null, 2), 'utf8');
    await (0, write_file_atomic_1.default)((0, node_path_1.join)(path, 'bunfig.toml'), WORKSPACE_BUNFIG, 'utf8');
}
async function createPiecePackageJson({ rootWorkspace, piecePackage }) {
    const packageJsonPath = (0, node_path_1.join)(piecePath(rootWorkspace, piecePackage), 'package.json');
    const packageJson = {
        'name': `${piecePackage.pieceName}-${piecePackage.pieceVersion}`,
        'version': `${piecePackage.pieceVersion}`,
        'dependencies': {
            [piecePackage.pieceName]: bundleTgzPath(rootWorkspace, piecePackage),
        },
    };
    await server_utils_1.fileSystemUtils.threadSafeMkdir((0, node_path_1.dirname)(packageJsonPath));
    await (0, promises_1.writeFile)(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf8');
}
function bundleTgzPath(rootWorkspace, piece) {
    return (0, node_path_1.join)(piecePath(rootWorkspace, piece), 'bundle.tgz');
}
// Downloads each piece tarball from the engine bundle endpoint (which 307-redirects to npm /
// signed-S3, or streams the custom archive) to a local .tgz. We download here — rather than handing
// the URL to `bun install` — because bun derives a cache directory name from the dependency spec,
// and a long signed-S3 / engine-token URL overflows the filesystem name limit (ENAMETOOLONG).
// `fetch` follows the redirect and carries the engine token in the Authorization header.
// ARCHIVE pieces are fetched by archiveId (they may not be registered in metadata yet, e.g. during
// EXTRACT_PIECE_METADATA); REGISTRY pieces by name@version.
async function saveBundlesToDiskIfNotCached(rootWorkspace, pieces, bundleSource) {
    const results = await Promise.all(pieces.map(async (piece) => {
        const { error } = await (0, core_utils_1.tryCatch)(() => downloadBundleWithRetry({ rootWorkspace, piece, bundleSource }));
        return { piece, error };
    }));
    const downloaded = [];
    const failures = [];
    for (const { piece, error } of results) {
        if ((0, core_utils_1.isNil)(error)) {
            downloaded.push(piece);
        }
        else {
            failures.push({ piece, error });
        }
    }
    return { downloaded, failures };
}
async function downloadBundleWithRetry({ rootWorkspace, piece, bundleSource }) {
    let lastError;
    for (let attempt = 1; attempt <= BUNDLE_DOWNLOAD_ATTEMPTS; attempt++) {
        const { error } = await (0, core_utils_1.tryCatch)(() => downloadBundleIfNotCached({ rootWorkspace, piece, bundleSource }));
        if ((0, core_utils_1.isNil)(error)) {
            return;
        }
        lastError = error;
        if (error instanceof core_utils_1.ActivepiecesError && error.error.code === core_utils_1.ErrorCode.PIECE_BUNDLE_NOT_AVAILABLE) {
            break;
        }
    }
    throw lastError;
}
async function downloadBundleIfNotCached({ rootWorkspace, piece, bundleSource: { internalApiUrl, engineToken } }) {
    const bundlePath = bundleTgzPath(rootWorkspace, piece);
    if (await server_utils_1.fileSystemUtils.fileExists(bundlePath)) {
        return;
    }
    const url = pieceBundleEndpointUrl(internalApiUrl, piece);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${engineToken}` } });
    if (!response.ok) {
        if (response.status === 404 || response.status === 410) {
            throw new core_utils_1.ActivepiecesError({
                code: core_utils_1.ErrorCode.PIECE_BUNDLE_NOT_AVAILABLE,
                params: { pieceName: piece.pieceName, pieceVersion: piece.pieceVersion, status: response.status },
            });
        }
        throw new Error(`Failed to fetch piece bundle ${piece.pieceName}@${piece.pieceVersion}: ${response.status} ${response.statusText}`);
    }
    await server_utils_1.fileSystemUtils.threadSafeMkdir((0, node_path_1.dirname)(bundlePath));
    await (0, promises_1.writeFile)(bundlePath, Buffer.from(await response.arrayBuffer()));
}
function pieceBundleEndpointUrl(internalApiUrl, piece) {
    const base = `${(0, core_utils_1.ensureTrailingSlash)(internalApiUrl)}v1/engine/pieces/bundle`;
    if (piece.packageType === shared_1.PackageType.ARCHIVE) {
        return `${base}?archiveId=${encodeURIComponent(piece.archiveId)}`;
    }
    return `${base}?name=${encodeURIComponent(piece.pieceName)}&version=${encodeURIComponent(piece.pieceVersion)}`;
}
async function partitionPiecesToInstall(rootWorkspace, pieces) {
    const piecesWithCheck = await Promise.all(pieces.map(async (piece) => {
        const installed = await pieceCheckIfAlreadyInstalled(rootWorkspace, piece);
        return { piece, installed };
    }));
    const piecesToInstall = piecesWithCheck.filter(({ installed }) => !installed).map(({ piece }) => piece);
    return {
        piecesToInstall,
    };
}
async function pieceCheckIfAlreadyInstalled(rootWorkspace, piece) {
    const pieceFolder = piecePath(rootWorkspace, piece);
    const readyExists = await server_utils_1.fileSystemUtils.fileExists((0, node_path_1.join)(pieceFolder, 'ready'));
    if (!readyExists) {
        return false;
    }
    const engineCanResolve = await pieceEntryFileExists({ pieceFolder, pieceName: piece.pieceName });
    if (!engineCanResolve) {
        await (0, promises_1.rm)((0, node_path_1.join)(pieceFolder, 'ready'), { force: true });
        return false;
    }
    return true;
}
async function pieceEntryFileExists({ pieceFolder, pieceName }) {
    const packageDir = (0, node_path_1.join)(pieceFolder, 'node_modules', pieceName);
    const { data: declaredMain } = await (0, core_utils_1.tryCatch)(async () => {
        const manifest = JSON.parse(await (0, promises_1.readFile)((0, node_path_1.join)(packageDir, 'package.json'), 'utf8'));
        if (typeof manifest !== 'object' || (0, core_utils_1.isNil)(manifest) || !('main' in manifest)) {
            return null;
        }
        const { main } = manifest;
        return typeof main === 'string' ? main : null;
    });
    if (!(0, core_utils_1.isNil)(declaredMain)) {
        const mainPath = (0, node_path_1.join)(packageDir, declaredMain);
        if (await server_utils_1.fileSystemUtils.fileExists(mainPath)) {
            return isLoadableEntry(mainPath);
        }
    }
    return isLoadableEntry((0, node_path_1.join)(packageDir, 'src', 'index.js'));
}
async function isLoadableEntry(entryPath) {
    if (await isLoadableFile(entryPath)) {
        return true;
    }
    return isLoadableFile((0, node_path_1.join)(entryPath, 'index.js'));
}
async function isLoadableFile(entryPath) {
    const { data: stats } = await (0, core_utils_1.tryCatch)(async () => (0, promises_1.stat)(entryPath));
    return stats?.isFile() ?? false;
}
async function markPiecesAsUsed(rootWorkspace, pieces) {
    const writeToDiskJobs = pieces.map(async (piece) => {
        const pieceFolder = piecePath(rootWorkspace, piece);
        await server_utils_1.fileSystemUtils.threadSafeMkdir(pieceFolder);
        await (0, write_file_atomic_1.default)((0, node_path_1.join)(pieceFolder, 'ready'), 'true');
    });
    await Promise.all(writeToDiskJobs);
}
//# sourceMappingURL=piece-installer.js.map