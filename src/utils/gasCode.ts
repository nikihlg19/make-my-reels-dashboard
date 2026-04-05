// This file is the single source of truth for the Google Apps Script code.
// Update here and copy to Apps Script editor for deployment.

export const GAS_CODE = `// ==========================================
// 1. CONSTANTS & CONFIGURATION
// ==========================================

const FIREBASE_SERVER_KEY = 'YOUR_FIREBASE_SERVER_KEY_HERE';

// Set this to the same value as CRON_SECRET in your .env
// This prevents unauthorized POST requests to your script URL
const SHARED_SECRET = 'YOUR_CRON_SECRET_HERE'; // Replace with your CRON_SECRET value from Vercel env vars

// ==========================================
// 2. WEB APP ENDPOINTS
// ==========================================

function doOptions(e) {
  return ContentService.createTextOutput("").setMimeType(ContentService.MimeType.TEXT);
}

function doGet(e) {
  return ContentService.createTextOutput("MMR Bridge Online. Use POST to sync.").setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  // Verify shared secret to reject unauthorized requests
  var secret = e.parameter && e.parameter.secret ? e.parameter.secret : null;
  if (!secret) {
    try {
      var raw = e.postData ? JSON.parse(e.postData.getDataAsString()) : {};
      secret = raw.secret || null;
    } catch(err) {}
  }
  if (SHARED_SECRET !== 'YOUR_CRON_SECRET_HERE' && secret !== SHARED_SECRET) {
    return ContentService.createTextOutput(JSON.stringify({ status: "unauthorized" })).setMimeType(ContentService.MimeType.JSON);
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return ContentService.createTextOutput(JSON.stringify({ status: "busy" })).setMimeType(ContentService.MimeType.JSON);
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // Logging
    var logSheet = ss.getSheetByName("Logs");
    if (!logSheet) {
      logSheet = ss.insertSheet("Logs");
      logSheet.appendRow(["Timestamp", "User", "UserEmail", "IsAdmin", "Action", "Fields", "Status", "Details"]);
      logSheet.getRange("A1:H1").setFontWeight("bold");
    }

    var appendLog = function(logData) {
      if (!logSheet) return;
      var ts      = logData.Timestamp || new Date();
      var user    = logData.User      || "System";
      var email   = logData.UserEmail || "N/A";
      var isAdmin = (logData.IsAdmin !== undefined) ? logData.IsAdmin : false;
      var action  = logData.Action    || "Sync";
      var fields  = logData.Fields    || "";
      var status  = logData.Status    || "Info";
      var details = logData.Details   || "";
      logSheet.appendRow([ts, user, email, isAdmin, action, fields, status, details]);
      if (logSheet.getLastRow() > 2000) logSheet.deleteRows(2, logSheet.getLastRow() - 2000);
    };

    // Parse body
    var content = e.postData ? e.postData.getDataAsString() : null;
    if (!content) {
      appendLog({ Status: "Error", Details: "No post data received" });
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "No data" })).setMimeType(ContentService.MimeType.JSON);
    }

    var data;
    try {
      data = JSON.parse(content);
    } catch (parseErr) {
      appendLog({ Status: "Parse Error", Details: parseErr.toString() });
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "JSON parse failed" })).setMimeType(ContentService.MimeType.JSON);
    }

    // Device token registration
    if (data.action === "register_device") {
      return handleDeviceRegistration(data.token);
    }

    // Sheet updater with circuit breaker
    var updateSheet = function(sheetName, items, headers) {
      if (!items) return;
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) sheet = ss.insertSheet(sheetName);
      var currentRowCount  = sheet.getLastRow() - 1;
      var incomingRowCount = items.length;
      if (currentRowCount > 10 && incomingRowCount < currentRowCount * 0.8) {
        appendLog({ Status: "FATAL WARNING", Details: "Circuit breaker tripped for " + sheetName });
        throw new Error("Mass deletion prevented by circuit breaker.");
      }
      if (items.length === 0 && sheet.getLastRow() > 5) {
        appendLog({ Status: "Warning", Details: "Skipped clearing " + sheetName + " (0 items sent)" });
        return;
      }
      if (sheet.getLastRow() > 0) {
        sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), Math.max(sheet.getLastColumn(), 1)).clearContent();
      }
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
      if (items.length > 0) {
        var rows = items.map(function(item) {
          return headers.map(function(h) {
            var val = item[h];
            if (val === undefined || val === null) return "";
            return val;
          });
        });
        sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
      }
    };

    // Sync core data
    if (data.projects) {
      updateSheet("Projects", data.projects, [
        "ID","Title","Status","Priority","ShootDate","ShootTime","Deadline","DueDate",
        "Progress","Rating","Budget","Expenses","Location","Description","Notes",
        "ClientID","ClientIDs","ClientName","Dependencies","Tags","TeamMemberIDs",
        "InstagramLinks","IsOverdue","UpdatedAt","IsDeleted"
      ]);
      try { syncProjectsToCalendar(data.projects); } catch (calErr) {
        appendLog({ Status: "Calendar Error", Details: calErr.toString() });
      }
    }
    if (data.team) {
      updateSheet("Team", data.team, [
        "ID","Name","Roles","Phone","Location","Avatar","Color","ActiveCount",
        "CompletedCount","AvgRating","AvgEffort","OnTimeRate","Tags","OnboardingNotes",
        "AadhaarImageUrl","KYCDeclaration","UpdatedAt","IsDeleted"
      ]);
    }
    if (data.clients) {
      updateSheet("Clients", data.clients, [
        "ID","Name","Company","Phone","Email","Notes","Avatar","Color","CreatedAt","UpdatedAt","IsDeleted"
      ]);
    }

    // PendingApprovals tab (RBAC workflow)
    if (data.pendingApprovals) {
      updateSheet("PendingApprovals", data.pendingApprovals, [
        "ID","Type","EntityType","EntityID","EntityTitle","Changes",
        "RequestedBy","RequestedByEmail","RequestedAt","Status"
      ]);
    }

    // Write audit log
    var details = "Projects: "   + (data.projects        ? data.projects.length        : 0) +
                  ", Team: "     + (data.team             ? data.team.length             : 0) +
                  ", Clients: "  + (data.clients          ? data.clients.length          : 0) +
                  ", Pendings: " + (data.pendingApprovals ? data.pendingApprovals.length : 0);
    var logEntry = data.logEntry || {};
    logEntry.Status  = "Success";
    logEntry.Details = details;
    appendLog(logEntry);

    SpreadsheetApp.flush();
    return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    try {
      var errLog = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Logs");
      if (errLog) errLog.appendRow([new Date(), "System", "N/A", false, "Sync", "", "Fatal Error", err.toString()]);
    } catch(e2) { console.error('Failed to log sync error:', e2); }
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

// ==========================================
// 3. GOOGLE CALENDAR SYNC
// ==========================================

function syncProjectsToCalendar(projects) {
  var calendar = CalendarApp.getDefaultCalendar();
  projects.forEach(function(project) {
    if (project.IsDeleted || project.Status === 'Completed' || project.Status === 'Expired') {
      deleteEventForProject(calendar, project.ID);
      return;
    }
    if (!project.ShootDate) return;
    var dateStr       = String(project.ShootDate).split('T')[0];
    var timeStr       = project.ShootTime || "09:00";
    var eventDateTime = new Date(dateStr + 'T' + timeStr);
    if (isNaN(eventDateTime.getTime())) return;
    var endTime       = new Date(eventDateTime.getTime() + 2 * 60 * 60 * 1000);
    var title         = "Shoot: " + project.Title;
    var description   = "Project ID: " + project.ID + "\\nClient: " + (project.ClientName || 'N/A') +
                        "\\nStatus: " + project.Status + "\\nLocation: " + (project.Location || 'TBD');
    var searchStart   = new Date(eventDateTime.getTime() - 14 * 24 * 60 * 60 * 1000);
    var searchEnd     = new Date(eventDateTime.getTime() + 14 * 24 * 60 * 60 * 1000);
    var existing      = calendar.getEvents(searchStart, searchEnd, { search: project.ID });
    var found = false;
    for (var i = 0; i < existing.length; i++) {
      if (existing[i].getDescription().indexOf("Project ID: " + project.ID) !== -1) {
        existing[i].setTitle(title);
        existing[i].setDescription(description);
        existing[i].setTime(eventDateTime, endTime);
        if (project.Location) existing[i].setLocation(project.Location);
        found = true;
        break;
      }
    }
    if (!found) {
      calendar.createEvent(title, eventDateTime, endTime, { description: description, location: project.Location || '' });
    }
  });
}

function deleteEventForProject(calendar, projectId) {
  if (!projectId) return;
  var now    = new Date();
  var past   = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  var future = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
  calendar.getEvents(past, future, { search: projectId }).forEach(function(ev) {
    if (ev.getDescription().indexOf("Project ID: " + projectId) !== -1) ev.deleteEvent();
  });
}

// ==========================================
// 4. SHOOT REMINDERS (EMAIL)
// ==========================================

function checkPendingAndNotify() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Projects");
  if (!sheet) return;
  var data      = sheet.getDataRange().getValues();
  var headers   = data[0];
  var titleIdx  = headers.indexOf("Title");
  var statusIdx = headers.indexOf("Status");
  var dateIdx   = headers.indexOf("ShootDate");
  var timeIdx   = headers.indexOf("ShootTime");
  var MY_EMAIL  = "n.gandham90@gmail.com";
  var now = new Date();
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (row[statusIdx] !== "To Do" && row[statusIdx] !== "In Progress") continue;
    if (!row[dateIdx]) continue;
    var eventDT   = new Date(row[dateIdx]);
    var timeParts = String(row[timeIdx] || "09:00").split(':');
    eventDT.setHours(parseInt(timeParts[0], 10), parseInt(timeParts[1], 10), 0, 0);
    var hoursDiff = (eventDT.getTime() - now.getTime()) / (1000 * 60 * 60);
    var label     = (hoursDiff > 23 && hoursDiff <= 24) ? "tomorrow" :
                    (hoursDiff > 0  && hoursDiff <= 1)  ? "in 1 hour" : null;
    if (!label) continue;
    MailApp.sendEmail({
      to: MY_EMAIL,
      subject: "Reminder: Upcoming Shoot for " + row[titleIdx],
      htmlBody: '<div style="font-family:sans-serif;padding:20px"><h2 style="color:#4F46E5">Upcoming Event Reminder</h2>' +
        '<p>Your shoot for <b>' + row[titleIdx] + '</b> is <b>' + label + '</b> at ' + eventDT.toLocaleString() + '.</p>' +
        '<p>Please ensure your equipment is ready.</p></div>'
    });
  }
}

// ==========================================
// 5. PUSH NOTIFICATIONS (FCM)
// ==========================================

function handleDeviceRegistration(token) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Devices");
  if (!sheet) {
    sheet = ss.insertSheet("Devices");
    sheet.appendRow(["DeviceToken", "LastSeen"]);
    sheet.getRange("A1:B1").setFontWeight("bold");
  }
  var existing = sheet.getDataRange().getValues();
  for (var i = 1; i < existing.length; i++) {
    if (existing[i][0] === token) {
      sheet.getRange(i + 1, 2).setValue(new Date());
      return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Device updated" })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  sheet.appendRow([token, new Date()]);
  return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Device registered" })).setMimeType(ContentService.MimeType.JSON);
}

function checkAndSendNotifications() {
  var ss           = SpreadsheetApp.getActiveSpreadsheet();
  var projectSheet = ss.getSheetByName("Projects");
  var deviceSheet  = ss.getSheetByName("Devices");
  if (!projectSheet || !deviceSheet) return;
  var deviceData = deviceSheet.getDataRange().getValues();
  var tokens = [];
  for (var i = 1; i < deviceData.length; i++) {
    if (deviceData[i][0]) tokens.push(deviceData[i][0]);
  }
  if (tokens.length === 0) return;
  var pData      = projectSheet.getDataRange().getValues();
  var headers    = pData[0];
  var titleIdx   = headers.indexOf("Title");
  var dateIdx    = headers.indexOf("ShootDate");
  var timeIdx    = headers.indexOf("ShootTime");
  var statusIdx  = headers.indexOf("Status");
  var deletedIdx = headers.indexOf("IsDeleted");
  var now   = new Date();
  var toSend = [];
  for (var j = 1; j < pData.length; j++) {
    var row = pData[j];
    if (row[deletedIdx] === true || String(row[deletedIdx]).toLowerCase() === 'true') continue;
    if (row[statusIdx] === "Completed" || row[statusIdx] === "Expired") continue;
    if (!row[dateIdx]) continue;
    try {
      var dateStr = row[dateIdx] instanceof Date ? row[dateIdx].toISOString().split('T')[0] : String(row[dateIdx]);
      var timeStr = row[timeIdx] ? String(row[timeIdx]) : "09:00";
      var eventDT = new Date(dateStr + 'T' + timeStr);
      if (isNaN(eventDT.getTime())) continue;
      var diffH = (eventDT.getTime() - now.getTime()) / (1000 * 60 * 60);
      if      (diffH > 23 && diffH <= 24) toSend.push({ title: "Shoot Tomorrow! 🎥",     body: "Shoot for '" + row[titleIdx] + "' starts tomorrow at " + timeStr });
      else if (diffH > 0  && diffH <= 1)  toSend.push({ title: "Shoot Starting Soon! 🚨", body: "Shoot for '" + row[titleIdx] + "' starts in less than an hour!" });
    } catch (e) { console.error('Notification processing error:', e); continue; }
  }
  if (toSend.length === 0) return;
  toSend.forEach(function(notif) {
    var payload = { registration_ids: tokens, notification: { title: notif.title, body: notif.body, sound: "default" } };
    try {
      var resp   = UrlFetchApp.fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'post',
        headers: { 'Authorization': 'key=' + FIREBASE_SERVER_KEY, 'Content-Type': 'application/json' },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
      var result = JSON.parse(resp.getContentText());
      if (result.failure > 0 && result.results) cleanupDeadTokens(deviceSheet, tokens, result.results);
    } catch (e) { console.error('FCM response handling error:', e); }
  });
}

// ==========================================
// 6. HELPERS
// ==========================================

function cleanupDeadTokens(deviceSheet, sentTokens, fcmResults) {
  var dead = [];
  for (var i = 0; i < fcmResults.length; i++) {
    if (fcmResults[i].error === "NotRegistered" || fcmResults[i].error === "InvalidRegistration") dead.push(sentTokens[i]);
  }
  if (dead.length === 0) return;
  var data = deviceSheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (dead.indexOf(data[i][0]) !== -1) deviceSheet.deleteRow(i + 1);
  }
}

function onEdit(e) {
  if (!e || !e.range) return;
  var sheetName = e.range.getSheet().getName();
  if (["Projects","Team","Clients"].indexOf(sheetName) === -1) return;
  var row = e.range.getRow();
  if (row === 1) return;
  var headers = e.range.getSheet().getRange(1, 1, 1, e.range.getSheet().getLastColumn()).getValues()[0];
  var col = headers.indexOf("UpdatedAt") + 1;
  if (col > 0 && e.range.getColumn() !== col) {
    e.range.getSheet().getRange(row, col).setValue(new Date().getTime());
  }
}

function backupDatabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var backupFolderId = "YOUR_GOOGLE_DRIVE_FOLDER_ID"; // Replace with your Drive folder ID
  try {
    var folder  = DriveApp.getFolderById(backupFolderId);
    var dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
    DriveApp.getFileById(ss.getId()).makeCopy("Backup - " + ss.getName() + " - " + dateStr, folder);
  } catch(e) {
    var logSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Logs");
    if (logSheet) logSheet.appendRow([new Date(), "System", "N/A", false, "Backup", "", "Failed", e.toString()]);
  }
}`;
