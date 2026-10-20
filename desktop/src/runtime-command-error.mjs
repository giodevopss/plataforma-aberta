// WSL can report process errors on stdout. Never expose raw command output or
// arguments: application commands may contain private account/provider data.
export function runtimeCommandError({code,signal,stdout='',stderr=''}){
 const output=(stderr+'\n'+stdout).replaceAll('\0','');
 const categories=[
  ['disk',/no space left|ENOSPC|disk (?:is )?full|not enough (?:disk )?space|espaço (?:em disco )?insuficiente/i,'Espaço em disco insuficiente.'],
  ['memory',/out of memory|cannot allocate memory|OOMKilled|E_OUTOFMEMORY/i,'Memória insuficiente no runtime local.'],
  ['network',/connection (?:reset|refused|closed)|TLS handshake timeout|i\/o timeout|temporary failure in name resolution|network is unreachable|unexpected EOF/i,'A conexão do runtime foi interrompida.'],
  ['rate-limit',/toomanyrequests|too many requests|rate limit|HTTP(?: status)? 429/i,'O servidor de componentes atingiu seu limite de requisições.'],
  ['certificate',/x509|certificate (?:has expired|verify failed|signed by unknown)/i,'O certificado do servidor de componentes não pôde ser validado.'],
  ['permission',/permission denied|access (?:is )?denied|E_ACCESSDENIED/i,'O runtime recusou o acesso necessário.'],
  ['virtualization',/virtualization.*(?:unavailable|not enabled)|WSL_E_VIRTUALIZATION|HCS_E_HYPERV_NOT_INSTALLED/i,'A virtualização necessária não está disponível.']
 ];
 const found=categories.find(([,pattern])=>pattern.test(output)),exit=Number.isInteger(code)?String(code):signal?'sinal '+String(signal).replace(/[^A-Z0-9]/g,''):'desconhecido';
 const error=Error('O runtime local falhou (código '+exit+').'+(found?' '+found[2]:''));
 Object.defineProperty(error,'runtimeFailure',{value:{kind:found?.[0]||'unknown',exitCode:code,signal,stdout,stderr},enumerable:false});return error;
}
