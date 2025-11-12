const guessPort = () => {
  try {
    const host = window.location.hostname || "127.0.0.1";
    const port = window.location.port || "5173";
    return { host, port };
  } catch { return { host: "127.0.0.1", port: "5173" }; }
};
const { host, port } = guessPort();
// API immer auf Backend-Port 30521 routen – Host vom Browser übernehmen
export const API = `http://${host}:30521`;

async function jfetch(url, opts){
  try{
    const r = await fetch(url, opts);
    const ct = r.headers.get("content-type")||"";
    if(ct.includes("application/json")) return await r.json();
    return await r.text();
  }catch(e){
    return { ok:false, error: String(e) };
  }
}

export async function getStatus(){ return jfetch(`${API}/api/system/status`); }
export async function getLicense(){ return jfetch(`${API}/api/license`); }
export async function setLicense(tier){ return jfetch(`${API}/api/license/set?tier=${encodeURIComponent(tier)}`, {method:"POST"}); }

export async function mailCheck(){ return jfetch(`${API}/api/mail/check`); }
export async function mailSendTest(to){ 
  return jfetch(`${API}/api/mail/send_test`, {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({to})}); 
}

export async function getKpis(){ return jfetch(`${API}/api/reports/kpis`); }
export async function exportCsv(){ window.location.href = `${API}/api/reports/export.csv`; }
export async function exportPdf(){ window.location.href = `${API}/api/reports/export.pdf`; }

export async function createOffer(d){ return jfetch(`${API}/api/offers/draft`, {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(d)}); }
