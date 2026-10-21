// A successful original sign-in can still have a client router navigation in
// flight. Retry only Chromium's explicit superseded-navigation error. Content
// assertions remain the caller's responsibility; HTTP and timeout failures fail.
export async function navigateOriginalContent(page,url,{waitUntil='domcontentloaded'}={}){
 for(let attempt=0;attempt<2;attempt++){
  try{return await page.goto(url,{waitUntil});}
  catch(error){if(attempt||!String(error.message).includes('net::ERR_ABORTED'))throw error;}
 }
}

// Baserow's original table router appends its selected numeric view ID.
// Match that canonical table route without accepting a different table ID.
export function originalTablePathMatches(actual,destination){
 return actual===destination||actual===destination+'/'||actual.startsWith(destination+'/')&&/^[1-9]\d*\/?$/.test(actual.slice(destination.length+1));
}
