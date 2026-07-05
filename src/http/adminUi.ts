/**
 * Self-contained admin UI. Holds no secrets server-side: the page prompts for
 * an API key at runtime, keeps it in sessionStorage, and sends it as a bearer
 * token to /api/*. Deliberately minimal; impeccable can polish later.
 */
export function adminPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Artifacts Admin</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #fbfbfd; --panel: #fff; --border: #e6e6ea; --fg: #1a1a1f;
    --muted: #6b6b76; --accent: #4f46e5; --danger: #dc2626; --ok: #16a34a;
    --radius: 10px;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0e0e12; --panel:#17171d; --border:#2a2a33; --fg:#ececf2;
            --muted:#9a9aa6; --accent:#8b85f5; }
  }
  * { box-sizing: border-box; }
  body { margin:0; font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
         background:var(--bg); color:var(--fg); }
  header { display:flex; align-items:center; gap:12px; padding:16px 20px;
           border-bottom:1px solid var(--border); background:var(--panel); position:sticky; top:0; }
  header h1 { font-size:16px; margin:0; font-weight:600; }
  header .spacer { flex:1; }
  main { max-width:1000px; margin:0 auto; padding:20px; display:grid; gap:20px; }
  .card { background:var(--panel); border:1px solid var(--border); border-radius:var(--radius);
          padding:16px; }
  label { display:block; font-size:12px; color:var(--muted); margin:10px 0 4px; }
  input, textarea, select {
    width:100%; padding:9px 11px; border:1px solid var(--border); border-radius:8px;
    background:var(--bg); color:var(--fg); font:inherit; }
  textarea { min-height:160px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:13px; }
  .row { display:flex; gap:12px; flex-wrap:wrap; }
  .row > * { flex:1; min-width:140px; }
  button { cursor:pointer; border:1px solid var(--border); background:var(--panel); color:var(--fg);
           padding:8px 14px; border-radius:8px; font:inherit; font-weight:500; }
  button.primary { background:var(--accent); border-color:var(--accent); color:#fff; }
  button.link { border:none; background:none; color:var(--accent); padding:4px 6px; }
  button.danger { color:var(--danger); }
  table { width:100%; border-collapse:collapse; }
  th, td { text-align:left; padding:10px 8px; border-bottom:1px solid var(--border); vertical-align:top; }
  th { font-size:12px; color:var(--muted); font-weight:600; }
  .tag { font-size:11px; padding:2px 7px; border-radius:99px; border:1px solid var(--border); color:var(--muted); }
  .muted { color:var(--muted); font-size:12px; }
  .toast { position:fixed; bottom:20px; left:50%; transform:translateX(-50%);
           background:var(--fg); color:var(--bg); padding:10px 16px; border-radius:8px;
           opacity:0; transition:opacity .2s; pointer-events:none; }
  .toast.show { opacity:1; }
  a { color:var(--accent); }
  code { font-family:ui-monospace,Menlo,monospace; font-size:12px; }
</style>
</head>
<body>
<header>
  <h1>🗂️ Artifacts Admin</h1>
  <div class="spacer"></div>
  <span id="keyState" class="muted">no key</span>
  <button id="setKey">Set API key</button>
</header>
<main>
  <section class="card">
    <strong>Publish new artifact</strong>
    <label>Title</label>
    <input id="title" placeholder="My chart">
    <label>HTML</label>
    <textarea id="html" placeholder="<!doctype html><html>..."></textarea>
    <div class="row">
      <div><label>Visibility</label>
        <select id="visibility"><option value="unlisted">unlisted</option><option value="public">public</option></select></div>
      <div><label>CSP mode</label>
        <select id="csp"><option value="strict">strict</option><option value="relaxed">relaxed</option></select></div>
      <div><label>Sanitize (strip scripts)</label>
        <select id="sanitize"><option value="false">no</option><option value="true">yes</option></select></div>
    </div>
    <div style="margin-top:14px"><button class="primary" id="publish">Publish</button></div>
  </section>

  <section class="card">
    <div class="row" style="align-items:center">
      <strong style="flex:1">Your artifacts</strong>
      <button class="link" id="refresh">Refresh</button>
    </div>
    <table>
      <thead><tr><th>Title</th><th>Visibility</th><th>Updated</th><th></th></tr></thead>
      <tbody id="rows"><tr><td colspan="4" class="muted">Set an API key to load…</td></tr></tbody>
    </table>
  </section>
</main>
<div class="toast" id="toast"></div>

<script>
const $ = (s) => document.querySelector(s);
const KEY = "artifacts_admin_key";
let apiKey = sessionStorage.getItem(KEY) || "";

function toast(msg){ const t=$("#toast"); t.textContent=msg; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),1800); }
function reflectKey(){ $("#keyState").textContent = apiKey ? "key set ✓" : "no key"; }
$("#setKey").onclick = () => {
  const v = prompt("Enter API key (ak_...)", apiKey);
  if (v !== null) { apiKey = v.trim(); sessionStorage.setItem(KEY, apiKey); reflectKey(); load(); }
};

async function api(path, opts={}) {
  const res = await fetch("/api"+path, {
    ...opts,
    headers: { "content-type":"application/json", "authorization":"Bearer "+apiKey, ...(opts.headers||{}) },
  });
  if (res.status === 401) { toast("Unauthorized — check your API key"); throw new Error("401"); }
  return res;
}

function esc(s){ return (s||"").replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }

async function load(){
  if(!apiKey){ return; }
  try {
    const res = await api("/artifacts");
    const { items } = await res.json();
    const rows = $("#rows");
    if(!items.length){ rows.innerHTML = '<tr><td colspan="4" class="muted">No artifacts yet.</td></tr>'; return; }
    rows.innerHTML = items.map(a => \`
      <tr>
        <td><div>\${esc(a.title)||"<span class='muted'>untitled</span>"}</div>
            <div class="muted"><a href="\${a.share_url}" target="_blank" rel="noreferrer">\${a.share_url}</a></div></td>
        <td><span class="tag">\${a.visibility}</span> <span class="tag">\${a.csp_mode}</span></td>
        <td class="muted">\${new Date(a.updated_at).toLocaleString()}</td>
        <td style="white-space:nowrap">
          <button class="link" data-copy="\${a.share_url}">Copy link</button>
          <button class="link" data-rotate="\${a.id}">Rotate</button>
          <button class="link danger" data-del="\${a.id}">Delete</button>
        </td>
      </tr>\`).join("");
  } catch(e){ /* handled in api() */ }
}

document.addEventListener("click", async (e) => {
  const t = e.target;
  if(t.dataset.copy){ navigator.clipboard.writeText(t.dataset.copy); toast("Link copied"); }
  if(t.dataset.del){ if(confirm("Delete this artifact?")){ await api("/artifacts/"+t.dataset.del,{method:"DELETE"}); toast("Deleted"); load(); } }
  if(t.dataset.rotate){ const r=await api("/artifacts/"+t.dataset.rotate+"/share",{method:"POST",body:JSON.stringify({rotate:true})}); const j=await r.json(); toast("New link: "+j.share_url); load(); }
});

$("#refresh").onclick = load;
$("#publish").onclick = async () => {
  if(!apiKey){ toast("Set an API key first"); return; }
  const body = {
    html: $("#html").value,
    title: $("#title").value || undefined,
    visibility: $("#visibility").value,
    csp_mode: $("#csp").value,
    sanitize: $("#sanitize").value === "true",
  };
  if(!body.html){ toast("HTML is required"); return; }
  const res = await api("/artifacts", { method:"POST", body: JSON.stringify(body) });
  if(res.status === 201){ const a = await res.json(); toast("Published"); $("#html").value=""; $("#title").value=""; load(); }
  else { const j = await res.json().catch(()=>({})); toast("Error: "+(j.error||res.status)); }
};

reflectKey(); load();
</script>
</body>
</html>`;
}
