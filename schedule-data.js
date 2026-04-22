const GROUP_LABELS = ["QB", "WR", "RB", "OL", "DL", "LB", "S", "CB"];

function createEntry(period, time, activity, duration = "0:05", groups = {}) {
  return { period, time, activity, duration, groups };
}

function buildCorePracticeStart() {
  return [
    createEntry("1", "5:30 AM", "TEAM MEETING"),
    createEntry("2", "5:35 AM", "WARMUP"),
    createEntry("3", "5:40 AM", "WARMUP"),
    createEntry("4", "5:45 AM", "Indy 1"),
    createEntry("5", "5:50 AM", "Indy 2"),
    createEntry("6", "5:55 AM", "Indy 3"),
    createEntry("7", "6:00 AM", "Indy 4"),
  ];
}

function createGroupAssignment(offenseLabel, defenseLabel = offenseLabel) {
  return {
    QB: offenseLabel,
    WR: offenseLabel,
    RB: offenseLabel,
    OL: offenseLabel,
    DL: defenseLabel,
    LB: defenseLabel,
    S: defenseLabel,
    CB: defenseLabel,
  };
}

const TEAM_INSTALL_GROUPS = createGroupAssignment("Team Install", "Pursuit");
const INSIDE_RUN_GROUPS = {
  QB: "Inside Run / 1-on-1",
  WR: "1-on-1",
  RB: "Inside Run",
  OL: "Inside Run",
  DL: "Inside Run",
  LB: "Inside Run",
  S: "Inside Run",
  CB: "1-on-1",
};
const SKELLY_GROUPS = {
  QB: "Skelly",
  WR: "Skelly",
  RB: "Skelly",
  OL: "1-on-1",
  DL: "1-on-1",
  LB: "Skelly",
  S: "Skelly",
  CB: "Skelly",
};
const HALF_LINE_GROUPS = createGroupAssignment("Half Line");
const TEAM_ONE_GROUPS = createGroupAssignment("Team 1");
const STRESS_GROUPS = createGroupAssignment("Stress");
const TEAM_TEACH_GROUPS = createGroupAssignment("Team Teach");

function buildStandardEntries({ teamInstall = false, endPractice = false, weights = false } = {}) {
  const entries = [
    ...buildCorePracticeStart(),
    createEntry(
      "8",
      "6:05 AM",
      "",
      "0:05",
      teamInstall ? TEAM_INSTALL_GROUPS : {},
    ),
    createEntry("9", "6:10 AM", ""),
    createEntry("10", "6:15 AM", ""),
    createEntry("11", "6:20 AM", ""),
    createEntry("12", "6:25 AM", ""),
    createEntry("13", "6:30 AM", ""),
    createEntry("14", "6:35 AM", ""),
    createEntry("15", "6:40 AM", ""),
    createEntry("16", "6:45 AM", endPractice ? "END PRACTICE" : ""),
  ];

  if (weights) {
    entries.push(createEntry("4B", "1:00 PM", "WEIGHTS", "1:15"));
    entries.push(createEntry("4B", "2:15 PM", "FINISH", ""));
  }

  return entries;
}

function buildInstallEntries() {
  return [
    ...buildCorePracticeStart(),
    createEntry("8", "6:05 AM", "TEAM INSTALL", "0:05", TEAM_INSTALL_GROUPS),
    createEntry("9", "6:10 AM", "TEAM INSTALL", "0:05", TEAM_INSTALL_GROUPS),
    createEntry("10", "6:15 AM", "TEAM INSTALL", "0:05", createGroupAssignment("Team Install")),
    createEntry("11", "6:20 AM", "TEAM INSTALL", "0:05", createGroupAssignment("Team Install")),
    createEntry("12", "6:25 AM", "TEAM INSTALL", "0:05", createGroupAssignment("Team Install")),
    createEntry("13", "6:30 AM", "TEAM INSTALL", "0:05", createGroupAssignment("Team Install")),
    createEntry("14", "6:35 AM", "TEAM INSTALL", "0:05", createGroupAssignment("Team Install")),
    createEntry("15", "6:40 AM", "TEAM INSTALL", "0:05", createGroupAssignment("Team Install")),
    createEntry("16", "6:45 AM", "END", "0:05"),
  ];
}

function buildCompetitiveEntries({ weights = false, endPractice = false } = {}) {
  const entries = [
    ...buildCorePracticeStart(),
    createEntry("8", "6:05 AM", "COMPETE", "0:05", INSIDE_RUN_GROUPS),
    createEntry("9", "6:10 AM", "COMPETE", "0:05", INSIDE_RUN_GROUPS),
    createEntry("10", "6:15 AM", "7-ON-7 / 1-ON-1", "0:05", SKELLY_GROUPS),
    createEntry("11", "6:20 AM", "7-ON-7 / 1-ON-1", "0:05", SKELLY_GROUPS),
    createEntry("12", "6:25 AM", "HALF LINE", "0:05", HALF_LINE_GROUPS),
    createEntry("13", "6:30 AM", "HALF LINE", "0:05", HALF_LINE_GROUPS),
    createEntry("14", "6:35 AM", "TEAM 1", "0:05", TEAM_ONE_GROUPS),
    createEntry("15", "6:40 AM", "TEAM 1", "0:05", TEAM_ONE_GROUPS),
    createEntry("16", "6:45 AM", endPractice ? "END PRACTICE" : "END", "0:05"),
  ];

  if (weights) {
    entries.push(createEntry("4B", "1:00 PM", "WEIGHTS", "1:15"));
    entries.push(createEntry("4B", "2:15 PM", "FINISH", ""));
  }

  return entries;
}

function buildTuesdayThursdayEntries() {
  return [
    ...buildCorePracticeStart(),
    createEntry("8", "6:05 AM", "Group", "0:05", INSIDE_RUN_GROUPS),
    createEntry("9", "6:10 AM", "Group", "0:05", INSIDE_RUN_GROUPS),
    createEntry("10", "6:15 AM", "Group", "0:05", SKELLY_GROUPS),
    createEntry("11", "6:20 AM", "Group", "0:05", SKELLY_GROUPS),
    createEntry("12", "6:25 AM", "HALF LINE", "0:05"),
    createEntry("13", "6:30 AM", "HALF LINE", "0:05"),
    createEntry("14", "6:35 AM", "TEAM", "0:05"),
    createEntry("15", "6:40 AM", "TEAM", "0:05"),
    createEntry("16", "6:45 AM", "END", "0:05"),
    createEntry("4B", "1:00 PM", "WEIGHTS", "1:15"),
    createEntry("4B", "2:15 PM", "FINISH", ""),
  ];
}

function buildShowcaseEntries() {
  return [
    ...buildCorePracticeStart(),
    createEntry("8", "6:05 AM", "STRESS", "0:05", STRESS_GROUPS),
    createEntry("14", "6:35 AM", "TEAM TEACH", "0:05", TEAM_TEACH_GROUPS),
    createEntry("4B", "1:00 PM", "WEIGHTS", "1:15"),
    createEntry("4B", "2:15 PM", "FINISH", ""),
  ];
}

function replaceLiftEntries(entries, { startTime, finishTime = "", duration = "1:15" }) {
  const nextEntries = entries.filter((entry) => !/^(WEIGHTS|FINISH)$/i.test(String(entry.activity || "").trim()));
  nextEntries.push(createEntry("4B", startTime, "WEIGHTS", duration));
  if (finishTime) {
    nextEntries.push(createEntry("4B", finishTime, "FINISH", ""));
  }
  return nextEntries;
}

function buildStressEntries() {
  return [
    ...buildCorePracticeStart(),
    createEntry("8", "6:05 AM", "STRESS", "0:05", STRESS_GROUPS),
    createEntry("9", "6:10 AM", "", "0:05"),
    createEntry("10", "6:15 AM", "", "0:05"),
    createEntry("11", "6:20 AM", "", "0:05"),
    createEntry("12", "6:25 AM", "", "0:05"),
    createEntry("13", "6:30 AM", "", "0:05"),
    createEntry("14", "6:35 AM", "TEAM TEACH", "0:05", TEAM_TEACH_GROUPS),
    createEntry("15", "6:40 AM", "", "0:05"),
    createEntry("16", "6:45 AM", "", "0:05"),
  ];
}

function createDay({ id, week, dateLabel, dayType, entries, notes = [], scripts = [] }) {
  return { id, week, dateLabel, dayType, entries, notes, scripts };
}

window.springScheduleSeed = [
  createDay({
    id: "spring-2026-04-20",
    week: 1,
    dateLabel: "Monday, April 20",
    dayType: "A DAY",
    entries: buildInstallEntries(),
    notes: [],
  }),
  createDay({
    id: "spring-2026-04-21",
    week: 1,
    dateLabel: "Tuesday, April 21",
    dayType: "B DAY",
    entries: buildTuesdayThursdayEntries(),
    notes: [],
  }),
  createDay({
    id: "spring-2026-04-22",
    week: 1,
    dateLabel: "Wednesday, April 22",
    dayType: "A DAY",
    entries: [],
    notes: ["Off day"],
  }),
  createDay({
    id: "spring-2026-04-23",
    week: 1,
    dateLabel: "Thursday, April 23",
    dayType: "B DAY",
    entries: buildTuesdayThursdayEntries(),
    notes: [],
  }),
  createDay({
    id: "spring-2026-04-24",
    week: 1,
    dateLabel: "Friday, April 24",
    dayType: "A DAY",
    entries: buildStressEntries(),
    notes: [],
  }),
  createDay({
    id: "spring-2026-04-25",
    week: 1,
    dateLabel: "Saturday, April 25",
    dayType: "",
    entries: [
      createEntry("4B", "6:30 AM", "WEIGHTS", "1:30"),
      createEntry("4B", "8:00 AM", "FINISH", ""),
    ],
    notes: [],
  }),
  createDay({
    id: "spring-2026-04-27",
    week: 2,
    dateLabel: "Monday, April 27",
    dayType: "B DAY",
    entries: buildStandardEntries({ teamInstall: true, weights: true }),
    notes: [],
  }),
  createDay({
    id: "spring-2026-04-28",
    week: 2,
    dateLabel: "Tuesday, April 28",
    dayType: "A DAY",
    entries: buildTuesdayThursdayEntries(),
    notes: [],
  }),
  createDay({
    id: "spring-2026-04-29",
    week: 2,
    dateLabel: "Wednesday, April 29",
    dayType: "B DAY",
    entries: [
      createEntry("4B", "1:00 PM", "WEIGHTS", "1:15"),
      createEntry("4B", "2:15 PM", "FINISH", ""),
    ],
    notes: ["AM off"],
  }),
  createDay({
    id: "spring-2026-04-30",
    week: 2,
    dateLabel: "Thursday, April 30",
    dayType: "A DAY",
    entries: buildTuesdayThursdayEntries(),
    notes: [],
  }),
  createDay({
    id: "spring-2026-05-01",
    week: 2,
    dateLabel: "Friday, May 1",
    dayType: "B DAY",
    entries: replaceLiftEntries(buildShowcaseEntries(), {
      startTime: "11:15 AM",
      finishTime: "12:15 PM",
      duration: "1:00",
    }),
    notes: [],
  }),
  createDay({
    id: "spring-2026-05-04",
    week: 3,
    dateLabel: "Monday, May 4",
    dayType: "A DAY",
    entries: buildStandardEntries({ teamInstall: true }),
    notes: [],
  }),
  createDay({
    id: "spring-2026-05-05",
    week: 3,
    dateLabel: "Tuesday, May 5",
    dayType: "B DAY",
    entries: buildTuesdayThursdayEntries(),
    notes: [],
  }),
  createDay({
    id: "spring-2026-05-06",
    week: 3,
    dateLabel: "Wednesday, May 6",
    dayType: "A DAY",
    entries: [],
    notes: ["Off day"],
  }),
  createDay({
    id: "spring-2026-05-07",
    week: 3,
    dateLabel: "Thursday, May 7",
    dayType: "B DAY",
    entries: [createEntry("4B", "1:00 PM", "WEIGHTS", "")],
    notes: [],
  }),
  createDay({
    id: "spring-2026-05-08",
    week: 3,
    dateLabel: "Friday, May 8",
    dayType: "A DAY",
    entries: buildShowcaseEntries(),
    notes: ["Showcase"],
  }),
];
