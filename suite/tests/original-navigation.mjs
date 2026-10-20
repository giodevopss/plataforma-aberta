// A successful original sign-in can still have a client router navigation in
// flight. Retry only Chromium's explicit superseded-navigation error. Content
// assertions remain the caller's responsibility; HTTP and timeout failures fail.
export async function navigateOriginalContent(page,url){
 for(let attempt=0;attempt<2;attempt++){
  try{return await page.goto(url,{waitUntil:'domcontentloaded'});}
  catch(error){if(attempt||!String(error.message).includes('net::ERR_ABORTED'))throw error;}
 }
}
