const BASE = '/api';

async function http(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers||{}) },
    ...opts
  });
  if (!res.ok) {
    let msg = res.status + ' ' + res.statusText;
    try { const j = await res.json(); msg = j?.detail || msg } catch {}
    throw new Error(msg);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res.blob();
}

export const api = {
  system: {
    status: () => http('/system/status')
  },
  mail: {
    check: () => http('/mail/check'),
    sendTest: (to) => http('/mail/send_test', { method:'POST', body: JSON.stringify({ to }) }),
  },
  offers: {
    draft: (payload={}) => http('/offers/draft', { method:'POST', body: JSON.stringify(payload) }),
    pdf: async (offerId) => {
      const blob = await http(`/offers/${offerId}/pdf`);
      const url = URL.createObjectURL(blob);
      return url;
    }
  },
  leads: {
    list: () => http('/leads'),
    importCsv: (file) => upload('/leads/import/csv', file),
    importXlsx: (file) => upload('/leads/import/xlsx', file),
  },
  followups: {
    due: () => http('/followups/due'),
    toggle: (id) => http(`/followups/${id}/toggle`, { method:'POST' }),
  },
  reports: {
    kpis: () => http('/reports/kpis'),
  },
  license: {
    get: () => http('/license'),
    set: (tier) => http(`/license/set?tier=${tier}`, { method:'POST' }),
  },
  profile: {
    list: () => http('/profile/'),
    set: (key,value) => http('/profile/set',{method:'POST', body: JSON.stringify({key,value})})
  },
  insights: {
    fetch: () => http('/insights/suggestions'),
    consume: (id) => http(`/insights/suggestions/${id}/consume`, {method:'POST'}),
    log: (payload) => http('/insights/log', {method:'POST', body: JSON.stringify(payload)})
  },
  character: {
    state: (user_id) => http(`/character/state?user_id=${user_id}`),
    profile: (user_id) => http(`/character/profile?user_id=${user_id}`),
    setProfile: (payload) => http('/character/profile', {method:'PUT', body: JSON.stringify(payload)}),
    event: (payload) => http('/character/event', {method:'POST', body: JSON.stringify(payload)}),
    reset: (payload) => http('/character/reset', {method:'POST', body: JSON.stringify(payload)})
  },
  decision: {
    think: (user_id, max_actions = 5) => http('/decision/think', {method:'POST', body: JSON.stringify({user_id, max_actions})}),
    execute: (user_id, actions, dry_run = false) => http('/decision/execute', {method:'POST', body: JSON.stringify({user_id, actions, dry_run})}),
    run: (user_id, max_actions = 5, auto_execute = false, dry_run = false) => http(`/decision/run?user_id=${user_id}&max_actions=${max_actions}&auto_execute=${auto_execute}&dry_run=${dry_run}`, {method:'POST'}),
    history: (user_id, limit = 10) => http(`/decision/history?user_id=${user_id}&limit=${limit}`)
  },
  automation: {
    queue: (user_id, status = null) => http(`/automation/queue?user_id=${user_id}${status ? `&status=${status}` : ''}`),
    approve: (ids, approve = true) => http('/automation/approve', {method:'POST', body: JSON.stringify({ids, approve})}),
    run: (user_id) => http(`/automation/run?user_id=${user_id}`, {method:'POST'}),
    auto: (user_id) => http(`/automation/auto?user_id=${user_id}`, {method:'POST'})
  },
  kb: {
    list: () => http('/kb/items'),
    create: (payload) => http('/kb/items', {method:'POST', body: JSON.stringify(payload)}),
    search: (q) => http(`/kb/search?q=${encodeURIComponent(q)}`)
  },
  intent: {
    parse: (user_id, text) => http('/intent/parse', {method:'POST', body: JSON.stringify({user_id, text})}),
    act: (user_id, text) => http('/intent/act', {method:'POST', body: JSON.stringify({user_id, text})})
  },
  voice: {
    command: (user_id, text) => http('/voice/command', {method:'POST', body: JSON.stringify({user_id, text})}),
    deepstt: (file) => upload('/voice/deepstt', file),
    contextUpdate: (data) => {
      // Verwende JSON-Endpoint für bessere Kompatibilität
      return http('/voice/context/update_json', {
        method: 'POST',
        body: JSON.stringify({
          user: data.user || 'denis',
          message: data.message || '',
          mood: data.mood || 'neutral'
        })
      });
    },
    contextList: () => http('/voice/context')
  },
  leadHunter: {
    hunt: (payload) => http('/lead_hunter/hunt', {method:'POST', body: JSON.stringify(payload)}),
    outreach: (leads, attachFlyer=true) => http('/lead_hunter/outreach', {method:'POST', body: JSON.stringify({leads, attach_flyer: attachFlyer})}),
    exportExcel: (leads) => http('/lead_hunter/export_excel', {method:'POST', body: JSON.stringify({leads})})
  },
  sequences: {
    list: () => http('/sequences'),
    create: (payload) => http('/sequences', {method:'POST', body: JSON.stringify(payload)}),
    run: (payload) => http('/sequences/run', {method:'POST', body: JSON.stringify(payload)})
  },
  calendar: {
    list: () => http('/calendar/list'),
    create: (payload) => http('/calendar/create', {method:'POST', body: JSON.stringify(payload)})
  },
  audit: {
    list: (params={}) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k,v]) => {
        if (v !== undefined && v !== null && v !== '') qs.append(k, v);
      });
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return http(`/audit/list${suffix}`);
    },
    exportCSV: (params={}) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k,v]) => {
        if (v !== undefined && v !== null && v !== '') qs.append(k, v);
      });
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return fetch(BASE + `/audit/export.csv${suffix}`).then(r => r.blob());
    },
    exportPDF: (params={}) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k,v]) => {
        if (v !== undefined && v !== null && v !== '') qs.append(k, v);
      });
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return fetch(BASE + `/audit/export.pdf${suffix}`).then(r => r.blob());
    },
    purge: (days=90) => http('/audit/purge', {method:'POST', body: JSON.stringify({days})}),
    deleteUser: (user_id) => http('/audit/delete_user', {method:'POST', body: JSON.stringify({user_id})}),
  }
};

async function upload(path, file){
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(BASE + path, { method:'POST', body: form });
  if(!res.ok) throw new Error(res.status + ' ' + res.statusText);
  return res.json();
}


