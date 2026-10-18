"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApiToWorkerHandlers = createApiToWorkerHandlers;
function createApiToWorkerHandlers({ getRuntime, apiClient, getInternalApiUrl, log }) {
    return {
        flowPublished({ flowId, flowVersionId, projectId }) {
            log.info({ flowId, flowVersionId, projectId, message: 'Flow published, prewarming flow cache' });
            void getRuntime()?.prewarm({
                log,
                apiClient,
                internalApiUrl: getInternalApiUrl(),
                flow: { id: flowId, versionId: flowVersionId, projectId },
            });
        },
    };
}
//# sourceMappingURL=api-notify-service.js.map