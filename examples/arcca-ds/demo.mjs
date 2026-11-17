import './arcca-ds.mjs';
await Promise.all(['arcca-button', 'arcca-dropdown', 'arcca-checkbox', 'arcca-text-field', 'arcca-switch', 'arcca-progress'].map(tag => customElements.whenDefined(tag)));
const $ = id => document.getElementById(id);
const colors = ['primary', 'neutral', 'success', 'info', 'warning', 'danger'];
$('color').props = { label: 'Cor dos componentes', value: 'primary', items: colors.map(value => ({ value, text: value })), outlined: true };
let clicks = 0;
$('action').addEventListener('press', () => {
  clicks++;
  $('clicks').textContent = `${clicks} ${clicks === 1 ? 'clique no componente Arcca.' : 'cliques no componente Arcca.'}`;
  $('progress').value = Math.min(clicks, 5);
});
$('color').addEventListener('change', event => {
  const color = event.detail.value;
  for (const id of ['action', 'progress', 'notify', 'loading']) $(id).color = color;
});
$('loading').addEventListener('change', event => { $('action').loading = event.detail.value; });
$('name').addEventListener('change', event => {
  $('greeting').textContent = event.detail.value ? `Boa, ${event.detail.value}! Bora criar.` : 'Seu próximo protótipo começa aqui.';
});
$('reset').addEventListener('press', () => {
  clicks = 0; $('progress').value = 0; $('loading').value = false; $('action').loading = false;
  $('clicks').textContent = 'Nenhum clique ainda.';
});
document.documentElement.dataset.ready = 'true';
