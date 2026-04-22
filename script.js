const STORAGE_KEY = "timpview-spring-schedule-v12";
const LEGACY_STORAGE_KEYS = ["timpview-spring-schedule-v8"];
const REMOTE_SCHEDULE_ENDPOINT = "/api/spring-ball";
const FORCED_OFF_DAY_IDS = new Set([
  "spring-2026-04-22",
  "spring-2026-05-06",
]);
const FORCE_NO_AUTO_PRACTICE_DAY_IDS = new Set([
  "spring-2026-05-07",
]);
const SCRIPT_ACTIVITY_TYPES = ["Inside Run", "Skelly", "Half Line", "Team"];

const state = {
  schedule: loadSchedule(),
  selectedWeek: "all",
  selectedDayId: null,
  activeView: "visits",
  coachSubView: "position",
  dayViewMode: "team",
  selectedGroup: GROUP_LABELS[0],
  clipboard: null,
};

let remoteSyncTimeout = null;
let remoteSaveInFlight = null;
let remoteApiAvailable = false;

state.selectedDayId = state.schedule[0]?.id ?? null;

const topTabs = document.querySelector("#top-tabs");
const familyView = document.querySelector("#family-view");
const visitsView = document.querySelector("#visits-view");
const coachView = document.querySelector("#coach-view");
const weekTabs = document.querySelector("#week-tabs");
const familyGrid = document.querySelector("#family-grid");
const visitsGrid = document.querySelector("#visits-grid");
const exportIcsButton = document.querySelector("#export-ics");
const coachSubtabs = document.querySelector("#coach-subtabs");
const dayList = document.querySelector("#day-list");
const detailHeader = document.querySelector("#detail-header");
const noteRow = document.querySelector("#note-row");
const dayViewTabs = document.querySelector("#day-view-tabs");
const dayViewToolbar = document.querySelector("#day-view-toolbar");
const timeline = document.querySelector("#timeline");
const dayPane = document.querySelector("#coach-day-pane");
const positionPane = document.querySelector("#coach-position-pane");
const positionSummary = document.querySelector("#position-summary");
const positionBoard = document.querySelector("#position-board");
const scriptsPane = document.querySelector("#coach-scripts-pane");
const scriptBoard = document.querySelector("#script-board");
const statusMessage = document.querySelector("#status-message");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadSchedule() {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  const legacyStored = !stored
    ? LEGACY_STORAGE_KEYS.map((key) => window.localStorage.getItem(key)).find(Boolean)
    : null;
  const source = stored || legacyStored;

  if (!source) {
    return applyPracticeStartTemplate(clone(window.springScheduleSeed));
  }

  try {
    return applyPracticeStartTemplate(normalizeSchedule(JSON.parse(source)));
  } catch (error) {
    return applyPracticeStartTemplate(clone(window.springScheduleSeed));
  }
}

function saveSchedule(message = "Saved.") {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.schedule));
  setStatus(message);
  queueRemoteScheduleSave();
}

function applyPracticeStartTemplate(schedule) {
  const templateByPeriod = {
    "1": "TEAM MEETING",
    "2": "WARMUP",
    "3": "WARMUP",
    "4": "Indy 1",
    "5": "Indy 2",
    "6": "Indy 3",
    "7": "Indy 4",
  };

  return schedule.map((day) => {
    if (FORCED_OFF_DAY_IDS.has(day.id)) {
      return {
        ...day,
        entries: [],
        notes: ["Off day", "No workout"],
        scripts: [],
      };
    }

    if (isTuesdayOrThursdayPractice(day)) {
      const entries = window.buildTuesdayThursdayEntries ? window.buildTuesdayThursdayEntries() : day.entries;
      return {
        ...day,
        entries,
        notes: Array.isArray(day.notes) ? day.notes.filter((note) => !/off day|no workout/i.test(note)) : [],
        scripts: reconcileDayScripts(day.scripts, entries),
      };
    }

    const entries = Array.isArray(day.entries)
      ? day.entries.map((entry) => {
          const nextActivity = templateByPeriod[String(entry.period || "").trim()];
          if (!nextActivity) {
            return entry;
          }

          return {
            ...entry,
            activity: nextActivity,
          };
        })
      : [];

    return {
      ...day,
      entries,
      scripts: reconcileDayScripts(day.scripts, entries),
    };
  });
}

function isTuesdayOrThursdayPractice(day) {
  const label = String(day?.dateLabel || "");
  return (
    /^(Tuesday|Thursday),/.test(label) &&
    !FORCED_OFF_DAY_IDS.has(day?.id) &&
    !FORCE_NO_AUTO_PRACTICE_DAY_IDS.has(day?.id)
  );
}

function normalizeSchedule(schedule) {
  return schedule
    .map((day, index) => {
      const entries = Array.isArray(day.entries)
        ? day.entries.map((entry) => ({
            period: entry.period || "",
            time: entry.time || "",
            activity: entry.activity || "",
            duration: entry.duration || "",
            groups: normalizeGroups(entry.groups || {}),
          }))
        : [];

      const scripts = Array.isArray(day.scripts)
        ? day.scripts.map((script, scriptIndex) => normalizeScript(script, index, scriptIndex))
        : [];

      return {
        id: day.id || `custom-day-${index + 1}`,
        week: Number(day.week) || 1,
        dateLabel: day.dateLabel || `Day ${index + 1}`,
        dayType: day.dayType || "",
        notes: Array.isArray(day.notes) ? day.notes.filter(Boolean) : [],
        scripts: scripts.length ? scripts : buildDefaultScripts(entries),
        entries,
      };
    })
    .sort((left, right) => compareDays(left, right));
}

function normalizeGroups(groups) {
  return GROUP_LABELS.reduce((result, label) => {
    result[label] = groups[label] || "";
    return result;
  }, {});
}

function reconcileDayScripts(existingScripts, entries) {
  const allowedDefaults = buildDefaultScripts(entries);
  if (!allowedDefaults.length) {
    return [];
  }

  return Array.isArray(existingScripts) && existingScripts.length ? existingScripts : allowedDefaults;
}

function normalizeScript(script, dayIndex, scriptIndex) {
  const rows = Array.isArray(script?.rows)
    ? script.rows.map((row) => normalizeScriptRow(row))
    : [];
  const legacyRows =
    !rows.length && Array.isArray(script?.plays)
      ? buildScriptRows(Math.max(7, script.plays.filter(Boolean).length), script.plays)
      : [];
  const fallbackRows = rows.length || legacyRows.length ? [] : buildScriptRows(getScriptRowCount(script?.duration));

  return {
    id: script?.id || `script-${dayIndex + 1}-${scriptIndex + 1}`,
    title: script?.title || `Script ${scriptIndex + 1}`,
    period: script?.period || "",
    duration: script?.duration || "",
    rows: rows.length ? rows : legacyRows.length ? legacyRows : fallbackRows,
  };
}

function normalizeScriptRow(row = {}) {
  return {
    dn: String(row.dn || "1").trim() || "1",
    dist: String(row.dist || "10").trim() || "10",
    hash: String(row.hash || "M").trim() || "M",
    offensePlay: String(row.offensePlay || "").trim(),
    scoutDefensePlay: String(row.scoutDefensePlay || "").trim(),
    scoutOffensePlay: String(row.scoutOffensePlay || "").trim(),
    defensePlay: String(row.defensePlay || "").trim(),
  };
}

function buildScriptRows(count, legacyPlays = []) {
  return Array.from({ length: Math.max(1, count) }, (_, index) =>
    normalizeScriptRow({
      offensePlay: legacyPlays[index] || "",
    }),
  );
}

function getScriptRowCount(duration) {
  const minutes = durationLabelToMinutes(duration);
  const fiveMinuteBlocks = Math.max(1, Math.round((minutes || 5) / 5));
  return fiveMinuteBlocks * 7;
}

function compareDays(left, right) {
  return daySortValue(left.dateLabel).localeCompare(daySortValue(right.dateLabel));
}

function daySortValue(dateLabel) {
  const parsed = parseDateLabel(dateLabel);
  return parsed ? parsed.toISOString().slice(0, 10) : dateLabel;
}

function parseDateLabel(dateLabel) {
  const parsed = new Date(`${dateLabel}, 2026`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getWeeks() {
  return [...new Set(state.schedule.map((day) => day.week))].sort((a, b) => a - b);
}

function getVisibleDays() {
  if (state.selectedWeek === "all") {
    return state.schedule;
  }
  return state.schedule.filter((day) => day.week === state.selectedWeek);
}

function isPracticeDay(day) {
  if (isShowcaseDay(day)) {
    return false;
  }

  return day.entries.some((entry) => {
    const activity = (entry.activity || "").toUpperCase();
    return activity !== "WEIGHTS" && activity !== "FINISH";
  });
}

function isShowcaseDay(day) {
  return (
    Array.isArray(day?.notes) &&
    day.notes.some((note) => /showcase/i.test(String(note || "")))
  );
}

function getPracticeNumber(dayId) {
  let count = 0;

  for (const day of state.schedule) {
    if (isPracticeDay(day)) {
      count += 1;
    }

    if (day.id === dayId) {
      return isPracticeDay(day) ? count : null;
    }
  }

  return null;
}

function getSelectedDay() {
  return state.schedule.find((day) => day.id === state.selectedDayId) || getVisibleDays()[0] || state.schedule[0];
}

function getDayWindow(day) {
  if (!day.entries.length) {
    return { start: "Off", end: "Off" };
  }

  const withTimes = day.entries.filter((entry) => entry.time);
  if (!withTimes.length) {
    return { start: "TBD", end: "TBD" };
  }

  return {
    start: withTimes[0].time,
    end: getEntryEndTime(withTimes[withTimes.length - 1]),
  };
}

function getNamedDayWindows(day) {
  if (!day?.entries?.length) {
    return [];
  }

  const practiceEntries = day.entries.filter((entry) => {
    const activity = String(entry.activity || "").toUpperCase();
    return activity !== "WEIGHTS" && activity !== "FINISH";
  });

  const firstLiftIndex = day.entries.findIndex((entry) => String(entry.activity || "").toUpperCase() === "WEIGHTS");
  const liftEntries = firstLiftIndex >= 0 ? day.entries.slice(firstLiftIndex) : [];

  const windows = [];
  const practiceWindow = getEntriesWindow(practiceEntries);
  const liftWindow = getEntriesWindow(liftEntries);

  if (practiceWindow) {
    windows.push({ label: "Practice", start: practiceWindow.start, end: practiceWindow.end });
  }

  if (liftWindow) {
    windows.push({ label: "Lift", start: liftWindow.start, end: liftWindow.end });
  }

  return windows;
}

function getEntriesWindow(entries) {
  if (!entries.length) {
    return null;
  }

  const withTimes = entries.filter((entry) => entry.time);
  if (!withTimes.length) {
    return null;
  }

  return {
    start: withTimes[0].time,
    end: getEntryEndTime(withTimes[withTimes.length - 1]),
  };
}

function buildDaySessions(day) {
  if (!day.entries.length) {
    return [];
  }

  const sessions = [];
  let currentSession = null;

  day.entries.forEach((entry) => {
    const minutes = timeToMinutes(entry.time);
    const label = getSessionLabel(entry);
    const period = entry.period || "";

    if (
      !currentSession ||
      (minutes !== null &&
        currentSession.lastMinutes !== null &&
        minutes - currentSession.lastMinutes >= 180)
    ) {
      currentSession = {
        label,
        start: entry.time || "TBD",
        end: getEntryEndTime(entry),
        period,
        items: [],
        lastMinutes: minutes,
      };
      sessions.push(currentSession);
    }

    currentSession.end = getEntryEndTime(entry) || currentSession.end;
    currentSession.lastMinutes = minutes;
    currentSession.items.push(entry.activity || "Open block");
  });

  return sessions.map(({ label: sessionLabel, start, end, items, period }) => ({
    label: sessionLabel,
    start,
    end,
    period,
    summary: summarizeSessionItems(items),
  }));
}

function getSessionLabel(entry) {
  const activity = (entry.activity || "").toUpperCase();
  if (activity.includes("WEIGHTS")) {
    return getLiftLabel(entry.time);
  }
  if (activity.includes("SHOWCASE")) {
    return "Showcase";
  }
  if (timeToMinutes(entry.time) !== null && timeToMinutes(entry.time) < 720) {
    return "Morning Practice";
  }
  return "Practice Block";
}

function summarizeSessionItems(items) {
  const uniqueItems = [...new Set(items.filter(Boolean))];
  return uniqueItems.slice(0, 3).join(" • ");
}

function timeToMinutes(value) {
  const match = String(value || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

  if (!match) {
    return null;
  }

  let hours = Number(match[1]) % 12;
  const minutes = Number(match[2]);
  const meridiem = match[3].toUpperCase();

  if (meridiem === "PM") {
    hours += 12;
  }

  return hours * 60 + minutes;
}

function parseDateParts(dateLabel) {
  const parsed = parseDateLabel(dateLabel);
  if (!parsed) {
    return null;
  }

  return {
    year: parsed.getFullYear(),
    month: parsed.getMonth() + 1,
    day: parsed.getDate(),
  };
}

function formatIcsLocal(dateLabel, timeLabel) {
  const dateParts = parseDateParts(dateLabel);
  const match = String(timeLabel || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

  if (!dateParts || !match) {
    return null;
  }

  let hours = Number(match[1]) % 12;
  const minutes = Number(match[2]);
  if (match[3].toUpperCase() === "PM") {
    hours += 12;
  }

  return [
    String(dateParts.year).padStart(4, "0"),
    String(dateParts.month).padStart(2, "0"),
    String(dateParts.day).padStart(2, "0"),
    "T",
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    "00",
  ].join("");
}

function formatUtcStamp(date = new Date()) {
  return date
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(/\.\d{3}Z$/, "Z");
}

function escapeIcsText(value) {
  return String(value || "")
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll("\n", "\\n");
}

function buildCalendarEvents() {
  return state.schedule.flatMap((day) => {
    if (isOffDaySchedule(day)) {
      return [];
    }

    const practiceNumber = getPracticeNumber(day.id);

    return buildDaySessions(day)
      .map((session, index) => {
        const dtStart = formatIcsLocal(day.dateLabel, session.start);
        const dtEnd = formatIcsLocal(day.dateLabel, session.end);

        if (!dtStart || !dtEnd) {
          return null;
        }

        const summaryParts = ["Timpview Football", session.label];
        if (practiceNumber) {
          summaryParts.push(`Practice ${practiceNumber}`);
        }

        const description = [
          `${day.dateLabel}${day.dayType ? ` • ${day.dayType}` : ""}`,
          practiceNumber ? `Practice ${practiceNumber}` : null,
          session.period ? `Period: ${session.period}` : null,
        ]
          .filter(Boolean)
          .join("\n");

        return {
          uid: `${day.id}-${session.period || index}@timpview-spring-ball`,
          summary: summaryParts.join(" - "),
          description,
          dtStart,
          dtEnd,
        };
      })
      .filter(Boolean);
  });
}

function exportIcs() {
  const events = buildCalendarEvents();
  if (!events.length) {
    setStatus("No calendar events available to export.");
    return;
  }

  const stamp = formatUtcStamp();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Timpview Football//Spring Ball Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Timpview Spring Ball",
    "X-WR-TIMEZONE:America/Denver",
    ...events.flatMap((event) => [
      "BEGIN:VEVENT",
      `UID:${escapeIcsText(event.uid)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=America/Denver:${event.dtStart}`,
      `DTEND;TZID=America/Denver:${event.dtEnd}`,
      `SUMMARY:${escapeIcsText(event.summary)}`,
      `DESCRIPTION:${escapeIcsText(event.description)}`,
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ];

  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "timpview-spring-ball.ics";
  link.click();
  URL.revokeObjectURL(url);
  setStatus("Calendar exported as .ics.");
}

function render() {
  renderTopTabs();
  renderWeekTabs();
  renderFamilyCards();
  renderCollegeVisits();
  renderCoachDays();
  renderDetail();
  renderCoachSubtabs();
  renderDayViewTabs();
  renderDayViewToolbar();
  renderPositionView();
  renderScripts();
}

function renderTopTabs() {
  topTabs.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === state.activeView;
    button.classList.toggle("is-active", active);
  });

  if (familyView) {
    familyView.classList.toggle("is-hidden", state.activeView !== "family");
  }
  if (visitsView) {
    visitsView.classList.toggle("is-hidden", state.activeView !== "visits");
  }
  if (coachView) {
    coachView.classList.toggle("is-hidden", state.activeView !== "coach");
  }
}

function renderCoachSubtabs() {
  if (state.activeView !== "coach") {
    return;
  }

  coachSubtabs.querySelectorAll("[data-coach-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.coachView === state.coachSubView);
  });

  dayPane.classList.toggle("is-hidden", state.coachSubView !== "day");
  positionPane.classList.toggle("is-hidden", state.coachSubView !== "position");
  scriptsPane.classList.toggle("is-hidden", state.coachSubView !== "scripts");
}

function renderDayViewTabs() {
  if (!dayViewTabs) {
    return;
  }

  dayViewTabs.classList.toggle("is-hidden", state.coachSubView !== "day");
  dayViewTabs.querySelectorAll("[data-day-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.dayView === state.dayViewMode);
  });
}

function renderDayViewToolbar() {
  if (!dayViewToolbar) {
    return;
  }

  const day = getSelectedDay();
  const clipboard = state.clipboard;
  const canPaste =
    Boolean(day) &&
    clipboard?.kind === "day" &&
    clipboard?.mode === state.dayViewMode &&
    clipboard?.sourceDayId !== day?.id;

  dayViewToolbar.innerHTML = `
    <div class="view-toolbar__actions">
      <button class="button button--ghost" id="copy-day-view" type="button">Copy ${escapeHtml(formatDayViewModeLabel(state.dayViewMode))} View</button>
      <button class="button button--ghost" id="paste-day-view" type="button" ${canPaste ? "" : "disabled"}>Paste to Selected Day</button>
    </div>
    <p class="view-toolbar__status">${escapeHtml(getClipboardStatusText("day"))}</p>
  `;

  dayViewToolbar.querySelector("#copy-day-view")?.addEventListener("click", () => {
    copyCurrentDayView();
  });
  dayViewToolbar.querySelector("#paste-day-view")?.addEventListener("click", () => {
    pasteToCurrentDayView();
  });
}

function renderWeekTabs() {
  if (!weekTabs) {
    return;
  }

  const weeks = getWeeks();
  weekTabs.innerHTML = [
    `<button class="${state.selectedWeek === "all" ? "is-active" : ""}" data-week="all" type="button">All Weeks</button>`,
    ...weeks.map(
      (week) =>
        `<button class="${state.selectedWeek === week ? "is-active" : ""}" data-week="${week}" type="button">Week ${week}</button>`,
    ),
  ].join("");

  weekTabs.querySelectorAll("[data-week]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedWeek = button.dataset.week === "all" ? "all" : Number(button.dataset.week);
      if (!getVisibleDays().some((day) => day.id === state.selectedDayId)) {
        state.selectedDayId = getVisibleDays()[0]?.id ?? state.schedule[0]?.id ?? null;
      }
      render();
    });
  });
}

function renderFamilyCards() {
  if (!familyGrid) {
    return;
  }

  const days = getVisibleDays();
  const weekMap = new Map();

  days.forEach((day) => {
    if (!weekMap.has(day.week)) {
      weekMap.set(day.week, []);
    }
    weekMap.get(day.week).push(day);
  });

  familyGrid.innerHTML = [...weekMap.entries()]
    .map(([week, weekDays]) => {
      const cards = weekDays
        .map((day) => {
          const isOffDay = isOffDaySchedule(day);
          const sessions = getPublicFacingSessions(day);
          const practiceNumber = getPracticeNumber(day.id);
          const visibleNotes = isOffDay
            ? day.notes.filter((note) => !/off day|no workout/i.test(note))
            : day.notes;
          const notes = visibleNotes.length
            ? visibleNotes.map((note) => `<span class="note-chip">${escapeHtml(note)}</span>`).join("")
            : "";
          const sessionMarkup = isOffDay
            ? `
                <div class="family-slot family-slot--off">
                  <strong>OFF</strong>
                </div>
                <div class="family-slot family-slot--empty"></div>
              `
            : sessions.length
              ? sessions
                  .map((session, index) => {
                    const slotLabel = getFamilySessionLabel(session, practiceNumber, index);
                    return `
                      <div class="family-slot">
                        <span class="family-slot__tag">${escapeHtml(slotLabel)}</span>
                        <strong>${escapeHtml(formatPublicSessionTime(session))}</strong>
                      </div>
                    `;
                  })
                  .join("")
              : '<div class="family-slot family-slot--empty"></div>';

          return `
            <article class="family-day">
              <div class="family-day__header">
                <span class="family-day__dow">${escapeHtml(getDayName(day.dateLabel))}</span>
                <span class="family-day__date">${escapeHtml(getShortDate(day.dateLabel))}</span>
              </div>
              <div class="family-day__body">
                ${sessionMarkup}
                ${notes ? `<div class="calendar-notes">${notes}</div>` : ""}
              </div>
            </article>
          `;
        })
        .join("");

      return `
        <section class="family-week">
          <div class="family-week__label">Week ${week}</div>
          <div class="family-week__grid">
            ${cards}
          </div>
        </section>
      `;
    })
    .join("");
}

function getFamilySessionLabel(session, practiceNumber, index) {
  if (session.label === "Showcase") {
    return "Showcase";
  }

  if (session.label === "Afternoon Lift" || session.label === "Morning Lift") {
    return session.label;
  }

  if (practiceNumber) {
    return `Practice ${practiceNumber + index}`;
  }

  return session.label;
}

function renderCollegeVisits() {
  const visitDays = state.schedule.flatMap((day) => {
    if (isOffDaySchedule(day)) {
      return [];
    }

    return [
      {
        month: getMonthName(day.dateLabel),
        weekday: getDayName(day.dateLabel).slice(0, 3).toUpperCase(),
        dateNumber: getDateNumber(day.dateLabel),
        sessions: getPublicFacingSessions(day).map((session, index) => ({
          label: getVisitLabel(session, getPracticeNumber(day.id), index),
          timeLabel: formatPublicSessionTime(session),
          detail:
            session.label === "Showcase"
              ? "Participating Schools: Lone Peak, Springville, Maple Mountain, Skyline, Westlake"
              : "",
          location: session.label === "Showcase" ? "@ Timpview Football Field" : "",
        })),
      },
    ];
  });

  const monthMap = new Map();
  visitDays.forEach((day) => {
    if (!monthMap.has(day.month)) {
      monthMap.set(day.month, []);
    }
    monthMap.get(day.month).push(day);
  });

  visitsGrid.innerHTML = [...monthMap.entries()]
    .map(
      ([month, days]) => `
        <section class="visits-month">
          <div class="visits-month__label">${escapeHtml(month)}</div>
          <div class="visits-month__grid">
            ${days
              .map(
                (day) => `
                  <article class="visit-card-poster">
                    <div class="visit-card-poster__meta">
                      <span>${escapeHtml(day.weekday)}</span>
                      <strong>${escapeHtml(day.dateNumber)}</strong>
                    </div>
                    <div class="visit-card-poster__divider"></div>
                    <div class="visit-card-poster__sessions">
                      ${day.sessions
                        .map(
                          (session) => `
                            <div class="visit-card-poster__session">
                              ${session.label === "Showcase" ? "" : `<span>${escapeHtml(session.label)}</span>`}
                              <strong>${escapeHtml(session.timeLabel)}</strong>
                              ${session.detail ? `<p>${escapeHtml(session.detail)}</p>` : ""}
                              ${session.location ? `<p class="visit-card-poster__location">${escapeHtml(session.location)}</p>` : ""}
                            </div>
                          `,
                        )
                        .join("")}
                    </div>
                  </article>
                `,
              )
              .join("")}
          </div>
        </section>
      `,
    )
    .join("");
}

function getPublicFacingSessions(day) {
  if (isShowcaseDay(day)) {
    return [
      {
        label: "Showcase",
        start: "1:00 PM",
        end: "3:00 PM",
        period: "SHOW",
        summary: "Showcase",
      },
    ];
  }

  return buildDaySessions(day);
}

function getMonthName(dateLabel) {
  const parts = dateLabel.split(",");
  const monthDay = parts[1]?.trim() || "";
  return monthDay.split(" ")[0]?.toUpperCase() || "";
}

function getDateNumber(dateLabel) {
  const parts = dateLabel.split(",");
  const monthDay = parts[1]?.trim() || "";
  return monthDay.split(" ")[1] || "";
}

function getVisitLabel(session, practiceNumber, index) {
  if (session.label === "Showcase") {
    return "Showcase";
  }

  if (session.label === "Afternoon Lift" || session.label === "Morning Lift") {
    return session.label;
  }

  return practiceNumber ? `Practice ${practiceNumber + index}` : session.label;
}

function getLiftLabel(timeLabel) {
  const minutes = timeToMinutes(timeLabel);
  return minutes !== null && minutes < 720 ? "Morning Lift" : "Afternoon Lift";
}

function formatPublicSessionTime(session) {
  if (!session?.start) {
    return "TBD";
  }

  if (!session.end || session.start === session.end) {
    return session.start;
  }

  return `${session.start} to ${session.end}`;
}

function getDayName(dateLabel) {
  return dateLabel.split(",")[0] || dateLabel;
}

function getShortDate(dateLabel) {
  const parts = dateLabel.split(",");
  return parts.slice(1).join(",").trim() || dateLabel;
}

function isOffDaySchedule(day) {
  return day.entries.length === 0 && day.notes.some((note) => /off|no workout/i.test(note));
}

function renderCoachDays() {
  dayList.innerHTML = getVisibleDays()
    .map((day) => {
      const selectedClass = day.id === getSelectedDay()?.id ? "is-selected" : "";
      const isOffDay = isOffDaySchedule(day);
      const tagLabel = isOffDay ? "OFF" : escapeHtml(day.dayType || "Schedule");

      return `
        <button class="day-card ${selectedClass} ${isOffDay ? "day-card--off" : ""}" data-day-id="${day.id}" type="button">
          <span class="day-card__week">Week ${day.week}</span>
          <strong>${escapeHtml(day.dateLabel)}</strong>
          <span>${tagLabel}</span>
        </button>
      `;
    })
    .join("");

  dayList.querySelectorAll("[data-day-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedDayId = button.dataset.dayId;
      render();
    });
  });
}

function renderDetail() {
  const day = getSelectedDay();
  if (!day) {
    detailHeader.innerHTML = "";
    noteRow.innerHTML = "";
    timeline.innerHTML = "";
    return;
  }

  const window = getDayWindow(day);
  const namedWindows = getNamedDayWindows(day);
  detailHeader.innerHTML = `
    <div>
      <p class="eyebrow">Selected Day</p>
      <h2>${escapeHtml(day.dateLabel)}</h2>
    </div>
    <div class="detail-pills">
      <span class="pill">Week ${day.week}</span>
      <span class="pill">${escapeHtml(day.dayType || "Schedule")}</span>
      ${
        isShowcaseDay(day)
          ? '<span class="pill pill--navy">Showcase</span>'
          : getPracticeNumber(day.id)
            ? `<span class="pill pill--navy">Practice ${getPracticeNumber(day.id)}</span>`
            : ""
      }
      ${
        namedWindows.length > 1
          ? namedWindows
              .map(
                (namedWindow) => `
                  <span class="pill">${escapeHtml(namedWindow.label)}</span>
                  <span class="pill">${escapeHtml(namedWindow.start)} - ${escapeHtml(namedWindow.end)}</span>
                `,
              )
              .join("")
          : `<span class="pill">${escapeHtml(window.start)} - ${escapeHtml(window.end)}</span>`
      }
    </div>
  `;

  noteRow.innerHTML = day.notes.length
    ? day.notes.map((note) => `<span class="note-chip">${escapeHtml(note)}</span>`).join("")
    : "";

  timeline.innerHTML = day.entries.length
    ? buildDayTable(day, state.dayViewMode)
    : buildDayTable(day, state.dayViewMode);
}

function renderScripts() {
  const day = getSelectedDay();
  if (!day) {
    scriptBoard.innerHTML = "";
    return;
  }

  ensureScriptsForDay(day);

  scriptBoard.innerHTML = `
    <div class="script-board__actions">
      <button class="button button--ghost" id="add-inline-script" type="button">Add Script</button>
    </div>
    ${
      day.scripts.length
        ? day.scripts
      .map(
        (script, index) => `
        <article class="script-sheet">
          <div class="script-sheet__top">
            <div class="script-sheet__meta">
              <label class="script-sheet__field">
                <span>Activity Type</span>
                <input data-script-index="${index}" data-script-field-input="title" type="text" value="${escapeAttribute(script.title)}" />
              </label>
              <label class="script-sheet__field">
                <span>Period</span>
                <input data-script-index="${index}" data-script-field-input="period" type="text" value="${escapeAttribute(script.period)}" />
              </label>
              <label class="script-sheet__field">
                <span>Duration</span>
                <input data-script-index="${index}" data-script-field-input="duration" type="text" value="${escapeAttribute(script.duration)}" />
              </label>
            </div>
            <div class="script-sheet__actions">
              <button class="button button--ghost" data-add-script-rows="${index}" type="button">Add 7 Rows</button>
              <button class="row-delete" data-delete-script-inline="${index}" type="button">Remove</button>
            </div>
          </div>
          <div class="script-sheet__summary">
            <span class="pill pill--navy">${escapeHtml(script.title || "Script")}</span>
            <span class="pill">${escapeHtml(script.period || "-")}</span>
            <span class="pill">${script.rows.length} Rows</span>
          </div>
          <div class="script-sheet__tables">
            ${buildScriptTemplateTable("offense", script, index)}
            ${buildScriptTemplateTable("defense", script, index)}
          </div>
        </article>
      `,
      )
      .join("")
        : `
          <article class="timeline-card timeline-card--empty">
            <strong>No scripts for this day</strong>
            <p>Add a script to start building an offense and defense call sheet for the selected day.</p>
          </article>
        `
    }
  `;

  scriptBoard.querySelector("#add-inline-script")?.addEventListener("click", addInlineScript);
  scriptBoard.querySelectorAll("[data-delete-script-inline]").forEach((button) => {
    button.addEventListener("click", () => {
      const dayRef = getSelectedDay();
      dayRef.scripts.splice(Number(button.dataset.deleteScriptInline), 1);
      saveSchedule();
      render();
    });
  });
  scriptBoard.querySelectorAll("[data-add-script-rows]").forEach((button) => {
    button.addEventListener("click", () => {
      const script = getSelectedDay()?.scripts[Number(button.dataset.addScriptRows)];
      if (!script) {
        return;
      }
      script.rows.push(...buildScriptRows(7));
      saveSchedule("Rows added.");
      render();
    });
  });
  scriptBoard.querySelectorAll("[data-script-field-input]").forEach((input) => {
    input.addEventListener("input", () => handleScriptFieldInput(input));
  });
  scriptBoard.querySelectorAll("[data-script-row-field]").forEach((input) => {
    input.addEventListener("input", () => handleScriptRowInput(input));
  });
}

function buildScriptTemplateTable(side, script, scriptIndex) {
  const isOffense = side === "offense";
  const sectionLabel = isOffense ? "Offense" : "Defense";
  const scoutHeader = isOffense ? "Scout Defense Play" : "Scout Offense Play";
  const callHeader = isOffense ? "Offense Play" : "Defense Play";
  const scoutField = isOffense ? "scoutDefensePlay" : "scoutOffensePlay";
  const callField = isOffense ? "offensePlay" : "defensePlay";

  return `
    <section class="script-template">
      <table>
        <thead>
          <tr class="script-template__section">
            <th colspan="6">${sectionLabel}</th>
          </tr>
          <tr class="script-template__head">
            <th class="script-template__index"></th>
            <th>DN</th>
            <th>DIST</th>
            <th>HASH</th>
            <th>${callHeader}</th>
            <th class="script-template__scout">${scoutHeader}</th>
          </tr>
        </thead>
        <tbody>
          ${script.rows
            .map(
              (row, rowIndex) => `
                <tr>
                  <td class="script-template__index">${rowIndex + 1}</td>
                  <td>${buildScriptCellInput(scriptIndex, rowIndex, "dn", row.dn, "short")}</td>
                  <td>${buildScriptCellInput(scriptIndex, rowIndex, "dist", row.dist, "short")}</td>
                  <td>${buildScriptCellInput(scriptIndex, rowIndex, "hash", row.hash, "short")}</td>
                  <td>${buildScriptCellInput(scriptIndex, rowIndex, callField, row[callField], "wide")}</td>
                  <td class="script-template__scout">${buildScriptCellInput(scriptIndex, rowIndex, scoutField, row[scoutField], "wide")}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </section>
  `;
}

function buildScriptCellInput(scriptIndex, rowIndex, field, value, widthClass) {
  return `<input class="script-template__input script-template__input--${widthClass}" data-script-index="${scriptIndex}" data-row-index="${rowIndex}" data-script-row-field="${field}" type="text" value="${escapeAttribute(value || "")}" />`;
}

function renderPositionView() {
  if (!positionSummary || !positionBoard) {
    return;
  }

  const day = getSelectedDay();

  if (!day) {
    positionSummary.innerHTML = "";
    positionBoard.innerHTML = "";
    return;
  }

  if (isOffDaySchedule(day)) {
    positionSummary.innerHTML = `
      <article class="position-hero">
        <div class="position-hero__main">
          <p class="eyebrow">Position Schedule</p>
          <h3>${escapeHtml(state.selectedGroup)} Room</h3>
        </div>
        <div class="position-hero__side">
          <label class="position-picker position-picker--inline" for="position-select">
            <span>Position Group</span>
            <select id="position-select">
              ${GROUP_LABELS.map(
                (label) =>
                  `<option value="${escapeHtml(label)}"${label === state.selectedGroup ? " selected" : ""}>${escapeHtml(label)}</option>`,
              ).join("")}
            </select>
          </label>
          <div class="position-hero__pills">
            <span class="pill pill--navy">OFF</span>
          </div>
        </div>
      </article>
      <article class="position-stat">
        <span class="position-stat__label">Status</span>
        <strong>OFF</strong>
        <p>${escapeHtml(day.dateLabel)}</p>
      </article>
      <article class="position-stat">
        <span class="position-stat__label">Notes</span>
        <strong>-</strong>
        <p>${escapeHtml(day.notes.join(" • ") || "No workout")}</p>
      </article>
    `;

    document.querySelector("#position-select")?.addEventListener("change", (event) => {
      state.selectedGroup = event.target.value;
      render();
    });

    positionBoard.innerHTML = `
      <article class="timeline-card timeline-card--empty">
        <strong>OFF DAY</strong>
        <p>No position work is scheduled for this day.</p>
      </article>
    `;
    return;
  }

  const positionRows = buildPositionRows(day, state.selectedGroup);
  const consolidatedRows = consolidatePositionRows(positionRows);
  const ownedMinutes = positionRows.reduce((total, row) => total + durationToMinutes(row.duration), 0);
  const firstOwned = positionRows[0];
  const lastOwned = positionRows[positionRows.length - 1];
  const dayWindow = getDayWindow(day);
  const namedWindows = getNamedDayWindows(day);
  const practiceNumber = getPracticeNumber(day.id);

  positionSummary.innerHTML = `
    <article class="position-hero">
      <div class="position-hero__main">
        <p class="eyebrow">Position Schedule</p>
        <h3>${escapeHtml(state.selectedGroup)} Room</h3>
      </div>
      <div class="position-hero__side">
        <label class="position-picker position-picker--inline" for="position-select">
          <span>Position Group</span>
          <select id="position-select">
            ${GROUP_LABELS.map(
              (label) =>
                `<option value="${escapeHtml(label)}"${label === state.selectedGroup ? " selected" : ""}>${escapeHtml(label)}</option>`,
            ).join("")}
          </select>
        </label>
        <div class="position-hero__pills">
          <span class="pill pill--navy">${escapeHtml(day.dayType || "Open")}</span>
          ${isShowcaseDay(day) ? '<span class="pill">Showcase</span>' : practiceNumber ? `<span class="pill">Practice ${practiceNumber}</span>` : ""}
          <span class="pill">${consolidatedRows.length} blocks</span>
          <span class="pill">${ownedMinutes ? `${ownedMinutes} min` : "No timed blocks"}</span>
        </div>
      </div>
    </article>
    <article class="position-stat">
      <span class="position-stat__label">Start</span>
      ${
        namedWindows.length > 1
          ? namedWindows
              .map(
                (namedWindow) => `
                  <strong>${escapeHtml(namedWindow.start || "Open")}</strong>
                  <p>${escapeHtml(namedWindow.label.toUpperCase())}</p>
                `,
              )
              .join("")
          : `
              <strong>${escapeHtml(firstOwned?.time || "Open")}</strong>
              <p>${escapeHtml(String(firstOwned?.activity || "No assignment").toUpperCase())}</p>
            `
      }
    </article>
    <article class="position-stat">
      <span class="position-stat__label">Finish</span>
      ${
        namedWindows.length > 1
          ? namedWindows
              .map(
                (namedWindow) => `
                  <strong>${escapeHtml(namedWindow.end || "Open")}</strong>
                  <p>${escapeHtml(namedWindow.label.toUpperCase())}</p>
                `,
              )
              .join("")
          : `
              <strong>${escapeHtml(dayWindow.end || lastOwned?.time || "Open")}</strong>
              <p>${escapeHtml(String(lastOwned?.activity || "No assignment").toUpperCase())}</p>
            `
      }
    </article>
  `;

  document.querySelector("#position-select")?.addEventListener("change", (event) => {
    state.selectedGroup = event.target.value;
    render();
  });

  if (!consolidatedRows.length) {
    positionBoard.innerHTML = `
      <article class="timeline-card timeline-card--empty">
        <strong>No ${escapeHtml(state.selectedGroup)} ownership yet</strong>
        <p>Add text in the ${escapeHtml(state.selectedGroup)} column from Day View and those blocks will appear here.</p>
      </article>
    `;
  } else {
    positionBoard.innerHTML = `
      <div class="position-list">
        <div class="position-list__header">
          <span>Time</span>
          <span>Period</span>
          <span>What ${escapeHtml(state.selectedGroup)} Does</span>
          <span>Practice Block</span>
          <span>Length</span>
        </div>
        ${consolidatedRows
          .map(
            (row) => `
              <article class="position-row">
                <div class="position-row__time">${escapeHtml(row.timeLabel || row.time || "TBD")}</div>
                <div class="position-row__period">${escapeHtml(row.periodLabel || row.period || "-")}</div>
                <div class="position-row__focus">
                  <strong>${escapeHtml(row.focus)}</strong>
                  <span class="position-row__tag position-row__tag--${escapeHtml(row.scopeClass)}">${escapeHtml(row.scopeLabel)}</span>
                </div>
                <div class="position-row__activity">${escapeHtml(row.activity || "Open block")}</div>
                <div class="position-row__duration">${escapeHtml(row.durationLabel || row.duration || "-")}</div>
              </article>
            `,
          )
          .join("")}
      </div>
    `;
  }
}

function buildDayTable(day, viewMode = "team") {
  const visibleGroups = getDayViewGroups(viewMode);
  const rows = buildDisplayDayEntries(day.entries, 2);
  const compactClass = viewMode === "team" ? "" : " day-table--compact";
  return `
    <div class="day-table-wrap">
      <table class="day-table${compactClass}">
        <thead>
          <tr>
            <th>Per</th>
            <th>Time</th>
            <th>Activity</th>
            ${visibleGroups.map((label) => `<th>${label}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${rows.map((entry, entryIndex) => buildDayTableRow(entry, entryIndex, visibleGroups)).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function buildDayTableRow(entry, entryIndex, visibleGroups) {
  return `
    <tr>
      <td class="day-table__editable" data-entry-index="${entryIndex}" data-entry-field="period">${escapeHtml(entry.period || "")}</td>
      <td class="day-table__editable" data-entry-index="${entryIndex}" data-entry-field="time">${escapeHtml(entry.time || "")}</td>
      <td class="day-table__activity day-table__editable" data-entry-index="${entryIndex}" data-entry-field="activity">${escapeHtml(entry.activity || "")}</td>
      ${visibleGroups.map(
        (label) =>
          `<td class="day-table__editable" data-entry-index="${entryIndex}" data-entry-field="group" data-group-label="${label}">${escapeHtml(
            entry.groups?.[label] || "",
          )}</td>`,
      ).join("")}
    </tr>
  `;
}

function getDayViewGroups(viewMode) {
  if (viewMode === "offense") {
    return ["QB", "WR", "RB", "OL"];
  }

  if (viewMode === "defense") {
    return ["DL", "LB", "S", "CB"];
  }

  return GROUP_LABELS;
}

function buildEmptyDayEntries(count = 2) {
  return Array.from({ length: count }, (_, index) => ({
    period: String(index + 1),
    time: "",
    activity: "",
    duration: "",
    groups: normalizeGroups({}),
  }));
}

function buildDisplayDayEntries(entries, minimumCount = 2) {
  const existingEntries = Array.isArray(entries) ? entries : [];
  if (existingEntries.length >= minimumCount) {
    return existingEntries;
  }

  const paddedEntries = [...existingEntries];
  while (paddedEntries.length < minimumCount) {
    paddedEntries.push({
      period: String(paddedEntries.length + 1),
      time: "",
      activity: "",
      duration: "",
      groups: normalizeGroups({}),
    });
  }

  return paddedEntries;
}

function formatDayViewModeLabel(viewMode) {
  if (viewMode === "offense") {
    return "Offense";
  }

  if (viewMode === "defense") {
    return "Defense";
  }

  return "Team";
}

function getClipboardStatusText(context) {
  const clipboard = state.clipboard;
  if (!clipboard) {
    return "Nothing copied yet.";
  }

  if (context === "day" && clipboard.kind === "day") {
    return `Copied ${formatDayViewModeLabel(clipboard.mode)} View from ${clipboard.sourceLabel}.`;
  }

  return "Clipboard is loaded for a different view.";
}

function copyCurrentDayView() {
  const day = getSelectedDay();
  if (!day) {
    return;
  }

  state.clipboard = {
    kind: "day",
    mode: state.dayViewMode,
    sourceDayId: day.id,
    sourceLabel: day.dateLabel,
    entries: clone(day.entries),
  };
  render();
  setStatus(`Copied ${formatDayViewModeLabel(state.dayViewMode)} View from ${day.dateLabel}.`);
}

function pasteToCurrentDayView() {
  const day = getSelectedDay();
  const clipboard = state.clipboard;
  if (!day || !clipboard || clipboard.kind !== "day" || clipboard.mode !== state.dayViewMode) {
    return;
  }

  const nextEntries = applyDayClipboard(day.entries, clipboard);
  day.entries = nextEntries;
  saveSchedule(`Pasted ${formatDayViewModeLabel(state.dayViewMode)} View to ${day.dateLabel}.`);
  render();
}

function applyDayClipboard(targetEntries, clipboard) {
  if (clipboard.mode === "team") {
    return clone(clipboard.entries);
  }

  const visibleGroups = getDayViewGroups(clipboard.mode);
  const maxLength = Math.max(targetEntries.length, clipboard.entries.length);
  const nextEntries = [];

  for (let index = 0; index < maxLength; index += 1) {
    const sourceEntry = clipboard.entries[index];
    const targetEntry = targetEntries[index];

    if (!sourceEntry && targetEntry) {
      nextEntries.push(clone(targetEntry));
      continue;
    }

    if (sourceEntry && !targetEntry) {
      const groups = normalizeGroups({});
      visibleGroups.forEach((label) => {
        groups[label] = sourceEntry.groups?.[label] || "";
      });
      nextEntries.push({
        period: sourceEntry.period || "",
        time: sourceEntry.time || "",
        activity: sourceEntry.activity || "",
        duration: sourceEntry.duration || "",
        groups,
      });
      continue;
    }

    const mergedEntry = clone(targetEntry);
    mergedEntry.period = sourceEntry.period || "";
    mergedEntry.time = sourceEntry.time || "";
    mergedEntry.activity = sourceEntry.activity || "";
    mergedEntry.duration = sourceEntry.duration || "";
    visibleGroups.forEach((label) => {
      mergedEntry.groups[label] = sourceEntry.groups?.[label] || "";
    });
    nextEntries.push(mergedEntry);
  }

  return nextEntries;
}


function exportJson() {
  const blob = new Blob([JSON.stringify(state.schedule, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "timpview-spring-schedule.json";
  link.click();
  URL.revokeObjectURL(url);
  setStatus("JSON exported.");
}

function resetData() {
  state.schedule = applyPracticeStartTemplate(clone(window.springScheduleSeed));
  state.selectedWeek = "all";
  state.selectedDayId = state.schedule[0]?.id ?? null;
  saveSchedule("Reset to original schedule.");
  render();
}

async function hydrateScheduleFromApi() {
  try {
    const response = await fetch(REMOTE_SCHEDULE_ENDPOINT, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Schedule request failed with ${response.status}.`);
    }

    const payload = await response.json();
    remoteApiAvailable = true;
    if (!Array.isArray(payload.schedule) || !payload.schedule.length) {
      return;
    }

    state.schedule = applyPracticeStartTemplate(normalizeSchedule(payload.schedule));
    state.selectedDayId = getVisibleDays().some((day) => day.id === state.selectedDayId)
      ? state.selectedDayId
      : state.schedule[0]?.id ?? null;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.schedule));
    render();
    setStatus("Loaded latest schedule from the cloud.");
  } catch (error) {
    remoteApiAvailable = false;
    console.warn("Falling back to local spring ball data.", error);
  }
}

function queueRemoteScheduleSave() {
  if (typeof fetch !== "function" || !remoteApiAvailable) {
    return;
  }

  if (remoteSyncTimeout) {
    window.clearTimeout(remoteSyncTimeout);
  }

  remoteSyncTimeout = window.setTimeout(() => {
    remoteSyncTimeout = null;
    remoteSaveInFlight = syncScheduleToApi();
  }, 400);
}

async function syncScheduleToApi() {
  try {
    const response = await fetch(REMOTE_SCHEDULE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ schedule: state.schedule }),
    });

    if (!response.ok) {
      throw new Error(`Schedule save failed with ${response.status}.`);
    }
  } catch (error) {
    console.warn("Cloud schedule save failed.", error);
    setStatus("Saved locally. Cloud sync failed.");
  } finally {
    remoteSaveInFlight = null;
  }
}

function parseCsv(text) {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const cells = [];
      let current = "";
      let inQuotes = false;
      for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        if (character === '"') {
          if (inQuotes && line[index + 1] === '"') {
            current += '"';
            index += 1;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (character === "," && !inQuotes) {
          cells.push(current);
          current = "";
        } else {
          current += character;
        }
      }
      cells.push(current);
      return cells;
    });
}

function parseScheduleCsv(text) {
  const rows = parseCsv(text);
  const blockStarts = [1, 14, 27];
  const parsedDays = [];

  blockStarts.forEach((start, blockIndex) => {
    let currentDay = null;
    rows.forEach((row) => {
      const section = row.slice(start, start + 12);
      const first = (section[0] || "").trim();
      const second = (section[1] || "").trim();

      if (/^(Monday|Tuesday|Wednesday|Thursday|Friday),/.test(first)) {
        currentDay = {
          id: `csv-${blockIndex + 1}-${first.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          week: blockIndex + 1,
          dateLabel: first,
          dayType: second,
          notes: [],
          entries: [],
        };
        parsedDays.push(currentDay);
        return;
      }

      if (!currentDay) {
        return;
      }

      const period = (section[0] || "").trim();
      const time = (section[1] || "").trim();
      const activity = (section[2] || "").trim();
      const groups = GROUP_LABELS.reduce((result, label, index) => {
        result[label] = (section[index + 3] || "").trim();
        return result;
      }, {});
      const duration = (section[11] || "").trim();

      if (period === "PER" || period === "DAY/DATE" || period === "PRACTICE" || period === "PRACTICE #") {
        return;
      }

      if (first === "OFF" || second === "OFF" || activity === "OFF") {
        if (!currentDay.notes.includes("Off day")) {
          currentDay.notes.push("Off day");
        }
        return;
      }

      if (period && time && (activity || duration || Object.values(groups).some(Boolean))) {
        currentDay.entries.push({
          period,
          time,
          activity,
          duration,
          groups: normalizeGroups(groups),
        });
      }
    });
  });

  return normalizeSchedule(parsedDays);
}

function handleFileImport(file, parser, successMessage) {
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const nextSchedule = parser(String(reader.result));
      if (!nextSchedule.length) {
        throw new Error("No days were parsed.");
      }
      state.schedule = normalizeSchedule(nextSchedule);
      state.selectedWeek = "all";
      state.selectedDayId = state.schedule[0]?.id ?? null;
      saveSchedule();
      render();
    } catch (error) {
      console.error(`Import failed: ${error.message}`);
    }
  };
  reader.readAsText(file);
}

function setStatus(message) {
  if (statusMessage) {
    statusMessage.textContent = message;
  }
}

function buildDefaultScripts(entries) {
  const scriptBlocks = [];
  let currentBlock = null;

  entries.forEach((entry) => {
    const scriptType = getScriptTemplateType(entry);
    if (!scriptType) {
      currentBlock = null;
      return;
    }

    const entryMinutes = getEntryMinutes(entry);
    if (currentBlock && currentBlock.type === scriptType) {
      currentBlock.endPeriod = entry.period || currentBlock.endPeriod;
      currentBlock.totalMinutes += entryMinutes;
      return;
    }

    currentBlock = {
      type: scriptType,
      startPeriod: entry.period || "",
      endPeriod: entry.period || "",
      totalMinutes: entryMinutes,
    };
    scriptBlocks.push(currentBlock);
  });

  return scriptBlocks.map((block, index) => ({
    id: `default-script-${index + 1}-${block.startPeriod || "x"}`,
    title: block.type,
    period: formatRangeLabel(block.startPeriod, block.endPeriod),
    duration: formatScriptDuration(block.totalMinutes),
    rows: buildScriptRows(Math.max(7, Math.round(block.totalMinutes / 5) * 7)),
  }));
}

function ensureScriptsForDay(day) {
  if (!day || day.scripts.length || !isPracticeDay(day)) {
    return;
  }

  day.scripts = buildDefaultScripts(day.entries);
  saveSchedule();
}

function addInlineScript() {
  const day = getSelectedDay();
  if (!day) {
    return;
  }

  day.scripts.push({
    id: `script-${Date.now()}`,
    title: "Team",
    period: "",
    duration: "5 min",
    rows: buildScriptRows(7),
  });
  saveSchedule();
  render();
}

function handleDayTableEdit(cell) {
  if (state.dayViewMode === "team") {
    startInlineDayTableEdit(cell);
    return;
  }

  const day = getSelectedDay();
  if (!day) {
    return;
  }

  const entry = day.entries[Number(cell.dataset.entryIndex)];
  if (!entry) {
    return;
  }

  const field = cell.dataset.entryField;
  const currentValue =
    field === "group" ? entry.groups[cell.dataset.groupLabel] || "" : entry[field] || "";
  const nextValue = window.prompt("Edit value", currentValue);
  if (nextValue === null) {
    return;
  }

  if (field === "group") {
    entry.groups[cell.dataset.groupLabel] = nextValue.trim();
  } else {
    entry[field] = nextValue.trim();
  }

  saveSchedule();
  render();
}

function startInlineDayTableEdit(cell) {
  if (!cell || cell.querySelector("input")) {
    return;
  }

  const day = getSelectedDay();
  if (!day) {
    return;
  }

  const entry = ensureDayEntryForIndex(day, Number(cell.dataset.entryIndex));
  if (!entry) {
    return;
  }

  const field = cell.dataset.entryField;
  const currentValue =
    field === "group" ? entry.groups[cell.dataset.groupLabel] || "" : entry[field] || "";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "day-table__input";
  input.value = currentValue;
  input.setAttribute("aria-label", "Edit cell");
  cell.dataset.originalValue = currentValue;
  cell.textContent = "";
  cell.appendChild(input);
  input.focus();
  input.select();

  const commit = () => {
    const nextValue = input.value.trim();
    if (field === "group") {
      entry.groups[cell.dataset.groupLabel] = nextValue;
    } else {
      entry[field] = nextValue;
    }
    saveSchedule("Cell saved.");
    renderDetail();
    renderDayViewTabs();
    renderDayViewToolbar();
  };

  const cancel = () => {
    renderDetail();
    renderDayViewTabs();
    renderDayViewToolbar();
  };

  input.addEventListener(
    "blur",
    () => {
      commit();
    },
    { once: true },
  );

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      input.blur();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      input.remove();
      cancel();
    }
  });
}

function ensureDayEntryForIndex(day, index) {
  if (!day || index < 0) {
    return null;
  }

  while (day.entries.length <= index) {
    day.entries.push({
      period: String(day.entries.length + 1),
      time: "",
      activity: "",
      duration: "",
      groups: normalizeGroups({}),
    });
  }

  if (day.entries.length) {
    day.notes = Array.isArray(day.notes) ? day.notes.filter((note) => !/off day|no workout/i.test(note)) : [];
  }

  return day.entries[index];
}

function handleScriptFieldInput(input) {
  const day = getSelectedDay();
  if (!day) {
    return;
  }

  const script = day.scripts[Number(input.dataset.scriptIndex)];
  if (!script) {
    return;
  }

  const field = input.dataset.scriptFieldInput;
  if (!field) {
    return;
  }

  script[field] = input.value;
  saveSchedule("Script saved.");
}

function handleScriptRowInput(input) {
  const day = getSelectedDay();
  if (!day) {
    return;
  }

  const script = day.scripts[Number(input.dataset.scriptIndex)];
  if (!script) {
    return;
  }

  const row = script.rows?.[Number(input.dataset.rowIndex)];
  const field = input.dataset.scriptRowField;
  if (!row || !field) {
    return;
  }

  row[field] = input.value;
  saveSchedule("Script saved.");
}

function durationToMinutes(value) {
  const match = String(value || "")
    .trim()
    .match(/^(\d+):(\d{2})$/);

  if (!match) {
    return 0;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function durationLabelToMinutes(value) {
  const clockMinutes = durationToMinutes(value);
  if (clockMinutes) {
    return clockMinutes;
  }

  const minuteMatch = String(value || "")
    .trim()
    .match(/^(\d+)\s*min$/i);

  if (minuteMatch) {
    return Number(minuteMatch[1]);
  }

  return 0;
}

function getEntryMinutes(entry) {
  if (shouldHideDuration(entry?.activity)) {
    return 0;
  }

  return durationLabelToMinutes(entry?.duration) || 5;
}

function formatScriptDuration(minutes) {
  return minutes ? `${minutes} min` : "";
}

function getScriptTemplateType(entry) {
  const activity = String(entry?.activity || "").trim();
  const normalizedActivity = activity.toUpperCase();
  const assignments = Object.values(entry?.groups || {}).map((value) => String(value || "").toUpperCase());

  if (
    normalizedActivity === "GROUP" &&
    assignments.some((value) => value.includes("SKELLY"))
  ) {
    return "Skelly";
  }

  if (
    normalizedActivity === "GROUP" &&
    assignments.some((value) => value.includes("INSIDE RUN") || value.includes("1-ON-1"))
  ) {
    return "Inside Run";
  }

  if (normalizedActivity.includes("SKELLY") || normalizedActivity.includes("7-ON-7")) {
    return "Skelly";
  }

  if (normalizedActivity === "HALF LINE") {
    return "Half Line";
  }

  if (normalizedActivity === "TEAM") {
    return "Team";
  }

  if (normalizedActivity.includes("INSIDE RUN")) {
    return "Inside Run";
  }

  return null;
}

function buildPositionRows(day, groupLabel) {
  return day.entries
    .map((entry) => buildPositionRow(entry, groupLabel))
    .filter(Boolean);
}

function buildPositionRow(entry, groupLabel) {
  const activity = String(entry.activity || "").trim();
  const groupAssignment = String(entry.groups?.[groupLabel] || "").trim();
  const normalizedActivity = activity.toUpperCase();

  if (normalizedActivity === "TEAM MEETING") {
    return createPositionRow(entry, {
      focus: "Full Team Meeting",
      activity: "Team Meeting",
      scopeLabel: "Team",
      scopeClass: "shared",
    });
  }

  if (normalizedActivity.startsWith("WARMUP")) {
    return createPositionRow(entry, {
      focus: "Full Team Warmup",
      activity,
      scopeLabel: "Team",
      scopeClass: "shared",
    });
  }

  if (normalizedActivity.startsWith("INDY")) {
    return createPositionRow(entry, {
      focus: `${groupLabel} Indy`,
      activity,
      scopeLabel: "Position",
      scopeClass: "position",
    });
  }

  if (!groupAssignment) {
    if (!activity) {
      return null;
    }

    return createPositionRow(entry, {
      focus: activity,
      activity,
      scopeLabel: "Team",
      scopeClass: "shared",
    });
  }

  return createPositionRow(entry, {
    focus: groupAssignment,
    activity: activity || "Assigned block",
    scopeLabel: "Assigned",
    scopeClass: "assigned",
  });
}

function createPositionRow(entry, { focus, activity, scopeLabel, scopeClass }) {
  const hideDuration = shouldHideDuration(activity);
  return {
    time: entry.time || "",
    period: entry.period || "",
    duration: hideDuration ? "" : entry.duration || "",
    entryMinutes: hideDuration ? 0 : getEntryMinutes(entry),
    focus,
    activity,
    scopeLabel,
    scopeClass,
  };
}

function consolidatePositionRows(rows) {
  if (!rows.length) {
    return [];
  }

  const consolidated = [];

  rows.forEach((row) => {
    const previous = consolidated[consolidated.length - 1];
    const activityGroup = getActivityGroup(row.activity);
    const rowMinutes =
      row.entryMinutes !== undefined && row.entryMinutes !== null
        ? row.entryMinutes
        : durationToMinutes(row.duration) || 5;
    const rowEndTime = addMinutesToTimeLabel(row.time, rowMinutes) || row.time;
    if (
      previous &&
      previous.focus === row.focus &&
      previous.scopeLabel === row.scopeLabel &&
      previous.scopeClass === row.scopeClass &&
      previous.activityGroupKey === activityGroup.key
    ) {
      previous.endTime = rowEndTime;
      previous.endPeriod = row.period;
      previous.activities.push(row.activity);
      previous.totalMinutes += rowMinutes;
      previous.durationLabel = formatDurationMinutes(previous.totalMinutes) || previous.durationLabel;
      previous.timeLabel = shouldUseStartOnlyTime(activityGroup.label)
        ? previous.startTime
        : formatRangeLabel(previous.startTime, previous.endTime);
      previous.periodLabel = formatRangeLabel(previous.startPeriod, previous.endPeriod);
      previous.activity = summarizeActivityRange(previous.activities);
      return;
    }

    consolidated.push({
      ...row,
      startTime: row.time,
      endTime: rowEndTime,
      startPeriod: row.period,
      endPeriod: row.period,
      activities: [row.activity],
      activityGroupKey: activityGroup.key,
      totalMinutes: rowMinutes,
      timeLabel: shouldUseStartOnlyTime(activityGroup.label) ? row.time : formatRangeLabel(row.time, rowEndTime),
      periodLabel: row.period,
      durationLabel: formatDurationMinutes(rowMinutes) || row.duration,
      activity: activityGroup.label,
    });
  });

  return consolidated;
}

function formatRangeLabel(start, end) {
  if (!start || !end || start === end) {
    return start || end || "";
  }

  const startMatch = String(start).match(/^(.*)\s(AM|PM)$/i);
  const endMatch = String(end).match(/^(.*)\s(AM|PM)$/i);

  if (startMatch && endMatch && startMatch[2].toUpperCase() === endMatch[2].toUpperCase()) {
    return `${startMatch[1]}-${end}`;
  }

  return `${start}-${end}`;
}

function addMinutesToTimeLabel(value, minutesToAdd) {
  const match = String(value || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})\s(AM|PM)$/i);

  if (!match || !minutesToAdd) {
    return value || "";
  }

  let hours = Number(match[1]) % 12;
  const minutes = Number(match[2]);
  if (match[3].toUpperCase() === "PM") {
    hours += 12;
  }

  const totalMinutes = (hours * 60 + minutes + minutesToAdd) % (24 * 60);
  const nextHours24 = Math.floor(totalMinutes / 60);
  const nextMinutes = totalMinutes % 60;
  const nextMeridiem = nextHours24 >= 12 ? "PM" : "AM";
  const nextHours12 = nextHours24 % 12 || 12;

  return `${nextHours12}:${String(nextMinutes).padStart(2, "0")} ${nextMeridiem}`;
}

function getEntryEndTime(entry) {
  const start = entry?.time || "";
  const minutes = getEntryMinutes(entry);
  return addMinutesToTimeLabel(start, minutes) || start;
}

function formatDurationMinutes(minutes) {
  if (!minutes) {
    return "";
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}:${String(remainingMinutes).padStart(2, "0")}`;
}

function summarizeActivityRange(activities) {
  const uniqueActivities = [...new Set(activities.filter(Boolean))];
  if (!uniqueActivities.length) {
    return "";
  }

  const normalizedActivities = [...new Set(uniqueActivities.map((activity) => getActivityGroup(activity).label).filter(Boolean))];

  if (normalizedActivities.length === 1) {
    return normalizedActivities[0];
  }

  return normalizedActivities.join(" / ");
}

function normalizeActivityLabel(activity) {
  return String(activity || "")
    .replace(/\s+\d+(?:\s*-\s*\d+)?$/g, "")
    .trim();
}

function shouldHideDuration(activity) {
  return /^(END|END PRACTICE|FINISH)$/i.test(String(activity || "").trim());
}

function shouldUseStartOnlyTime(activity) {
  return /^(END|END PRACTICE|FINISH|WEIGHTS)$/i.test(String(activity || "").trim());
}

function getActivityGroup(activity) {
  const trimmed = String(activity || "").trim();
  const indyMatch = trimmed.match(/^INDY\s+(\d+)$/i);
  if (indyMatch) {
    const bucket = Math.ceil(Number(indyMatch[1]) / 2);
    return {
      key: `INDY-${bucket}`,
      label: `INDY ${bucket}`,
    };
  }

  const normalized = normalizeActivityLabel(trimmed);
  return {
    key: normalized,
    label: normalized,
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

topTabs.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    state.activeView = button.dataset.view;
    render();
  });
});

coachSubtabs.querySelectorAll("[data-coach-view]").forEach((button) => {
  button.addEventListener("click", () => {
    state.coachSubView = button.dataset.coachView;
    render();
  });
});
dayViewTabs?.querySelectorAll("[data-day-view]").forEach((button) => {
  button.addEventListener("click", () => {
    state.dayViewMode = button.dataset.dayView;
    renderDetail();
    renderDayViewTabs();
  });
});
exportIcsButton?.addEventListener("click", exportIcs);
document.querySelector("#export-json")?.addEventListener("click", exportJson);
document.querySelector("#reset-data")?.addEventListener("click", resetData);
document.querySelector("#csv-import")?.addEventListener("change", (event) => {
  handleFileImport(event.target.files[0], parseScheduleCsv, "CSV imported.");
  event.target.value = "";
});
document.querySelector("#json-import")?.addEventListener("change", (event) => {
  handleFileImport(event.target.files[0], (text) => JSON.parse(text), "JSON imported.");
  event.target.value = "";
});

timeline.addEventListener("dblclick", (event) => {
  const cell = event.target.closest(".day-table__editable");
  if (cell) {
    handleDayTableEdit(cell);
  }
});

render();
hydrateScheduleFromApi();
