/**
 * Sync.gs — pushes the Sheet out to Netlify and pulls partner activity back.
 *
 * THIS SCRIPT IS NEVER DEPLOYED AS A WEB APP.
 *
 * It has no doGet, no doPost, no /exec URL, and no inbound surface of any
 * kind. It is a script bound to your Sheet that runs on a timer and makes
 * OUTBOUND https calls — the same category of thing as a script that emails
 * a weekly report. There is nothing here for a Workspace admin to approve,
 * which is the entire point: the policy that blocks public web apps does not
 * apply to outbound fetches or time-driven triggers.
 *
 * WHAT IT DOES
 *   pushPartners()  daily, after your 6am refresh — sends the Partners tab
 *                   to Netlify so the Arcade can look partners up.
 *   pullEvents()    every 15 min — collects spins and challenge acceptances
 *                   from Netlify, writes them into SpinLog and
 *                   challenge_accepted_at, and emails the Account Manager
 *                   about new acceptances. Then acknowledges them so they
 *                   are not delivered twice.
 *
 * INSTALL
 *   1. In your Sheet: Extensions > Apps Script.
 *   2. Add this file alongside Code.gs.
 *   3. Project Settings > Script Properties, add two:
 *        NETLIFY_BASE_URL   https://your-site.netlify.app   (no trailing slash)
 *        SYNC_API_KEY       a long random string; the same value goes into
 *                           Netlify as SYNC_API_KEY
 *   4. Run installNecromancerTriggers() once. Authorize when prompted —
 *      it asks for outbound fetch, Sheet access, and send-email.
 *   5. Run pushPartners() manually to seed Netlify immediately, then
 *      syncStatus() to confirm.
 */

var PUSH_HOUR = 7;          // after the 6am refresh; widen if yours runs late
var PULL_MINUTES = 15;      // how quickly spins land back in the Sheet
var MAX_EVENTS_PER_PULL = 200;

/**
 * Netlify's event timestamps arrive as UTC ISO strings (e.g.
 * "2026-08-18T14:32:00.000Z"). Writing that raw into the Sheet is correct
 * but unreadable to Ops/AMs, who are all reading it in Lagos local time.
 * This formats to Africa/Lagos wall-clock time for the Sheet cell only —
 * nothing downstream re-parses these columns programmatically (SpinLog is
 * append-only and NECROCLASH never reads it), so there's no risk of this
 * format breaking anything else. The authoritative timestamp for the
 * 30-day challenge day-count stays the raw ISO string held in Netlify
 * Blobs, untouched by this.
 */
function toLagosTime_(iso) {
  var d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) d = new Date();
  return Utilities.formatDate(d, 'Africa/Lagos', 'dd MMM yyyy, HH:mm') + ' WAT';
}

function syncProp_(name) {
  var v = PropertiesService.getScriptProperties().getProperty(name);
  if (!v) {
    throw new Error('Script property ' + name + ' is not set. ' +
                    'Project Settings > Script Properties.');
  }
  // Trimmed because a value pasted into Script Properties very easily carries
  // a trailing space or newline, which produces a 401 indistinguishable from
  // a wrong key. Netlify trims its side too.
  v = v.replace(/^\s+|\s+$/g, '');
  return name === 'NETLIFY_BASE_URL' ? v.replace(/\/+$/, '') : v;
}

function syncFetch_(path, options) {
  var key = syncProp_('SYNC_API_KEY');
  var opts = options || {};
  opts.muteHttpExceptions = true;
  opts.headers = opts.headers || {};
  opts.headers.Authorization = 'Bearer ' + key;

  // The key also goes on the query string. Netlify's function layer can strip
  // Authorization headers, and when it does the header simply arrives empty
  // with nothing to distinguish it from a bad key. Sending both means the
  // sync survives either way; the server prefers the header when present.
  var sep = path.indexOf('?') >= 0 ? '&' : '?';
  var url = syncProp_('NETLIFY_BASE_URL') + path + sep + 'key=' + encodeURIComponent(key);

  var res = UrlFetchApp.fetch(url, opts);
  var code = res.getResponseCode();
  var text = res.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error('Netlify ' + path + ' returned HTTP ' + code + ': ' + text.slice(0, 400));
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('Netlify ' + path + ' returned non-JSON: ' + text.slice(0, 200));
  }
}

// ---------------------------------------------------------------------------
// PUSH — Sheet ➝ Netlify
// ---------------------------------------------------------------------------
/**
 * Mirrors lib/gameRules.ts's CREDIT_STEPS on the Next app. Apps Script can't
 * import from that project, so this is a manually-kept-in-sync copy — if the
 * ladder amounts ever change there, update this list too or ladderStepReached
 * will disagree with what the Arcade actually shows the partner.
 */
var CREDIT_STEP_LABELS_ = [
  { orders: 0, label: '₦0' },
  { orders: 5, label: '₦5K' },
  { orders: 10, label: '₦10K' },
  { orders: 15, label: '₦12.5K' },
  { orders: 20, label: '₦15K' },
  { orders: 30, label: '₦20K' },
  { orders: 40, label: '₦25K' },
];

function ladderStepLabel_(orders) {
  var label = CREDIT_STEP_LABELS_[0].label;
  for (var i = 0; i < CREDIT_STEP_LABELS_.length; i++) {
    if (orders >= CREDIT_STEP_LABELS_[i].orders) label = CREDIT_STEP_LABELS_[i].label;
  }
  return label;
}

/**
 * Mirrors lib/gameRules.ts's MILESTONES on the Next app (names + thresholds
 * only — never the odds, which stay server-side there). Keep this in sync
 * by hand whenever a milestone threshold changes, same caveat as
 * CREDIT_STEP_LABELS_ above.
 */
var MILESTONE_NOTIFY_ = [
  { name: 'credit-10', orders: 10, label: '₦5,000 Ads Credit' },
  { name: 'credit-15', orders: 15, label: '₦5,000 Ads Credit' },
  { name: 'merch-20', orders: 20, label: 'Glovo Branded Merchandise' },
  { name: 'credit-40', orders: 40, label: '₦25,000 Ads Credit' },
  { name: 'credit-50', orders: 50, label: '₦5,000 Ads Credit' },
  { name: 'photography-80', orders: 80, label: 'Pro Food Photography Session' },
  { name: 'instagram-100', orders: 100, label: 'Instagram Story Feature' },
];

// The Sheet's partner-email header, as it actually exists right now (note:
// it's spelled "patner_email" on the live Sheet, not "partner_email" — kept
// as a single named constant so fixing that typo later is a one-line change
// instead of a find-and-replace).
var PARTNER_EMAIL_HEADER_ = 'patner_email';

/**
 * Emails a partner once per milestone the moment orders_delivered crosses
 * it — never twice for the same milestone, and batched into one email if a
 * sync jump crosses several at once (e.g. a big backfill), rather than
 * firing off a burst. "Already notified" is tracked in the Sheet itself
 * (milestonesNotified, comma-separated milestone names) rather than by
 * asking Netlify what's been claimed, because a partner who hasn't spun yet
 * would otherwise get re-emailed on every single sync until they do.
 */
function notifyMilestones_(row, rowIndex, headers, said, orders, storeName, netlifyBaseUrl) {
  var emailCol = headers.indexOf(PARTNER_EMAIL_HEADER_);
  if (emailCol < 0) return; // column not on this Sheet yet — nothing to do

  var email = String(row[emailCol] || '').trim();
  if (!email) return;

  var notifiedCol = headers.indexOf('milestonesnotified');
  var already = {};
  if (notifiedCol >= 0) {
    String(row[notifiedCol] || '').split(',').forEach(function (n) {
      n = n.trim();
      if (n) already[n] = true;
    });
  }

  var newlyCrossed = MILESTONE_NOTIFY_.filter(function (m) {
    return orders >= m.orders && !already[m.name];
  });
  if (!newlyCrossed.length) return;

  var link = netlifyBaseUrl + '/arcade?said=' + said;
  var labelLines = newlyCrossed.map(function (m) { return '- ' + m.label; }).join('\n');
  var subject = newlyCrossed.length === 1
    ? '[Project Lazarus] New spin unlocked — ' + newlyCrossed[0].label
    : '[Project Lazarus] ' + newlyCrossed.length + ' new spins unlocked';
  var body =
    (storeName || 'Hi') + ',\n\n' +
    'Your revival continues — you just crossed ' + orders + ' orders delivered and unlocked:\n' +
    labelLines + '\n\n' +
    'Spin now: ' + link + '\n\n' +
    '— Glovo Nigeria';

  try {
    MailApp.sendEmail(email, subject, body);
  } catch (err) {
    // A bad address on one row shouldn't stop the rest of the sync — Ops
    // can see it in the log and fix the cell.
    Logger.log('milestone email failed for ' + said + ': ' + (err && err.message ? err.message : err));
    return;
  }

  if (notifiedCol >= 0) {
    newlyCrossed.forEach(function (m) { already[m.name] = true; });
    setPartnerCell_(rowIndex, headers, 'milestonesnotified', Object.keys(already).join(','));
  }
}

function pushPartners() {
  var tab = readTab_('Partners');
  var col = {
    said: saidColumnIndex_(tab.headers),
    name: tab.headers.indexOf('store_name'),
    tier: tab.headers.indexOf('tier'),
    orders: tab.headers.indexOf('orders_delivered'),
  };
  if (col.said < 0 || col.orders < 0) {
    throw new Error('Partners tab needs at least "said" (or "store_address_id") and "orders_delivered" columns.');
  }

  var ladderStepCol = tab.headers.indexOf('ladderstepreached');
  // Read once for the whole push rather than per-row — it's a Script
  // Properties lookup, cheap but no reason to repeat it 100-1000 times.
  var netlifyBaseUrl = syncProp_('NETLIFY_BASE_URL');

  var partners = [];
  tab.rows.forEach(function (row, i) {
    var said = normalizeSaid_(row[col.said]);
    if (!isValidSaid_(said)) return;
    var orders = Number(row[col.orders]) || 0;
    var storeName = col.name >= 0 ? String(row[col.name]) : '';
    partners.push({
      said: said,
      storeName: storeName,
      tier: col.tier >= 0 ? String(row[col.tier]) : '',
      orders: orders,
    });

    // Written back into the Sheet immediately — it's derived purely from
    // orders_delivered, which this same row already has, so it doesn't need
    // a round trip through Netlify the way spins/acceptances do.
    if (ladderStepCol >= 0) {
      // headers are normalized to lowercase by readTab_ — setPartnerCell_
      // does a case-sensitive indexOf against them, so the colName passed
      // here MUST already be lowercase or the write silently no-ops.
      setPartnerCell_(i + 2, tab.headers, 'ladderstepreached', ladderStepLabel_(orders));
    }

    notifyMilestones_(row, i + 2, tab.headers, said, orders, storeName, netlifyBaseUrl);
  });

  // am_email is deliberately NOT sent. The AM notification is composed on
  // this side, where the Sheet already is, so the staff directory never
  // leaves Workspace.
  var result = syncFetch_('/api/sync/partners', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ partners: partners }),
  });

  var msg = 'Pushed ' + partners.length + ' partners. Netlify stored ' + result.stored +
            (result.skipped && result.skipped.length ? '; skipped ' + result.skipped.length : '') + '.';
  Logger.log(msg);
  return msg;
}

// ---------------------------------------------------------------------------
// PULL — Netlify ➝ Sheet
// ---------------------------------------------------------------------------
function pullEvents() {
  var payload = syncFetch_('/api/sync/events', { method: 'get' });
  var events = payload.events || [];
  if (!events.length) {
    Logger.log('No pending events.');
    return 'No pending events.';
  }

  var handled = [];
  var spinsWritten = 0, acceptsWritten = 0, mailsSent = 0, problems = [];

  // Read SpinLog once so de-duplication doesn't re-read per event.
  var cols = spinLogCols_();
  var alreadyLogged = {};
  cols.rows.forEach(function (r) {
    alreadyLogged[normalizeSaid_(r[cols.said]) + '|' + String(r[cols.tier]).trim()] = true;
  });

  events.slice(0, MAX_EVENTS_PER_PULL).forEach(function (ev) {
    try {
      if (ev.type === 'spin') {
        var key = normalizeSaid_(ev.said) + '|' + ev.wheelTier;
        // Delivery is at-least-once, so the same spin can arrive twice if an
        // acknowledgement was lost. Skip rather than duplicate the row.
        if (!alreadyLogged[key]) {
          appendByHeaders_('SpinLog', cols.headers, {
            timestamp: toLagosTime_(ev.at),
            said: normalizeSaid_(ev.said),
            wheel_tier: ev.wheelTier,
            prizelabel: ev.prizeLabel,
            prize: ev.prizeLabel,
            prizeindex: ev.prizeIndex,
            method: 'server',
            notes: 'tier=' + ev.wheelTier,
          });
          alreadyLogged[key] = true;
          spinsWritten++;
        }
        handled.push(ev.key);

      } else if (ev.type === 'accept') {
        var found = findPartnerRow_(normalizeSaid_(ev.said));
        if (!found) {
          problems.push('accept for unknown SAID ' + ev.said);
          handled.push(ev.key); // no partner to write to; don't retry forever
          return;
        }

        var existing = String(found.obj.challenge_accepted_at || '').trim();
        if (!existing) {
          setPartnerCell_(found.rowIndex, found.headers, 'challenge_accepted_at', toLagosTime_(ev.at));
          acceptsWritten++;
          if (notifyAccountManager_(found.obj, Number(found.obj.orders_delivered) || 0).sent) {
            mailsSent++;
          }
        }
        handled.push(ev.key);

      } else {
        problems.push('unknown event type: ' + ev.type);
        handled.push(ev.key);
      }
    } catch (err) {
      // Leave this one unacknowledged so it is retried next run.
      problems.push(String(err && err.message ? err.message : err));
    }
  });

  if (handled.length) {
    syncFetch_('/api/sync/events', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ keys: handled }),
    });
  }

  var msg = 'Pulled ' + events.length + ' event(s): ' + spinsWritten + ' spin(s) logged, ' +
            acceptsWritten + ' acceptance(s) recorded, ' + mailsSent + ' AM email(s) sent.' +
            (problems.length ? '\nProblems:\n  ' + problems.join('\n  ') : '');
  Logger.log(msg);
  return msg;
}

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------
// Function name kept as-is despite the Project Lazarus rename (2026-08-28)
// — if a daily trigger is already installed pointing at this exact name,
// renaming it would break that trigger silently until someone reruns this
// function under its new name. Not worth that risk for an internal
// identifier nobody but you ever sees.
function installNecromancerTriggers() {
  // Clear ours first so re-running this doesn't stack duplicate triggers.
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (fn === 'pushPartners' || fn === 'pullEvents') {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });

  ScriptApp.newTrigger('pushPartners').timeBased().everyDays(1).atHour(PUSH_HOUR).create();
  ScriptApp.newTrigger('pullEvents').timeBased().everyMinutes(PULL_MINUTES).create();

  var msg = 'Triggers installed (removed ' + removed + ' old): pushPartners daily ~' +
            PUSH_HOUR + ':00 Africa/Lagos, pullEvents every ' + PULL_MINUTES + ' min.';
  Logger.log(msg);
  return msg;
}

function syncStatus() {
  var out = [];
  try {
    out.push('NETLIFY_BASE_URL: ' + syncProp_('NETLIFY_BASE_URL'));
    out.push('SYNC_API_KEY: set (' + syncProp_('SYNC_API_KEY').length + ' chars)');
  } catch (err) {
    out.push('CONFIG PROBLEM: ' + err.message);
  }

  var triggers = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === 'pushPartners' || t.getHandlerFunction() === 'pullEvents';
  });
  out.push(triggers.length + ' Project Lazarus trigger(s) installed' +
           (triggers.length ? '' : ' — run installNecromancerTriggers()'));

  try {
    var pending = syncFetch_('/api/sync/events', { method: 'get' });
    out.push((pending.events || []).length + ' event(s) waiting to be pulled');
  } catch (err) {
    out.push('Could not reach Netlify: ' + err.message);
  }

  var report = out.join('\n');
  Logger.log(report);
  return report;
}
