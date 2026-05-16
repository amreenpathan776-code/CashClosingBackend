const fs = require("fs");
const path = require("path");

function writeDailyLog(
  type,
  message
) {

  const now =
    new Date();

  const today =
    now.toLocaleDateString(
      "en-CA",
      {
        timeZone:
          "Asia/Kolkata"
      }
    );

  const time =
    now.toLocaleString(
      "en-IN",
      {
        timeZone:
          "Asia/Kolkata"
      }
    );

  // =========================
  // SUPPORT NESTED FOLDERS
  // =========================

  const parts =
    type.split("/");

  // =========================
  // DIRECTORY
  // =========================

const logDir =
  path.join(
    __dirname,
    "logs",
    ...parts
  );

  // =========================
  // CREATE DIRECTORY
  // =========================

  if (
    !fs.existsSync(logDir)
  ) {

    fs.mkdirSync(
      logDir,
      {
        recursive:true
      }
    );

  }

  // =========================
  // LOG FILE
  // =========================

const fileName =
  parts[parts.length - 1];

const logFile =
  path.join(

    logDir,

    `${today}.${fileName}.log`

  );

  // =========================
  // LOG LINE
  // =========================

  const line =
    `${time} | ${message}\n`;

  fs.appendFileSync(
    logFile,
    line
  );

}

module.exports =
  writeDailyLog;