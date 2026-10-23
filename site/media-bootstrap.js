document.querySelector('.nav-links a[href="#citation"]')?.addEventListener('click', event => {
  event.preventDefault();
  history.replaceState(null, '', '#citation');
  document.querySelector('#citation').scrollIntoView({behavior: 'instant', block: 'start'});
});
(async () => {
  if ('serviceWorker' in navigator && window.isSecureContext) {
    try {
      await Promise.race([
        (async () => {
          await navigator.serviceWorker.register('./media-range-sw.js', {updateViaCache:'none'});
          if (!navigator.serviceWorker.controller) await new Promise(resolve => {
            navigator.serviceWorker.addEventListener('controllerchange', resolve, {once:true});
            if (navigator.serviceWorker.controller) resolve();
          });
        })(),
        new Promise(resolve => setTimeout(resolve, 4000))
      ]);
    } catch (error) { console.warn('Media range compatibility unavailable:', error.message); }
  }
  for (const src of ['./app.js?v=viewport-loading-20261023','./abstract-highlight.js?v=viewport-loading-20261023','./deployment.js?v=viewport-loading-20261023','./gap-study.js?v=loading-v6','./research.js?v=viewport-loading-20261023']) {
    await new Promise((resolve,reject) => {
      const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=reject;document.body.append(script);
    });
  }
})();
