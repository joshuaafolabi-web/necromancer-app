/**
 * Code.gs — Sheet helpers used by Sync.gs.
 *
 * THIS SCRIPT IS NEVER DEPLOYED AS A WEB APP. There is no doGet, no doPost,
 * and no /exec URL anywhere in this project. It is a bound script that
 * Sync.gs calls into for the Sheet-reading/writing plumbing, plus a
 * preflight() to validate the data before go-live.
 *
 * (An earlier version of this file WAS a deployable web app — doGet/doPost,
 * its own copy of the ladder and spin-odds tables, arcadeLookup/arcadeSpin.
 * That's gone. All scoring now lives in necromancer-app/lib/gameRules.ts,
 * the only place it's computed, and this file has no inbound surface for a
 * Workspace admin to ever need to approve.)
 *
 * INSTALL
 *   1. Open the Sheet > Extensions > Apps Script.
 *   2. Paste this file in as Code.gs, and Sync.gs alongside it as a second
 *      file. Delete any HTML file left over from an earlier version
 *      (e.g. "Arcade") — nothing here serves HTML.
 *   3. Follow the install steps at the top of Sync.gs.
 *   4. Do NOT create a deployment of any kind for this project.
 *
 * SHEET SCHEMA. Tab names are case-sensitive; headers are not, and column
 * ORDER does not matter — every read and write maps by header name.
 *
 *   Partners: store_id | store_name | said | am_email | partner_category |
 *             tier | orders_delivered | total_order_value |
 *             campaign_start_date | patner_email | challenge_accepted_at |
 *             ladderStepReached | milestonesNotified
 *   AMs:      am_email | am_name | EP | reactivations | rank
 *   SpinLog:  timestamp | SAID | wheel_tier | prizeLabel | prizeIndex |
 *             method | notes
 *
 * Required: Partners needs said, store_name, am_email, orders_delivered and
 * challenge_accepted_at. SpinLog needs SAID, wheel_tier and prizeLabel.
 * `tier` was renamed from `segment` — same "Tier 1-4" matching, same column
 * NECROCLASH scores EP from. `partner_category` (e.g. Zombie, Unhealthy) is
 * Ops/AM bookkeeping only — nothing in Sync.gs or the Arcade reads it.
 * Columns read but never written: total_order_value, campaign_start_date.
 * ladderStepReached and milestonesNotified are WRITTEN by pushPartners() in
 * Sync.gs — don't hand-edit either, both get overwritten on every push.
 * `patner_email` (yes, spelled that way on the live Sheet — not a typo in
 * this code, a typo in the header itself) is the partner's own inbox, used
 * only to email them when they cross a milestone; am_email is the Account
 * Manager's and never leaves Workspace. Both are optional — pushPartners()
 * skips the email step quietly if patner_email isn't on the Sheet yet.
 */

// ---------------------------------------------------------------------------
// Value normalization.
//
// Google Sheets stores a SAID like "012345" as the NUMBER 12345 and silently
// drops the leading zero. Without normalizeSaid_, every partner whose SAID
// starts with 0 fails to match, and nobody can work out why.
// ---------------------------------------------------------------------------
function normalizeSaid_(v) {
  var digits = String(v == null ? '' : v).replace(/\D/g, '');
  if (!digits) return '';
  while (digits.length < 6) digits = '0' + digits;
  return digits;
}

function normalizeHeader_(h) {
  return String(h == null ? '' : h).trim().toLowerCase().replace(/\s+/g, '_');
}

function isValidSaid_(said) {
  return /^\d{6}$/.test(said);
}

/**
 * The live Sheet's SAID column is actually named "store_address_id" (SAID
 * = Store Address ID) — every screenshot confirmed this, and none ever
 * showed a column literally named "said". Checking "said" first keeps this
 * working if a Sheet ever uses that shorter name instead, but on the real
 * Sheet it's store_address_id that actually gets found. Every said-column
 * lookup in this project MUST go through this function, not a bare
 * headers.indexOf('said') — that silently threw "Partners tab needs at
 * least 'said'..." against the real Sheet.
 */
function saidColumnIndex_(headers) {
  var i = headers.indexOf('said');
  return i >= 0 ? i : headers.indexOf('store_address_id');
}

/**
 * Extracts the tier from a segment label, ignoring decoration. The live
 * sheet writes them as "Tier 4 🌑", "Tier 3 🔴" — an exact-string match
 * rejected all of those, and NECROCLASH would have scored them 0 EP.
 * Returns 'tier 1'..'tier 4', or '' if there is no tier in the string.
 */
function tierOf_(v) {
  var m = String(v == null ? '' : v).match(/tier\s*([1-4])/i);
  return m ? 'tier ' + m[1] : '';
}

// ---------------------------------------------------------------------------
// Sheet access
// ---------------------------------------------------------------------------
function getSheet_(name) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sheet) {
    throw new Error('Sheet tab "' + name + '" not found. Tab names are case-sensitive.');
  }
  return sheet;
}

/** Reads a tab into {headers, rows} with headers normalized. */
function readTab_(name) {
  var data = getSheet_(name).getDataRange().getValues();
  if (!data.length) return { headers: [], rows: [] };
  return { headers: data[0].map(normalizeHeader_), rows: data.slice(1) };
}

function findPartnerRow_(said) {
  var tab = readTab_('Partners');
  var saidCol = saidColumnIndex_(tab.headers);
  if (saidCol < 0) throw new Error('Partners tab has no "said" or "store_address_id" column.');

  for (var i = 0; i < tab.rows.length; i++) {
    if (normalizeSaid_(tab.rows[i][saidCol]) === said) {
      var obj = {};
      tab.headers.forEach(function (h, j) { obj[h] = tab.rows[i][j]; });
      return { rowIndex: i + 2, headers: tab.headers, obj: obj }; // +2: 1-based, past header
    }
  }
  return null;
}

/** Writes into a Partners column, returning false if that column is absent. */
function setPartnerCell_(rowIndex, headers, colName, value) {
  var col = headers.indexOf(colName);
  if (col < 0) return false;
  getSheet_('Partners').getRange(rowIndex, col + 1).setValue(value);
  return true;
}

/**
 * Locates SpinLog's columns by header name. The live sheet orders them
 * timestamp | SAID | prizeLabel | prizeIndex | method | notes — a different
 * order and different names from an earlier draft, so nothing here may
 * assume a fixed column index. `prize` and `prizeLabel` are both accepted.
 */
function spinLogCols_() {
  var tab = readTab_('SpinLog');
  var prizeCol = tab.headers.indexOf('prizelabel');
  if (prizeCol < 0) prizeCol = tab.headers.indexOf('prize');

  var cols = {
    headers: tab.headers,
    rows: tab.rows,
    said: tab.headers.indexOf('said'),
    tier: tab.headers.indexOf('wheel_tier'),
    prize: prizeCol,
  };

  if (cols.said < 0) throw new Error('SpinLog tab has no "SAID" column.');
  if (cols.prize < 0) throw new Error('SpinLog tab has no "prizeLabel" column.');
  if (cols.tier < 0) {
    throw new Error('SpinLog tab has no "wheel_tier" column. Add one — it records which ' +
                    'wheel each spin belonged to, and cannot be reconstructed afterwards.');
  }
  return cols;
}

/**
 * Appends a row positioned by the sheet's own header order, so adding or
 * reordering SpinLog columns can't shift prizes into the wrong field.
 * Unknown headers are left blank rather than shifting everything.
 */
function appendByHeaders_(sheetName, headers, valueMap) {
  var row = headers.map(function (h) {
    return Object.prototype.hasOwnProperty.call(valueMap, h) ? valueMap[h] : '';
  });
  getSheet_(sheetName).appendRow(row);
}

// ---------------------------------------------------------------------------
// Account Manager notification, sent from this side so am_email never has to
// leave Workspace. Called by Sync.gs's pullEvents() when a new acceptance
// comes through.
// ---------------------------------------------------------------------------
function notifyAccountManager_(partnerObj, orders) {
  var amEmail = String(partnerObj.am_email || '').trim();
  if (!amEmail) return { sent: false, reason: 'no am_email on this partner' };

  var storeName = String(partnerObj.store_name || 'A partner store');
  var subject = '[Project Lazarus] ' + storeName + ' accepted the 30-day challenge';
  var body =
    storeName + ' has just accepted the 30-day Reactivation Challenge.\n\n' +
    'SAID:              ' + normalizeSaid_(partnerObj.said) + '\n' +
    'Segment:           ' + (partnerObj.segment || '—') + '\n' +
    'Orders delivered:  ' + orders + '\n\n' +
    'They have 30 days to climb the Ads Credit ladder. Reach out and help them get ' +
    'their first orders in — the first five unlock both ₦5,000 of Ads Credit and ' +
    'their first spin.\n\n' +
    'Their progress is on your NECROCLASH dashboard.';

  try {
    MailApp.sendEmail(amEmail, subject, body);
    return { sent: true, to: amEmail };
  } catch (err) {
    // Never let a mail failure lose the acceptance — it is already recorded
    // by the time this runs.
    return { sent: false, reason: String(err && err.message ? err.message : err) };
  }
}

// ---------------------------------------------------------------------------
// preflight() — run before go-live. Validates the Sheet the way Sync.gs
// reads it, prints the row number of anything wrong, and warns if this
// project has accidentally grown an inbound surface.
// ---------------------------------------------------------------------------
function preflight() {
  var problems = [];
  var notes = [];

  var required = {
    Partners: ['store_name', 'said', 'am_email', 'orders_delivered', 'challenge_accepted_at'],
    AMs: ['am_name', 'am_email'],
    SpinLog: ['said', 'wheel_tier', 'timestamp'],
  };

  var tabs = {};
  Object.keys(required).forEach(function (name) {
    try {
      var tab = readTab_(name);
      tabs[name] = tab;
      required[name].forEach(function (h) {
        // 'said' accepts the store_address_id alias too — see
        // saidColumnIndex_'s comment for why the real Sheet needs this.
        var found = h === 'said' ? saidColumnIndex_(tab.headers) >= 0 : tab.headers.indexOf(h) >= 0;
        if (!found) {
          problems.push(name + ': missing required header "' + h + '" (found: ' + tab.headers.join(', ') + ')');
        }
      });
    } catch (err) {
      problems.push(String(err.message));
    }
  });

  if (tabs.SpinLog &&
      tabs.SpinLog.headers.indexOf('prizelabel') < 0 &&
      tabs.SpinLog.headers.indexOf('prize') < 0) {
    problems.push('SpinLog: needs a "prizeLabel" (or "prize") column');
  }

  if (tabs.Partners) {
    var t = tabs.Partners;
    var saidCol = saidColumnIndex_(t.headers);
    var amCol = t.headers.indexOf('am_email');
    var ordCol = t.headers.indexOf('orders_delivered');
    var segCol = t.headers.indexOf('tier');
    // Must match PARTNER_EMAIL_HEADER_ in Sync.gs exactly — that's the one
    // place the actual (typo'd) header name lives; duplicated here as a
    // literal only for the coverage note below, not as the source of truth.
    var patnerEmailCol = t.headers.indexOf('patner_email');
    var patnerEmailCount = 0;
    var seen = {}, count = 0;

    var amEmails = {};
    if (tabs.AMs) {
      var amEmailCol = tabs.AMs.headers.indexOf('am_email');
      tabs.AMs.rows.forEach(function (r) {
        if (amEmailCol >= 0 && r[amEmailCol]) amEmails[String(r[amEmailCol]).trim().toLowerCase()] = true;
      });
    }

    t.rows.forEach(function (row, i) {
      var rowNo = i + 2;
      if (saidCol < 0 || String(row[saidCol]).trim() === '') return;
      count++;

      var said = normalizeSaid_(row[saidCol]);
      if (!isValidSaid_(said)) {
        problems.push('Partners row ' + rowNo + ': said "' + row[saidCol] + '" is not 6 digits');
      } else {
        if (seen[said]) problems.push('Partners row ' + rowNo + ': duplicate said ' + said);
        seen[said] = true;
        if (String(row[saidCol]) !== said) {
          notes.push('Partners row ' + rowNo + ': said stored as ' + row[saidCol] + ', read as ' + said +
                     ' (leading zero restored — format the column as Plain text to avoid this)');
        }
      }

      if (segCol >= 0 && !tierOf_(row[segCol])) {
        problems.push('Partners row ' + rowNo + ': tier "' + row[segCol] +
                      '" contains no "Tier 1-4" (NECROCLASH scores 0 EP otherwise). ' +
                      'Emoji and extra wording are fine — "Tier 2 🐋" works.');
      }
      if (amCol >= 0 && !amEmails[String(row[amCol]).trim().toLowerCase()]) {
        problems.push('Partners row ' + rowNo + ': am_email "' + row[amCol] +
                      '" is not in the AMs tab — this partner has nobody to notify');
      }
      if (ordCol >= 0 && isNaN(Number(row[ordCol]))) {
        problems.push('Partners row ' + rowNo + ': orders_delivered "' + row[ordCol] + '" is not a number');
      }
      if (patnerEmailCol >= 0 && String(row[patnerEmailCol] || '').trim()) patnerEmailCount++;
    });
    notes.push(count + ' partners, ' + (tabs.AMs ? tabs.AMs.rows.length : 0) + ' AMs loaded');

    if (patnerEmailCol < 0) {
      notes.push('No "patner_email" column — milestone-unlock emails to partners are disabled ' +
                 'until it\'s added (see Sync.gs\'s notifyMilestones_). am_email notifications to ' +
                 'Account Managers are unaffected.');
    } else if (patnerEmailCount < count) {
      notes.push((count - patnerEmailCount) + ' of ' + count + ' partners have no patner_email — ' +
                 'those rows won\'t get milestone-unlock emails, everything else still works.');
    }
  }

  ['NETLIFY_BASE_URL', 'SYNC_API_KEY'].forEach(function (p) {
    if (!PropertiesService.getScriptProperties().getProperty(p)) {
      problems.push('Script property ' + p + ' is not set (see Sync.gs install steps)');
    }
  });

  var deployWarning = [];
  try {
    if (typeof doGet === 'function' || typeof doPost === 'function') {
      deployWarning.push('WARNING: a doGet/doPost exists in this project. Nothing here should ' +
                         'ever be published as a web app — remove it and delete any deployment ' +
                         'under Deploy > Manage deployments.');
    }
  } catch (e) { /* not defined, which is correct */ }

  var report = problems.length
    ? 'FAILED (' + problems.length + ')\n' + problems.join('\n')
    : 'ALL CHECKS PASSED';
  if (deployWarning.length) report += '\n\n' + deployWarning.join('\n');
  if (notes.length) report += '\n\nNotes:\n' + notes.join('\n');

  Logger.log(report);
  return report;
}
