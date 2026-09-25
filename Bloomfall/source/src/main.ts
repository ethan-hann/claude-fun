import { runViewer } from './viewer';

const params = new URLSearchParams(location.search);
if (params.has('view')) {
  runViewer(params).catch((e) => { console.error(e); document.body.textContent = String(e?.stack || e); });
} else {
  runViewer(new URLSearchParams('view=test')).catch((e) => { console.error(e); document.body.textContent = String(e?.stack || e); });
}
