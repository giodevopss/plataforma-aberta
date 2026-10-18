const {app}=require('electron');app.whenReady().then(()=>{console.log('PROFILE_PROBE',app.getPath('userData'));app.quit();});
