// Apps Script Web API for Necromancer — place in script.google.com and deploy as Web App
// Before deploying, set these constants or replace them with PropertiesService
const SHEET_ID = '1fSnuYHXjsGE87NnesTTxfGV-xpJUbx6PyVRpLuRNsDs'; // provided sheet ID
const API_KEY = 'REPLACE_ME_CHANGE_THIS_TO_A_STRONG_SECRET';
const PARTNERS_SHEET = 'Partners';
const SPINLOG_SHEET = 'SpinLog';
const AMS_SHEET = 'AMs';

function _ok(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
function _err(msg) {
  return ContentService.createTextOutput(JSON.stringify({ error: msg })).setMimeType(ContentService.MimeType.JSON);
}

function _checkApiKey(e) {
  // Accept apiKey as query param for GET, or in POST body for POST
  const key = (e.parameter && e.parameter.apiKey) || (e.postData && e.postData.contents && (function(){try{return JSON.parse(e.postData.contents).apiKey}catch(e){return null}})());
  if (key !== API_KEY) throw new Error('invalid_api_key');
}

function _sheetToObjects(sheet) {
  const values = sheet.getDataRange().getValues();
  if (!values || values.length === 0) return [];
  const headers = values[0].map(h => String(h).trim());
  const rows = values.slice(1);
  return rows.filter(r => r.length && r[0] !== '').map(r => {
    const o = {};
    headers.forEach((h, i) => o[h] = r[i]);
    return o;
  });
}

function doGet(e) {
  try {
    _checkApiKey(e);
    const action = (e.parameter.action || '').toLowerCase();
    const ss = SpreadsheetApp.openById(SHEET_ID);

    if (action === 'lookup') {
      const said = (e.parameter.said || '').toString().trim();
      if (!said) return _err('missing_said');
      const sh = ss.getSheetByName(PARTNERS_SHEET);
      const objs = _sheetToObjects(sh);
      const found = objs.find(r => String(r.SAID) === said || String(r.said) === said);
      if (!found) return _err('not_found');
      return _ok({ partner: found });
    }

    if (action === 'list_partners') {
      const sh = ss.getSheetByName(PARTNERS_SHEET);
      const objs = _sheetToObjects(sh);
      return _ok({ partners: objs });
    }

    if (action === 'get_ams') {
      const sh = ss.getSheetByName(AMS_SHEET);
      const objs = _sheetToObjects(sh);
      return _ok({ ams: objs });
    }

    if (action === 'get_spinlog' || action === 'list_spins') {
      const sh = ss.getSheetByName(SPINLOG_SHEET);
      const objs = _sheetToObjects(sh);
      return _ok({ spinLog: objs });
    }

    return _err('unknown_action');
  } catch (err) {
    return _err(err.message || String(err));
  }
}

function doPost(e) {
  try {
    _checkApiKey(e);
    const payload = e.postData && JSON.parse(e.postData.contents || '{}');
    const action = (payload.action || '').toLowerCase();
    const ss = SpreadsheetApp.openById(SHEET_ID);

    if (action === 'spin') {
      // payload: { said, prizeLabel, prizeIndex, method }
      const said = String(payload.said || '').trim();
      if (!said) return _err('missing_said');
      const partners = ss.getSheetByName(PARTNERS_SHEET);
      const rows = partners.getDataRange().getValues();
      const headers = rows[0].map(h => String(h).trim());
      const saidIndex = headers.findIndex(h => h.toLowerCase() === 'said' || h.toLowerCase() === 'store_address_id');
      if (saidIndex < 0) return _err('said_column_missing');
      let rowIndex = -1;
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][saidIndex]) === said) { rowIndex = i + 1; break; }
      }
      if (rowIndex === -1) return _err('said_not_found');

      // Append spin log: [timestamp, said, prizeLabel, prizeIndex, method]
      const spinLog = ss.getSheetByName(SPINLOG_SHEET);
      spinLog.appendRow([new Date(), said, payload.prizeLabel || '', payload.prizeIndex || '', payload.method || 'web']);

      // Optionally mark spinUsed column if present
      const spinUsedCol = headers.findIndex(h => h.toLowerCase() === 'spinused' || h.toLowerCase() === 'spin_used');
      if (spinUsedCol >= 0) {
        partners.getRange(rowIndex, spinUsedCol + 1).setValue(true);
      }
      return _ok({ success: true });
    }

    if (action === 'increment_orders') {
      // payload: { said, by }
      const said = String(payload.said || '').trim();
      const by = Number(payload.by || 1);
      if (!said) return _err('missing_said');
      const partners = ss.getSheetByName(PARTNERS_SHEET);
      const rows = partners.getDataRange().getValues();
      const headers = rows[0].map(h => String(h).trim());
      const saidIndex = headers.findIndex(h => h.toLowerCase() === 'said' || h.toLowerCase() === 'store_address_id');
      const ordersIndex = headers.findIndex(h => h.toLowerCase() === 'orders_delivered' || h.toLowerCase() === 'orders' || h.toLowerCase() === 'ordersdelivered');
      if (saidIndex < 0 || ordersIndex < 0) return _err('required_columns_missing');
      let rowIndex = -1;
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][saidIndex]) === said) { rowIndex = i + 1; break; }
      }
      if (rowIndex === -1) return _err('said_not_found');
      const current = Number(rows[rowIndex - 1][ordersIndex]) || 0;
      partners.getRange(rowIndex, ordersIndex + 1).setValue(current + by);
      return _ok({ success: true, orders: current + by });
    }

    return _err('unknown_action');
  } catch (err) {
    return _err(err.message || String(err));
  }
}

/*
Deployment notes:
- Replace API_KEY constant with a strong secret before deploying.
- Deploy > New deployment > Web app
  - Execute as: Me
  - Who has access: Anyone (or appropriate domain)
- Use APPS_SCRIPT_BASE_URL and APPS_SCRIPT_API_KEY env vars in Vercel to call this web app.
*/