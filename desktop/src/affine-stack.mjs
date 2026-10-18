import {gatewayConfig} from './local-runtime.mjs';
import crypto from 'node:crypto';
export const affineImages=Object.freeze({
 application:'ghcr.io/toeverything/affine@sha256:b649f5ce2384ffdf13c23bccf81d759e15973d59d0b0058af65d895a84373099',
 postgres:'docker.io/pgvector/pgvector@sha256:7b822b0aac60967beb1ea5e576b8602c94c300a157d187f385ae3e0da199b90a',
 redis:'docker.io/library/redis@sha256:858f009f9709ce576febc734aa78b8f6d624b82571f9ddb6bda4377c833b3499',
 gateway:'docker.io/library/nginx@sha256:5616878291a2eed594aee8db4dade5878cf7edcb475e59193904b198d9b830de'
});
export function createAffineStack({prefix,owner,port,token,postgresPassword,specHash}){
 if(!/^pa-[a-f0-9]{24}-affine$/.test(prefix)||!/^[a-f0-9]{24}$/.test(owner)||!/^[a-f0-9]{64}$/.test(postgresPassword))throw Error('Identidade ou credenciais do serviço inválidas.');
 const labels={'app.plataforma-aberta.workspace':owner,'app.plataforma-aberta.spec':specHash};
 const config=gatewayConfig({token,port,upstreamPort:3010});
 const environment={REDIS_SERVER_HOST:'redis',DATABASE_URL:`postgresql://affine:${postgresPassword}@postgres:5432/affine`,DEPLOYMENT_TYPE:'selfhosted',AFFINE_SERVER_EXTERNAL_URL:'http://127.0.0.1:'+port};
 const common={image:affineImages.application,environment,volumes:['./storage:/root/.affine/storage','./config:/root/.affine/config'],labels,mem_limit:'2g',cpus:2,restart:'no'};
 const services={
  postgres:{image:affineImages.postgres,environment:{POSTGRES_USER:'affine',POSTGRES_DB:'affine',POSTGRES_PASSWORD:postgresPassword,POSTGRES_INITDB_ARGS:'--data-checksums'},volumes:['postgres_data:/var/lib/postgresql/data'],healthcheck:{test:['CMD','pg_isready','-U','affine','-d','affine'],interval:'5s',timeout:'3s',retries:20},labels,mem_limit:'1g',restart:'no'},
  redis:{image:affineImages.redis,healthcheck:{test:['CMD','redis-cli','ping'],interval:'5s',timeout:'3s',retries:20},labels,mem_limit:'128m',restart:'no'},
  migration:{...common,command:['sh','-c','node ./scripts/self-host-predeploy.js'],depends_on:{postgres:{condition:'service_healthy'},redis:{condition:'service_healthy'}}},
  application:{...common,depends_on:{migration:{condition:'service_completed_successfully'}}},
  gateway:{image:affineImages.gateway,entrypoint:['nginx'],command:['-c','/etc/pa-gateway.conf','-g','daemon off;'],ports:[`127.0.0.1:${port}:8080`],volumes:['./gateway.conf:/etc/pa-gateway.conf:ro'],user:'65534:65534',read_only:true,tmpfs:['/tmp:rw,noexec,nosuid,size=64m'],cap_drop:['ALL'],security_opt:['no-new-privileges:true'],mem_limit:'128m',labels:{...labels,'app.plataforma-aberta.gateway-config':crypto.createHash('sha256').update(config).digest('hex')},depends_on:['application'],restart:'no'}
 };
 for(const [role,service] of Object.entries(services))service.container_name=prefix+'-'+role;
 return {config,compose:{name:prefix,services,volumes:{postgres_data:{name:prefix+'-postgres-data',labels}},networks:{default:{name:prefix+'-network',labels}}}};
}
