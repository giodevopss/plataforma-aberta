import crypto from 'node:crypto';
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export function verifyExtensionBytes(entry,bytes){
 const actual={size:bytes.length,sha256:sha(bytes)};if(actual.size===entry.size&&actual.sha256===entry.sha256)return {...entry};
 // Original Windows checkouts marked these texts as CRLF. The engine bundle
 // preserves canonical LF. Prove equivalent bytes rather than weaken checks.
 if(['LICENSE','THIRD_PARTY_NOTICES.md'].includes(entry.path)&&!bytes.includes(13)){
  const text=bytes.toString('utf8');if(Buffer.from(text).equals(bytes)){const windows=Buffer.from(text.replaceAll('\n','\r\n'));if(windows.length===entry.size&&sha(windows)===entry.sha256)return {...entry,...actual,normalization:{originalSize:entry.size,originalSHA256:entry.sha256,change:'Only CRLF to LF in the original license/notice text'}};}
 }
 throw Error('Current Screenity code differs from the accepted complete native extension: '+entry.path);
}
