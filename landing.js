'use strict';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];

/* Design wechseln (wird gemerkt) */
function setTheme(t) {
  t === 'paper' ? document.body.removeAttribute('data-theme') : (document.body.dataset.theme = t);
  $$('.tp,.tcard').forEach(b => b.classList.toggle('is-active', b.dataset.theme === t));
  try { localStorage.setItem('theme', t); } catch (e) {}
}
let t = 'paper'; try { t = localStorage.getItem('theme') || 'paper'; } catch (e) {}
setTheme(t);
$$('.tp,.tcard').forEach(b => b.addEventListener('click', () => { setTheme(b.dataset.theme); $('#theme-pop').hidden = true; }));
function closeMenu() { $('#menu').classList.remove('open'); $('#burger').setAttribute('aria-expanded', 'false'); }
function closePop() { $('#theme-pop').hidden = true; $('#theme-btn').setAttribute('aria-expanded', 'false'); }
$('#theme-btn').addEventListener('click', e => {
  const p = $('#theme-pop'); p.hidden = !p.hidden; e.currentTarget.setAttribute('aria-expanded', !p.hidden);
  if (!p.hidden) closeMenu();
});
document.addEventListener('click', e => { if (!e.target.closest('.theme-wrap')) closePop(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closePop(); closeMenu(); } });

/* Mobile-Menü */
$('#burger').addEventListener('click', e => {
  const open = $('#menu').classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', open);
  if (open) closePop();
});
document.addEventListener('click', e => { if (!e.target.closest('.nav')) closeMenu(); });
window.addEventListener('resize', () => { if (innerWidth > 1100) closeMenu(); });
$$('#menu a').forEach(a => a.addEventListener('click', () => $('#menu').classList.remove('open')));

/* Beispiel-QR (nur Deko) */
(function () {
  const N = 29; let s = 11, out = '';
  const r = () => (s = s * 16807 % 2147483647) / 2147483647;
  const isF = (x, y) => (x < 8 || x > N - 9) && y < 8 || x < 8 && y > N - 9;
  const fp = (x, y) => {
    const cx = x < 8 ? x : x - (N - 7), cy = y < 8 ? y : y - (N - 7), d = Math.max(Math.abs(cx - 3), Math.abs(cy - 3));
    return d === 3 || d <= 1;
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++)
    if (isF(x, y) ? fp(x, y) : r() > .52) out += `<rect x="${x}" y="${y}" width="1.03" height="1.03"/>`;
  $('#qr').innerHTML = `<g fill="#222">${out}</g>`;
})();

/* Einblenden beim Scrollen */
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .08 });
$$('.sec-head,.game,.tile,.mcard,.slf>*,.steps li,.tcard,.coffee-box').forEach(el => { el.classList.add('rv'); io.observe(el); });
$('#year').textContent = new Date().getFullYear();