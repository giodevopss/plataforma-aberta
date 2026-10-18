// Official complete application image, separately pinned from research source.
import {fileURLToPath} from 'node:url';
import {localModel} from './local-ai.mjs';
export const localApps=[{
  id:'presenton',image:'ghcr.io/presenton/presenton@sha256:ddf0d1f26397764856acdf94489dbbae5a2c0644a280723fd80bc7a80de338ba',
  port:80,memoryMB:3072,healthPath:'/api/v1/auth/status',volumes:[{name:'data',target:'/app_data'}],
  localAI:localModel,
  patches:[{source:fileURLToPath(new URL('../resources/presenton-patches/presentation.py',import.meta.url)),target:'/app/servers/fastapi/api/v1/ppt/endpoints/presentation.py',sha256:'2d0cbef8972fcab1cee1715da6996d617ca54c886ebf8e864b54f2035adbdc6b'}],
  environment:({origin})=>({LLM:'ollama',OLLAMA_URL:'http://ollama:11434',OLLAMA_MODEL:localModel.name,CAN_CHANGE_KEYS:'false',DISABLE_IMAGE_GENERATION:'true',DISABLE_ANONYMOUS_TRACKING:'true',MIGRATE_DATABASE_ON_STARTUP:'true',START_OLLAMA:'false',DISABLE_THINKING:'true',LLM_REASONING_MODE:'disabled',LLM_REASONING_EFFORT:'none',PRESENTON_PUBLIC_URL:origin})
}];
