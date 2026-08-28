/**
 * Code.gs — standalone NECROCLASH Web App for Account Managers.
 *
 * This is a SEPARATE Apps Script project from sheet-api-appsscript/ — it is
 * not bound to the Sheet, so it opens it by ID instead. That's the only
 * real difference between a "bound" and "standalone" Apps Script project;
 * both still need zero Google Cloud Console / IAM involvement.
 *
 * HOW TO INSTALL:
 *   1. Go to script.google.com > New project (NOT via a Sheet's Extensions
 *      menu this time — this one stands alone).
 *   2. Delete the placeholder code, paste this file in as Code.gs.
 *   3. Add a second file (HTML type, name it exactly "Dashboard") and paste
 *      in Dashboard.html's content.
 *   4. Project Settings (gear icon) > Script Properties > add a property
 *      named SHEET_ID with the value being your Google Sheet's ID (the
 *      long string in its URL between /d/ and /edit).
 *   5. Run preflightNecroclash() from the editor. It confirms the SHEET_ID
 *      resolves and the tabs/headers are readable before you deploy.
 *   6. Deploy > New deployment > Web app.
 *      - Execute as: Me
 *      - Who has access: Anyone within [your domain]   <-- use this, not "Anyone"
 *
 *      Domain access is what makes Session.getActiveUser() return the
 *      viewer's email, which is how an AM lands on their OWN dashboard
 *      instead of picking themselves out of a dropdown. With "Anyone",
 *      Apps Script returns an empty string for the active user and there
 *      is no way to tell AMs apart. This is also the closest thing to the
 *      Workspace SSO the PRD asks for (Section 9) without touching IAM.
 *   7. Authorize when prompted — it's asking permission to read the Sheet
 *      you're about to point it at by ID, which you already own.
 *   8. Copy the Web app URL. That's the NECROCLASH link you send to AMs.
 *
 * Uses the SAME Sheet as the Reactivation Arcade (Partners + AMs tabs).
 * SpinLog isn't needed here — NECROCLASH only reads Partners and AMs.
 *
 * NOTE ON THE AMs TAB. The live sheet carries EP, reactivations and rank
 * columns. This code IGNORES them and recomputes all three from the
 * Partners tab on every load, because they are strictly derived values —
 * EP is segment base points × credit-tier multiplier (PRD Section 15), and
 * a stored copy can only ever disagree with the orders it came from. Every
 * read maps by header name, so the extra columns are harmless.
 *
 * If something else populates those columns and you want them treated as
 * the source of truth instead, that's a real change in behaviour — say so
 * rather than assuming, because it changes who the leaderboard believes.
 */

/**
 * EASIEST OPTION: paste your Sheet ID between the quotes below and you're
 * done — no Script Properties needed at all.
 *
 * The ID is the long string in the Sheet's URL between /d/ and /edit:
 *   docs.google.com/spreadsheets/d/THIS_PART_HERE/edit#gid=0
 *
 * A SHEET_ID script property still wins if one is set, so you can leave
 * this blank and use Project Settings > Script Properties instead. Do one
 * or the other, not neither.
 */
var SHEET_ID_FALLBACK = '';

function SHEET_ID_() {
  // NOTE: 'SHEET_ID' here is the property's NAME, not its value. Replacing
  // it with the actual sheet ID looks up a property that doesn't exist and
  // returns null — set the ID as the property's VALUE, or use
  // SHEET_ID_FALLBACK above.
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID') || SHEET_ID_FALLBACK;
  if (!id) {
    throw new Error(
      'No Sheet ID configured. Either paste it into SHEET_ID_FALLBACK at the top of ' +
      'Code.gs, or add a script property literally named SHEET_ID whose value is the ID ' +
      '(Project Settings > Script Properties).'
    );
  }
  return id;
}

function getSpreadsheet_() {
  // Resolved OUTSIDE the try. It was inside, so a missing-ID error got
  // caught and rewritten as "could not open the Sheet with that SHEET_ID" —
  // which sends you to check an ID that was never read in the first place.
  var id = SHEET_ID_();
  try {
    return SpreadsheetApp.openById(id);
  } catch (e) {
    throw new Error('Could not open a Sheet with ID "' + id + '". Check it is the long ' +
                    'string between /d/ and /edit in the Sheet URL, and that this Google ' +
                    'account can open that Sheet.');
  }
}

// ---------------------------------------------------------------------------
// Scoring constants — NECROCLASH's own AM-competition rubric (EP, rank
// tiers). Independent of the Arcade's prize milestones in
// necromancer-app/lib/gameRules.ts — that table decides what a PARTNER wins
// on the wheel; this one decides how an AM's effort is scored. The two
// diverged on 2026-08-27 when the Arcade moved to fixed order-count
// milestones — that change does not need mirroring here.
// ---------------------------------------------------------------------------
var CREDIT_STEPS = [
  { orders: 0, credit: 0 }, { orders: 5, credit: 5000 }, { orders: 10, credit: 10000 },
  { orders: 15, credit: 12500 }, { orders: 20, credit: 15000 }, { orders: 30, credit: 20000 },
  { orders: 40, credit: 25000 },
];

// PRD Section 15. Segment labels are matched case-insensitively and with
// whitespace trimmed, because these are typed into a Sheet by hand and
// "tier 2 " scoring 0 EP is a silent, invisible failure.
var SEGMENT_BASE_POINTS = { 'tier 1': 30, 'tier 2': 100, 'tier 3': 70, 'tier 4': 50 };
var SEGMENT_DISPLAY = { 'tier 1': 'Sleeper', 'tier 2': 'Leviathan', 'tier 3': 'Wanderer', 'tier 4': 'Wraith' };
var CREDIT_MULTIPLIER = { 0: 0, 5000: 1.0, 10000: 1.5, 12500: 2.0, 15000: 2.5, 20000: 3.0, 25000: 4.0 };
var RANK_TIERS = [
  { rank: 'Bonecaller', minEp: 0 }, { rank: 'Wraithbinder', minEp: 500 },
  { rank: 'Soulforger', minEp: 1200 }, { rank: 'Archnecromancer', minEp: 2400 },
];

function normalizeHeader_(h) {
  return String(h == null ? '' : h).trim().toLowerCase().replace(/\s+/g, '_');
}
function normalizeEmail_(v) {
  return String(v == null ? '' : v).trim().toLowerCase();
}
/**
 * Extracts the tier from a segment label, ignoring decoration.
 *
 * The live sheet writes segments as "Tier 4 🌑", "Tier 3 🔴" and so on. An
 * exact string match scored every one of those 0 EP — silently, because a
 * missing multiplier looks identical to a partner who simply hasn't
 * reactivated. Pulling the digit out means the emoji, casing, and any
 * trailing spaces stop mattering.
 *
 * Returns 'tier 1'..'tier 4', or '' if there is no tier in the string.
 */
function normalizeSegment_(v) {
  var m = String(v == null ? '' : v).match(/tier\s*([1-4])/i);
  return m ? 'tier ' + m[1] : '';
}

function creditForOrders_(orders) {
  var cur = CREDIT_STEPS[0];
  for (var i = CREDIT_STEPS.length - 1; i >= 0; i--) {
    if (orders >= CREDIT_STEPS[i].orders) { cur = CREDIT_STEPS[i]; break; }
  }
  return cur.credit;
}

function progressPct_(orders) {
  var idx = 0;
  for (var i = CREDIT_STEPS.length - 1; i >= 0; i--) {
    if (orders >= CREDIT_STEPS[i].orders) { idx = i; break; }
  }
  var cur = CREDIT_STEPS[idx], next = CREDIT_STEPS[idx + 1];
  if (!next) return 100;
  return Math.min(100, Math.round(((orders - cur.orders) / (next.orders - cur.orders)) * 100));
}

function epForPartner_(segment, orders) {
  var base = SEGMENT_BASE_POINTS[normalizeSegment_(segment)] || 0;
  var mult = CREDIT_MULTIPLIER[creditForOrders_(orders)] || 0;
  return base * mult;
}

function rankForEp_(ep) {
  var rank = RANK_TIERS[0].rank;
  for (var i = 0; i < RANK_TIERS.length; i++) if (ep >= RANK_TIERS[i].minEp) rank = RANK_TIERS[i].rank;
  return rank;
}

function readTab_(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Sheet tab "' + name + '" not found. Tab names are case-sensitive.');
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0].map(normalizeHeader_);
  return data.slice(1)
    .filter(function (r) {
      // A row counts as real if ANY cell has content — keying off column A
      // alone dropped partners whose store_id happened to be blank.
      return r.some(function (c) { return String(c).trim() !== ''; });
    })
    .map(function (r) {
      var obj = {};
      headers.forEach(function (h, i) { obj[h] = r[i]; });
      return obj;
    });
}

// ---------------------------------------------------------------------------
// Weekly matchmaking.
//
// Pairings are derived, but they must be SYMMETRIC and STABLE for a week.
// The previous version paired each AM with whoever sat one rank below them
// on a live leaderboard, which fails both ways: rank 2's opponent was rank
// 3 while rank 2 was itself rank 1's opponent, so no two AMs ever agreed on
// who was duelling whom, and every order delivered reshuffled the board
// mid-week. PRD Section 6 requires the result be "visible on both AMs'
// dashboards" — that's only meaningful if both see the same duel.
//
// Instead: sort AMs by email (an ordering that does not move), rotate that
// list by the ISO week number, and pair off adjacent entries. Everyone
// agrees on the pairs, the pairs hold all week, and they rotate weekly.
// ---------------------------------------------------------------------------
function weekIndex_(date) {
  var d = date || new Date();
  // Weeks since the Unix epoch Monday. Stable and monotonic — we only need
  // "does this change exactly once a week", not calendar ISO week numbering.
  return Math.floor((d.getTime() / 86400000 + 3) / 7);
}

function weekStart_(date) {
  var d = date || new Date();
  var day = (d.getDay() + 6) % 7; // 0 = Monday
  var monday = new Date(d.getTime() - day * 86400000);
  return Utilities.formatDate(monday, 'Africa/Lagos', 'yyyy-MM-dd');
}

/** Round-robin rotation: element 0 is fixed, the rest rotate by `week`. */
function rotateForWeek_(list, week) {
  if (list.length < 3) return list.slice();
  var head = list[0], tail = list.slice(1);
  var n = tail.length;
  var offset = ((week % n) + n) % n;
  return [head].concat(tail.slice(offset)).concat(tail.slice(0, offset));
}

/** Returns { duelOpponent: {email->email}, coven: {email->{mate, rivals[]}} } */
function buildMatchups_(amEmails, week) {
  var sorted = amEmails.slice().sort();
  var duelOpponent = {}, covenOf = {};

  var order = rotateForWeek_(sorted, week);
  for (var i = 0; i + 1 < order.length; i += 2) {
    duelOpponent[order[i]] = order[i + 1];
    duelOpponent[order[i + 1]] = order[i];
  }
  // Odd AM count leaves one unpaired — give them a bye rather than a
  // phantom opponent.
  if (order.length % 2 === 1) duelOpponent[order[order.length - 1]] = null;

  // Covens use a DIFFERENT rotation so an AM's teammate isn't also their
  // duel opponent, which would make the two mechanics collapse into one.
  var covenOrder = rotateForWeek_(sorted, week + Math.floor(sorted.length / 2) + 1);
  var covens = [];
  for (var j = 0; j + 1 < covenOrder.length; j += 2) covens.push([covenOrder[j], covenOrder[j + 1]]);
  if (covenOrder.length % 2 === 1) covens.push([covenOrder[covenOrder.length - 1], null]);

  covens.forEach(function (coven, idx) {
    // Covens clash in pairs: 0v1, 2v3, ... An odd coven count leaves the
    // last one facing coven 0 rather than nobody.
    var rivalIdx = (idx % 2 === 0) ? idx + 1 : idx - 1;
    if (rivalIdx >= covens.length) rivalIdx = 0;
    var rival = covens[rivalIdx] || [null, null];

    coven.forEach(function (email) {
      if (!email) return;
      covenOf[email] = {
        mate: coven[0] === email ? coven[1] : coven[0],
        rivals: [rival[0], rival[1]].filter(function (r) { return r && r !== email; }),
      };
    });
  });

  return { duelOpponent: duelOpponent, coven: covenOf };
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------
function buildLeaderboard_(ss) {
  var partners = readTab_(ss, 'Partners');
  var ams = readTab_(ss, 'AMs');

  var rows = ams
    .filter(function (am) { return normalizeEmail_(am.am_email) !== ''; })
    .map(function (am) {
      var email = normalizeEmail_(am.am_email);
      var mine = partners.filter(function (p) { return normalizeEmail_(p.am_email) === email; });
      var totalEp = mine.reduce(function (s, p) {
        return s + epForPartner_(p.tier, Number(p.orders_delivered) || 0);
      }, 0);
      var reactivations = mine.filter(function (p) {
        return creditForOrders_(Number(p.orders_delivered) || 0) > 0;
      }).length;

      var accepted = mine.filter(function (p) {
        return String(p.challenge_accepted_at || '').trim() !== '';
      });
      var ordersDelivered = mine.reduce(function (s, p) {
        return s + (Number(p.orders_delivered) || 0);
      }, 0);
      // Averaged over ACCEPTED partners only — a store that hasn't started
      // its 30-day window yet has no "uptime since the campaign date" to
      // speak of, so including it would just water the number down with
      // zeros that mean "not started" rather than "underperforming".
      // uptime_campaign is read as a raw 0-100 number straight off the
      // Sheet; whatever populates that column is the source of truth here,
      // not this script.
      var uptimeValues = accepted
        .map(function (p) { return Number(p.uptime_campaign); })
        .filter(function (n) { return !isNaN(n); });
      var avgUptimePct = uptimeValues.length
        ? Math.round(uptimeValues.reduce(function (s, n) { return s + n; }, 0) / uptimeValues.length)
        : null;

      return {
        amName: am.am_name || email,
        amEmail: email,
        ep: Math.round(totalEp),
        reactivations: reactivations,
        partnerCount: mine.length,
        acceptedCount: accepted.length,
        ordersDelivered: ordersDelivered,
        avgUptimePct: avgUptimePct,
        rank: rankForEp_(totalEp),
      };
    });

  // Ties broken by name so the board doesn't reorder itself between two
  // otherwise identical loads.
  rows.sort(function (a, b) { return (b.ep - a.ep) || a.amName.localeCompare(b.amName); });
  return rows;
}

function getNecroclashData_(selfEmail) {
  var ss = getSpreadsheet_();
  var leaderboard = buildLeaderboard_(ss);

  if (!leaderboard.length) {
    return { error: 'The AMs tab is empty — add am_name and am_email rows, then reload.' };
  }

  var wanted = normalizeEmail_(selfEmail);
  var selfIdx = -1;
  for (var i = 0; i < leaderboard.length; i++) {
    if (leaderboard[i].amEmail === wanted) { selfIdx = i; break; }
  }
  var self = leaderboard[selfIdx >= 0 ? selfIdx : 0];
  var byEmail = {};
  leaderboard.forEach(function (r) { byEmail[r.amEmail] = r; });

  var week = weekIndex_();
  var matchups = buildMatchups_(leaderboard.map(function (r) { return r.amEmail; }), week);

  // ---- Soul Duel ----
  var rivalEmail = matchups.duelOpponent[self.amEmail];
  var rival = rivalEmail ? byEmail[rivalEmail] : null;
  // Bars are scaled against the pair's own leader, so a duel between two
  // mid-table AMs still reads as a contest instead of two stubs next to
  // whoever happens to top the whole board.
  var duelMax = Math.max(self.ep, rival ? rival.ep : 0, 1);
  var duel = {
    rival: rival,
    selfPct: Math.round((self.ep / duelMax) * 100),
    rivalPct: rival ? Math.round((rival.ep / duelMax) * 100) : 0,
    selfLeading: !rival || self.ep >= rival.ep,
    weekStart: weekStart_(),
  };

  // ---- Coven Clash ----
  var partners = readTab_(ss, 'Partners');
  var myCoven = matchups.coven[self.amEmail] || { mate: null, rivals: [] };

  function lowestLeviathan(emails) {
    var pool = partners.filter(function (p) {
      return normalizeSegment_(p.tier) === 'tier 2' &&
             emails.indexOf(normalizeEmail_(p.am_email)) >= 0;
    });
    pool.sort(function (a, b) {
      return (Number(a.orders_delivered) || 0) - (Number(b.orders_delivered) || 0);
    });
    return pool[0] || null;
  }

  var covenEmails = [self.amEmail, myCoven.mate].filter(Boolean);
  var boss = lowestLeviathan(covenEmails);
  var rivalBoss = lowestLeviathan(myCoven.rivals);

  var coven = {
    mate: myCoven.mate && byEmail[myCoven.mate] ? byEmail[myCoven.mate].amName : null,
    rivalNames: myCoven.rivals.map(function (e) { return byEmail[e] ? byEmail[e].amName : e; }),
    boss: boss ? {
      name: boss.store_name,
      segmentLabel: (SEGMENT_DISPLAY[normalizeSegment_(boss.tier)] || boss.tier) + ' · Tier 2',
      progressPct: progressPct_(Number(boss.orders_delivered) || 0),
    } : null,
    rivalProgressPct: rivalBoss ? progressPct_(Number(rivalBoss.orders_delivered) || 0) : 0,
  };

  // ---- Weekly quest ----
  var myLeviathansReactivated = partners.filter(function (p) {
    return normalizeEmail_(p.am_email) === self.amEmail &&
           normalizeSegment_(p.tier) === 'tier 2' &&
           creditForOrders_(Number(p.orders_delivered) || 0) > 0;
  }).length;

  return {
    leaderboard: leaderboard,
    self: self,
    identified: selfIdx >= 0,
    duel: duel,
    coven: coven,
    quest: {
      text: 'Reactivate 2 Leviathans this week',
      progress: Math.min(myLeviathansReactivated, 2),
      target: 2,
      complete: myLeviathansReactivated >= 2,
    },
  };
}

// ---------------------------------------------------------------------------
// Web app entry point + server functions Dashboard.html calls
// ---------------------------------------------------------------------------
function jsonOut__(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var params = (e && e.parameter) || {};

  // ?action=... returns the same data as JSON, so the Next.js /clash page
  // can render it without reimplementing any of the scoring, pairing, or
  // quest logic. One implementation, two front ends — the alternative was a
  // second copy that drifts.
  //
  // These actions are gated on API_KEY (Script Properties) because they
  // expose the full AM roster, emails and standings. The HTML dashboard
  // above doesn't need the key: it's protected by the deployment's domain
  // restriction, which a server-to-server call from Netlify can't satisfy.
  //
  // To use them, add a SECOND deployment of this same script with access
  // "Anyone" and point Netlify's NECROCLASH_API_URL at that one. The
  // domain-restricted deployment stays the AM-facing link.
  if (params.action === 'necroclash' || params.action === 'ams') {
    var expected = PropertiesService.getScriptProperties().getProperty('API_KEY');
    if (!expected) {
      return jsonOut__({ error: 'JSON API disabled — no API_KEY script property set' });
    }
    if (params.apiKey !== expected) {
      return jsonOut__({ error: 'Unauthorized' });
    }
  }

  if (params.action === 'necroclash') {
    var payload;
    try {
      payload = getNecroclashData_(params.am || '');
    } catch (err) {
      payload = { error: String(err && err.message ? err.message : err) };
    }
    return jsonOut__(payload);
  }

  if (params.action === 'ams') {
    try {
      return jsonOut__({ ams: getAmList() });
    } catch (err) {
      return jsonOut__({ error: String(err && err.message ? err.message : err) });
    }
  }

  return HtmlService.createTemplateFromFile('Dashboard')
    .evaluate()
    .setTitle('NECROCLASH — Glovo Nigeria')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * The signed-in viewer's email. Populated only when the deployment's access
 * is set to your Workspace domain (see step 6 above); returns '' otherwise,
 * and the dashboard falls back to the AM picker.
 */
function getViewerEmail() {
  try {
    return normalizeEmail_(Session.getActiveUser().getEmail());
  } catch (e) {
    return '';
  }
}

function getAmList() {
  return readTab_(getSpreadsheet_(), 'AMs')
    .filter(function (a) { return normalizeEmail_(a.am_email) !== ''; })
    .map(function (a) { return { am_name: a.am_name || a.am_email, am_email: normalizeEmail_(a.am_email) }; });
}

function getNecroclashJson(selfEmail) {
  try {
    return getNecroclashData_(selfEmail);
  } catch (err) {
    return { error: String(err && err.message ? err.message : err) };
  }
}

// ---------------------------------------------------------------------------
// preflightNecroclash() — run from the editor before deploying.
// ---------------------------------------------------------------------------
function preflightNecroclash() {
  var out = [];
  try {
    var ss = getSpreadsheet_();
    out.push('Opened sheet: ' + ss.getName());

    var ams = readTab_(ss, 'AMs');
    var partners = readTab_(ss, 'Partners');
    out.push(ams.length + ' AMs, ' + partners.length + ' partners');

    if (!ams.length) out.push('PROBLEM: AMs tab has no data rows.');

    var board = buildLeaderboard_(ss);
    var unscored = partners.filter(function (p) {
      return !SEGMENT_BASE_POINTS[normalizeSegment_(p.tier)];
    });
    if (unscored.length) {
      out.push('PROBLEM: ' + unscored.length + ' partner(s) have a tier outside Tier 1-4 ' +
               'and will score 0 EP. First: "' + unscored[0].tier + '"');
    }

    var acceptedCount = partners.filter(function (p) {
      return String(p.challenge_accepted_at || '').trim() !== '';
    }).length;
    var uptimeCount = partners.filter(function (p) {
      return p.uptime_campaign !== undefined && p.uptime_campaign !== '' && !isNaN(Number(p.uptime_campaign));
    }).length;
    out.push(acceptedCount + ' of ' + partners.length + ' partners have accepted the challenge; ' +
             uptimeCount + ' have a numeric uptime_campaign value.');

    var matchups = buildMatchups_(board.map(function (r) { return r.amEmail; }), weekIndex_());
    out.push('Week of ' + weekStart_() + ' duels:');
    var shown = {};
    board.forEach(function (r) {
      var opp = matchups.duelOpponent[r.amEmail];
      if (shown[r.amEmail]) return;
      shown[r.amEmail] = true; if (opp) shown[opp] = true;
      out.push('  ' + r.amName + ' vs ' + (opp ? opp : '(bye)'));
    });

    var amHeaderNote = ams.length && (ams[0].ep !== undefined || ams[0].rank !== undefined);
    if (amHeaderNote) {
      out.push('NOTE: the AMs tab has EP/reactivations/rank columns. These are ignored — ' +
               'all three are recomputed live from Partners so they can never disagree ' +
               'with the order counts they derive from.');
    }

    var viewer = getViewerEmail();
    out.push(viewer
      ? 'Viewer identity works: ' + viewer
      : 'NOTE: viewer identity is empty here (normal in the editor). If it is also ' +
        'empty in the deployed app, set the deployment access to your domain.');
  } catch (err) {
    out.push('FAILED: ' + err.message);
  }

  var report = out.join('\n');
  Logger.log(report);
  return report;
}
