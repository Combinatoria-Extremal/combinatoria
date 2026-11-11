(() => {
  if (location.hostname !== 'extremal.combinatoria.org' || navigator.doNotTrack === '1' || window.doNotTrack === '1') {
    return;
  }

  const measurementId = 'G-PW9N2THPXE';
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', measurementId);

  const tag = document.createElement('script');
  tag.async = true;
  tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + measurementId;
  document.head.appendChild(tag);
})();
