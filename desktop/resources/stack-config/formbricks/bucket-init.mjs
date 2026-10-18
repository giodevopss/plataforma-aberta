// Private local object store bootstrap; no cloud account or external endpoint.
// AWS Signature V4: https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html
import crypto from 'node:crypto';
const endpoint=new URL(process.env.PA_S3_ENDPOINT||'http://storage:9000');
const bucket=process.env.PA_S3_BUCKET,access=process.env.PA_S3_ACCESS_KEY,secret=process.env.PA_S3_SECRET_KEY;
if(endpoint.origin!=='http://storage:9000'||!/^plataforma-files$/.test(bucket||'')||access!=='plataforma'||!/^[a-f0-9]{64}$/.test(secret||''))throw Error('Invalid private object store configuration');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex'),hmac=(key,value)=>crypto.createHmac('sha256',key).update(value).digest();
for(let attempt=0;attempt<120;attempt++){
 const date=new Date().toISOString().replace(/[-:]|\.\d{3}/g,''),day=date.slice(0,8),scope=day+'/us-east-1/s3/aws4_request',payload=hash('');
 const headers={'x-amz-date':date,'x-amz-content-sha256':payload};const canonical='PUT\n/'+bucket+'\n\nhost:'+endpoint.host+'\nx-amz-content-sha256:'+payload+'\nx-amz-date:'+date+'\n\nhost;x-amz-content-sha256;x-amz-date\n'+payload;
 const signing=hmac(hmac(hmac(hmac('AWS4'+secret,day),'us-east-1'),'s3'),'aws4_request');const signature=crypto.createHmac('sha256',signing).update('AWS4-HMAC-SHA256\n'+date+'\n'+scope+'\n'+hash(canonical)).digest('hex');
 headers.Authorization='AWS4-HMAC-SHA256 Credential='+access+'/'+scope+', SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature='+signature;
 try{const response=await fetch(endpoint.origin+'/'+bucket,{method:'PUT',headers,body:'',signal:AbortSignal.timeout(5000)});const text=await response.text();if(response.ok||response.status===409&&text.includes('<Code>BucketAlreadyOwnedByYou</Code>')){console.log('Private local bucket ready');process.exit(0);}if(response.status<500)throw Error('Bucket initialization rejected: HTTP '+response.status+' '+(text.match(/<Code>([^<]+)<\/Code>/)?.[1]||''));}catch(error){if(error.message.startsWith('Bucket initialization rejected'))throw error;}
 await new Promise(r=>setTimeout(r,1000));
}
throw Error('Private object store did not become ready');
