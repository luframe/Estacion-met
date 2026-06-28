/* ================================================================
   app.js - Estacion Meteorologica + IA
   Firebase: estacion-metereologia-8f-f07e9
   IA: Claude (Anthropic) - llamada directa desde navegador
   ================================================================ */

// Configuracion
const AI_PROVIDER = 'claude';
const CLAUDE_KEY  = 'MI_API_KEY'; // <-- pega tu key de console.anthropic.com

// URLs de Firebase
const FB_ACTUAL    = 'https://estacion-metereologia-8f-f07e9-default-rtdb.firebaseio.com/.json';
const FB_HISTORIAL = 'https://estacion-metereologia-8f-f07e9-default-rtdb.firebaseio.com/Z-Historial.json';

// Estado global
let sensorData = { temperatura: null, presion: null, altitud: null, timestamp: null };
let histTemp   = [];
let histPres   = [];
let histAlt    = [];
let histFecha  = [];
let hist300    = [];
let fbInterval          = null;
let fbConnected         = false;
let conversationHistory = [];
let msgCounter          = 0;
let histCurrentType     = 'temp';

// FIREBASE
async function connectFirebase() {
  if (fbInterval) clearInterval(fbInterval);
  showFbStatus(false, 'Conectando...');
  await cargarHistorial();
  await fetchActual();
  fbInterval = setInterval(fetchActual, 600000);
}

async function cargarHistorial() {
  try {
    const res  = await fetch(FB_HISTORIAL);
    if (!res.ok) return;
    const data = await res.json();
    if (!data) return;

    const entradas = Object.values(data)
      .filter(function(e) {
        return (e.Temperatura !== undefined || e.temperatura !== undefined) &&
               (e.Presion     !== undefined || e.presion     !== undefined);
      })
      .slice(-300);

    hist300 = entradas.map(function(e) {
      return {
        fecha:       e['Fecha-hora'] || '',
        temperatura: parseFloat(e.Temperatura !== undefined ? e.Temperatura : e.temperatura),
        presion:     parseFloat(e.Presion     !== undefined ? e.Presion     : e.presion),
        altitud:     parseFloat(e.Altitud     !== undefined ? e.Altitud     : e.altitud)
      };
    });

    histTemp  = hist300.map(function(e) { return e.temperatura; });
    histPres  = hist300.map(function(e) { return e.presion; });
    histAlt   = hist300.map(function(e) { return e.altitud; });
    histFecha = hist300.map(function(e) { return e.fecha; });

    console.log('Historial cargado: ' + hist300.length + ' entradas');
    updateDashboard();
  } catch (err) {
    console.warn('Historial no disponible:', err.message);
  }
}

async function fetchActual() {
  try {
    const res  = await fetch(FB_ACTUAL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data || data.Temperatura === undefined) throw new Error('Nodo vacio');

    sensorData.temperatura = parseFloat(data.Temperatura);
    sensorData.presion     = parseFloat(data.Presion);
    sensorData.altitud     = parseFloat(data.Altitud);
    sensorData.timestamp   = new Date().toLocaleTimeString();

    var now   = new Date().toLocaleString('es-CO');
    var nueva = {
      fecha:       now,
      temperatura: sensorData.temperatura,
      presion:     sensorData.presion,
      altitud:     sensorData.altitud
    };

    if (hist300.length >= 300) hist300.shift();
    hist300.push(nueva);

    histTemp  = hist300.map(function(e) { return e.temperatura; });
    histPres  = hist300.map(function(e) { return e.presion; });
    histAlt   = hist300.map(function(e) { return e.altitud; });
    histFecha = hist300.map(function(e) { return e.fecha; });

    updateDashboard();
    showFbStatus(true, 'Conectado - ' + sensorData.timestamp);
  } catch (err) {
    showFbStatus(false, 'Error: ' + err.message);
  }
}

function showFbStatus(ok, msg) {
  fbConnected = ok;
  var badge = document.getElementById('fb-badge');
  var dot   = document.getElementById('fb-dot');
  badge.textContent = msg;
  badge.className   = 'badge' + (ok ? ' live' : '');
  dot.className     = 'status-dot' + (ok ? ' ok' : ' err');
}

// DASHBOARD
function updateDashboard() {
  var t   = sensorData.temperatura !== null ? sensorData.temperatura : (histTemp.length ? histTemp[histTemp.length-1] : null);
  var p   = sensorData.presion     !== null ? sensorData.presion     : (histPres.length ? histPres[histPres.length-1] : null);
  var alt = sensorData.altitud     !== null ? sensorData.altitud     : (histAlt.length  ? histAlt[histAlt.length-1]   : null);
  if (t === null || p === null) return;

  document.getElementById('val-t').textContent = t.toFixed(1);
  document.getElementById('arc-t').style.strokeDashoffset = Math.max(0, 188.5 - (t / 40) * 188.5);
  if (histTemp.length > 0) {
    document.getElementById('min-t').textContent = Math.min.apply(null, histTemp).toFixed(1) + 'deg';
    document.getElementById('max-t').textContent = Math.max.apply(null, histTemp).toFixed(1) + 'deg';
    document.getElementById('avg-t').textContent = (histTemp.reduce(function(a,b){return a+b;},0)/histTemp.length).toFixed(1) + 'deg';
  }

  document.getElementById('val-p').textContent = p.toFixed(1);
  document.getElementById('arc-p').style.strokeDashoffset = Math.max(0, 188.5 - ((p-700)/100)*188.5);
  if (histPres.length > 0) {
    document.getElementById('min-p').textContent = Math.min.apply(null, histPres).toFixed(1);
    document.getElementById('max-p').textContent = Math.max.apply(null, histPres).toFixed(1);
    document.getElementById('avg-p').textContent = (histPres.reduce(function(a,b){return a+b;},0)/histPres.length).toFixed(1);
  }

  if (alt !== null && !isNaN(alt)) {
    document.getElementById('val-alt').textContent = Math.round(alt);
    document.getElementById('alt-bar').style.width = Math.min(100, Math.max(0, ((alt-2400)/200)*100)) + '%';
    if (histAlt.length > 0) {
      document.getElementById('min-alt').textContent = Math.round(Math.min.apply(null, histAlt)) + ' m';
      document.getElementById('max-alt').textContent = Math.round(Math.max.apply(null, histAlt)) + ' m';
      document.getElementById('avg-alt').textContent = Math.round(histAlt.reduce(function(a,b){return a+b;},0)/histAlt.length) + ' m';
    }
    if (histAlt.length >= 3) {
      var delta   = histAlt[histAlt.length-1] - histAlt[histAlt.length-3];
      var trendEl = document.getElementById('alt-trend');
      if (Math.abs(delta) < 1) {
        trendEl.textContent = 'estable'; trendEl.className = 'alt-trend flat';
      } else if (delta > 0) {
        trendEl.textContent = 'subiendo ' + delta.toFixed(1) + ' m'; trendEl.className = 'alt-trend up';
      } else {
        trendEl.textContent = 'bajando ' + Math.abs(delta).toFixed(1) + ' m'; trendEl.className = 'alt-trend down';
      }
    }
    drawSparkline('spark-alt', histAlt, 'var(--accent-alt)');
  }

  drawSparkline('spark-t', histTemp, 'var(--accent-temp)');
  drawSparkline('spark-p', histPres, 'var(--accent-pres)');
}

function drawSparkline(id, data, color) {
  if (data.length < 2) return;
  var svg = document.getElementById(id);
  var W = 300, H = 60, pad = 6;
  var dataMin = Math.min.apply(null, data);
  var dataMax = Math.max.apply(null, data);
  var margin  = (dataMax - dataMin) * 0.1 || 0.5;
  var min     = dataMin - margin;
  var max     = dataMax + margin;
  var range   = (max - min) || 1;
  var pts = data.map(function(v, i) {
    return [(i / (data.length - 1)) * W, H - pad - ((v - min) / range) * (H - pad * 2)];
  });
  var line = pts.map(function(p, i) {
    return (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1);
  }).join(' ');
  var last = pts[pts.length - 1];
  var gid  = id + '-g';
  svg.innerHTML =
    '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="' + color + '" stop-opacity="0.25"/>' +
    '<stop offset="100%" stop-color="' + color + '" stop-opacity="0"/>' +
    '</linearGradient></defs>' +
    '<path d="' + line + ' L' + W + ' ' + H + ' L0 ' + H + ' Z" fill="url(#' + gid + ')"/>' +
    '<path d="' + line + '" fill="none" stroke="' + color + '" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>' +
    '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="3.5" fill="' + color + '"/>';
}

// HISTORIAL (subventanas)
var HIST_CONFIG = {
  temp:   { title: 'Historial de Temperatura',         unit: 'C',        color: 'var(--accent-temp)', key: 'temperatura' },
  presion:{ title: 'Historial de Presion Atmosferica', unit: 'hPa',      color: 'var(--accent-pres)', key: 'presion'     },
  alt:    { title: 'Historial de Altimetria',          unit: 'm s.n.m.', color: 'var(--accent-alt)',  key: 'altitud'     }
};

function openHist(type) {
  histCurrentType = type;
  document.getElementById('hist-title').textContent = HIST_CONFIG[type].title;
  document.getElementById('hist-overlay').classList.add('open');
  renderHistTable(type);
  setupExportBtn(type);
}

function renderHistTable(type) {
  var cfg     = HIST_CONFIG[type];
  var body    = document.getElementById('hist-body');
  var countEl = document.getElementById('hist-count');

  if (hist300.length === 0) {
    body.innerHTML = '<div class="hist-loading" style="font-style:normal">Sin datos. Verifica la conexion a Firebase.</div>';
    countEl.textContent = '';
    return;
  }

  var filas = hist300.slice().reverse();
  countEl.textContent = filas.length + ' registros';
  document.getElementById('hist-footer-info').textContent =
    filas.length + ' registros - Firebase Realtime DB - Actualizado ' + (sensorData.timestamp || '-');

  var vals   = filas.map(function(e) { return e[cfg.key]; }).filter(function(v) { return !isNaN(v); });
  var vMin   = Math.min.apply(null, vals);
  var vMax   = Math.max.apply(null, vals);
  var vRange = (vMax - vMin) || 1;

  var rows = filas.map(function(e, i) {
    var val = e[cfg.key];
    var pct = Math.round(((val - vMin) / vRange) * 100);
    return '<tr>' +
      '<td class="idx">' + (filas.length - i) + '</td>' +
      '<td class="fecha">' + (e.fecha || '-') + '</td>' +
      '<td class="num" style="color:' + cfg.color + '">' + (isNaN(val) ? '-' : val.toFixed(2)) + '</td>' +
      '<td style="width:120px;padding-right:20px">' +
        '<div style="background:var(--surface2);border-radius:3px;height:6px;overflow:hidden">' +
          '<div style="width:' + pct + '%;height:100%;background:' + cfg.color + ';border-radius:3px"></div>' +
        '</div></td>' +
      '<td style="font-size:11px;color:var(--muted)">' + cfg.unit + '</td>' +
      '</tr>';
  }).join('');

  body.innerHTML =
    '<table class="hist-table"><thead><tr>' +
    '<th style="width:40px">#</th><th>Fecha / Hora</th>' +
    '<th>' + cfg.title + '</th><th>Nivel</th><th>Unidad</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table>';
}

function setupExportBtn(type) {
  var cfg = HIST_CONFIG[type];
  document.getElementById('hist-export-btn').onclick = function() { exportCSV(type, cfg); };
}

function exportCSV(type, cfg) {
  var filas = hist300.slice().reverse();
  var lines = ['#,Fecha-Hora,' + cfg.title + ' (' + cfg.unit + ')'];
  filas.forEach(function(e, i) {
    lines.push((filas.length - i) + ',"' + e.fecha + '",' + (e[cfg.key] != null ? e[cfg.key].toFixed(2) : ''));
  });
  var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  var a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = 'estacion_' + type + '_' + Date.now() + '.csv';
  a.click();
}

function closeHist() { document.getElementById('hist-overlay').classList.remove('open'); }
function closeHistIfBg(e) { if (e.target === document.getElementById('hist-overlay')) closeHist(); }

// CHAT IA - CLAUDE (Anthropic)
function buildSystemPrompt() {
  var t   = sensorData.temperatura;
  var p   = sensorData.presion;
  var alt = sensorData.altitud !== null ? Math.round(sensorData.altitud) : null;

  var tArr   = histTemp.slice(-100);
  var pArr   = histPres.slice(-100);
  var altArr = histAlt.slice(-100);

  var tTrend   = tArr.length   > 1 ? (tArr[tArr.length-1]    - tArr[0]).toFixed(2)    : 'sin datos';
  var pTrend   = pArr.length   > 1 ? (pArr[pArr.length-1]    - pArr[0]).toFixed(2)    : 'sin datos';
  var altTrend = altArr.length > 1 ? (altArr[altArr.length-1] - altArr[0]).toFixed(1)  : 'sin datos';
  var ultimaFecha = histFecha.length > 0 ? histFecha[histFecha.length-1] : 'desconocida';

  var stats = '';
  if (hist300.length > 0) {
    stats =
      '\nRegistros en historial: ' + hist300.length +
      '\nTemp: min ' + Math.min.apply(null,histTemp).toFixed(1) + 'C, max ' + Math.max.apply(null,histTemp).toFixed(1) + 'C, prom ' + (histTemp.reduce(function(a,b){return a+b;},0)/histTemp.length).toFixed(1) + 'C' +
      '\nPres: min ' + Math.min.apply(null,histPres).toFixed(1) + ' hPa, max ' + Math.max.apply(null,histPres).toFixed(1) + ' hPa' +
      '\nAlt:  min ' + Math.round(Math.min.apply(null,histAlt)) + ' m, max ' + Math.round(Math.max.apply(null,histAlt)) + ' m';
  }

  return 'Eres un asistente meteorologico experto en una estacion IoT de alta montana.\n' +
    'Estacion a 2503 m s.n.m. en la Cordillera Colombiana. Presion normal a esta altitud: ~746 hPa.\n' +
    'Ultima lectura: ' + ultimaFecha + '\n\n' +
    'DATOS ACTUALES:\n' +
    'Temperatura: ' + (t !== null ? t + ' C' : 'sin datos') + '\n' +
    'Presion: '     + (p !== null ? p + ' hPa' : 'sin datos') + '\n' +
    'Altitud: '     + (alt !== null ? alt + ' m s.n.m.' : 'sin datos') + '\n\n' +
    'TENDENCIAS (ultimas 100 lecturas):\n' +
    'Temperatura: ' + tTrend + ' C\n' +
    'Presion: '     + pTrend + ' hPa\n' +
    'Altitud: '     + altTrend + ' m\n' +
    stats + '\n\n' +
    'Responde en espanol, maximo 4-5 oraciones concisas. Usa los datos reales de la estacion. A 2500m la presion normal es ~746 hPa, una caida rapida indica mal tiempo.';
}

async function sendMessage() {
  var input = document.getElementById('chat-input');
  var text  = input.value.trim();
  if (!text) return;

  input.value = '';
  input.style.height = 'auto';
  appendMsg('user', text);

  var loadId = 'load-' + (++msgCounter);
  appendMsg('ai', '...', loadId, true);

  var btn = document.getElementById('send-btn');
  btn.disabled = true;

  conversationHistory.push({ role: 'user', content: text });

  try {
    var resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         CLAUDE_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5',
        max_tokens: 400,
        system:     buildSystemPrompt(),
        messages:   conversationHistory
      })
    });

    if (!resp.ok) {
      var errData = await resp.json().catch(function() { return {}; });
      throw new Error((errData.error && errData.error.message) || 'HTTP ' + resp.status);
    }

    var data  = await resp.json();
    var reply = (data.content && data.content[0] && data.content[0].text)
      ? data.content[0].text.trim()
      : 'Sin respuesta.';

    conversationHistory.push({ role: 'assistant', content: reply });
    if (conversationHistory.length > 20) conversationHistory = conversationHistory.slice(-20);

    removeMsg(loadId);
    appendMsg('ai', reply);

  } catch (err) {
    removeMsg(loadId);
    appendMsg('ai', 'Error: ' + err.message);
    console.error('AI error:', err);
  }

  btn.disabled = false;
  input.focus();
}

function appendMsg(role, text, id, isTyping) {
  var msgs = document.getElementById('messages');
  var div  = document.createElement('div');
  div.className = 'msg ' + role;
  if (id) div.id = id;
  var avatar = '<div class="msg-avatar ' + role + '">' + (role === 'ai' ? 'x' : 'u') + '</div>';
  var bubble = '<div class="msg-bubble' + (isTyping ? ' typing' : '') + '">' +
    (role === 'ai' ? formatAIText(text) : escHtml(text)) + '</div>';
  div.innerHTML = role === 'user' ? bubble + avatar : avatar + bubble;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function formatAIText(text) {
  return text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
    .replace(/\n/g,'<br>');
}

function escHtml(t) { return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function removeMsg(id) { var el = document.getElementById(id); if (el) el.remove(); }
function askChip(text) { document.getElementById('chat-input').value = text; sendMessage(); }

(function autoStart() {
  showFbStatus(false, 'Conectando a Firebase...');
  connectFirebase();
})();