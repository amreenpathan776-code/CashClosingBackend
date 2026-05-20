require("dotenv").config();

const express = require("express");
const cors = require("cors");
const sql = require("mssql");
const ExcelJS = require("exceljs");

const app = express();

const fs = require("fs");
const https = require("https");

const writeDailyLog =
  require("./logger");
  
  function formatMessage(args) {

  return args.map(a =>

    typeof a === "object"
      ? JSON.stringify(a)
      : a

  ).join(" ");

}

const originalLog =
  console.log;

const originalWarn =
  console.warn;

const originalError =
  console.error;

// ======================
// CONSOLE.LOG
// ======================

console.log = (...args) => {

  writeDailyLog(
    "backend",
    formatMessage(args)
  );

  originalLog(...args);
};

// ======================
// CONSOLE.WARN
// ======================

console.warn = (...args) => {

  writeDailyLog(
    "backend",
    formatMessage(args)
  );

  originalWarn(...args);
};

// ======================
// CONSOLE.ERROR
// ======================

console.error = (...args) => {

  writeDailyLog(
    "backend",
    formatMessage(args)
  );

  originalError(...args);
};

// ======================
// MIDDLEWARE
// ======================

app.use(cors());

app.use(express.json({
  limit: "50mb"
}));

app.use(express.urlencoded({
  extended: true,
  limit: "50mb"
}));

// ======================
// HTTPS CONFIG
// ======================

const httpsOptions = {

  key: fs.readFileSync(
    process.env.SSL_KEY
  ),

  cert: fs.readFileSync(
    process.env.SSL_CERT
  ),

  ca: fs.readFileSync(
    process.env.SSL_CA
  ),

};


// ======================
// DB CONFIG
// ======================

const dbConfig = {

  user: "AdministratorDev",

  password: "Clab@@230830",

  server: "10.0.0.4",

  database: "CashClosing",

  options: {
    encrypt: false,
    trustServerCertificate: true,
  },

};

// ======================
// DB CONNECTION
// ======================

const poolPromise =
  new sql.ConnectionPool(dbConfig)

    .connect()

    .then(pool => {

      console.log(
        "✅ CashClosing DB Connected"
      );

      return pool;

    })

    .catch(err => {

      console.error(
        "❌ DB Connection Error:",
        err.message
      );

    });

// ======================
// HEALTH CHECK
// ======================

app.get("/health", (req, res) => {

  res.send(
    "🚀 Cash Closing Server Running"
  );

});

// ======================
// REGISTER API
// ======================

app.post("/register", async (req, res) => {

  console.log(
    "RAW REGISTER BODY:",
    req.body
  );

  const {
    empNo,
    password,
    mpin,
    deviceId
  } = req.body;

  console.log({

  api: "/register",

  event:
    "REGISTER_API_STARTED",

  empNo,

  deviceId,

  timestamp:
    new Date()
      .toISOString(),

});

  console.log({

    event: "REGISTER_REQUEST",

    empNo,

    timestamp:
      new Date().toISOString(),

  });

  try {

    // ======================
    // VALIDATION
    // ======================

    if (
      !empNo ||
      !password ||
      !mpin ||
      !deviceId
    ) {
console.warn({

  api: "/register",

  event:
    "REGISTER_VALIDATION_FAILED",

  empNo,

  timestamp:
    new Date()
      .toISOString(),

});
      return res.status(400).json({

        success: false,

        message:
          "All fields are required"

      });

    }

    // ======================
    // MPIN VALIDATION
    // ======================

    if (
      !/^\d{4}$/.test(
        String(mpin)
      )
    ) {
console.warn({

  api: "/register",

  event:
    "REGISTER_INVALID_MPIN",

  empNo,

  mpin,

  timestamp:
    new Date()
      .toISOString(),

});
      return res.status(400).json({

        success: false,

        message:
          "MPIN must be exactly 4 digits"

      });

    }

    const pool =
      await poolPromise;

    // ======================
    // EMPLOYEE EXISTS?
    // ======================

  const empCheck =
  await pool.request()

    .input(
      "EmpNo",
      sql.Int,
      Number(empNo)
    )

    .query(`

     SELECT
  [Emp no],
  [Br Code],
  [Branch Name],
  [Designation]

      FROM employees_master

      WHERE [Emp no] = @EmpNo

    `);

    if (
      empCheck.recordset.length === 0
    ) {
console.warn({

  api: "/register",

  event:
    "REGISTER_EMPLOYEE_NOT_FOUND",

  empNo,

  timestamp:
    new Date()
      .toISOString(),

});
      return res.status(403).json({

        success: false,

        message:
          "Unauthorized employee"

      });

    }
// ======================
// BRANCH / DESIGNATION CHECK
// ======================

const employee =
  empCheck.recordset[0];

const branchCode =
  String(
    employee["Br Code"] || ""
  ).trim();
  
const branchName =
  String(
    employee["Branch Name"] || ""
  ).trim();
  
const designation =
  String(
    employee["Designation"] || ""
  )
  .toLowerCase()
  .trim();

// ======================
// BLOCK SUB STAFF IN 9999
// ======================

const isSubStaff =

  designation.includes(
    "sub staff"
  )

  ||

  designation.includes(
    "attender"
  )

  ||

  designation.includes(
    "office boy"
  )

  ||

  designation.includes(
    "house keeping"
  );

// ======================
// ALLOW RULES
// ======================

// ALLOW:
// 1. ALL 9999 USERS
//    EXCEPT SUB STAFF
//
// 2. BRANCH MANAGERS
//    OF OTHER BRANCHES

const allowed9999User =

  branchCode === "9999"
  &&
  !isSubStaff;

const allowedBranchManager =

  branchCode !== "9999"
  &&
  designation.includes(
    "branch manager"
  );

if (

  !allowed9999User
  &&
  !allowedBranchManager

) {

  // ======================
  // SUB STAFF BLOCK
  // ======================

  if (isSubStaff) {

    console.log({

      event:
        "REGISTER_BLOCKED_SUBSTAFF",

      empNo,

      branchCode,

      designation,

      timestamp:
        new Date().toISOString(),

    });

    return res.status(403).json({

      success:false,

      message:

        branchCode === "9999"

        ?

        `You are ${designation.toUpperCase()} in CO branch. Registration is not allowed.`

        :

        `You are ${designation.toUpperCase()} from ${branchName} branch.\n\nRegistration is not allowed.`

    });

  }

  // ======================
  // NON BM BLOCK
  // ======================

  console.log({

    event:
      "REGISTER_BLOCKED_NON_BM",

    empNo,

    branchCode,

    designation,

    timestamp:
      new Date().toISOString(),

  });

  return res.status(403).json({

    success:false,

    message:

      branchCode === "9999"

      ?

      `You are ${designation.toUpperCase()} in CO branch. Registration is not allowed for your designation.`

      :

     `You are ${designation.toUpperCase()} from ${branchName} branch.\n\nOnly Branch Managers are allowed to register from a branch.`

  });

}

    // ======================
    // ALREADY REGISTERED?
    // ======================

    const authCheck =
      await pool.request()

        .input(
          "EmpNo",
          sql.Int,
          Number(empNo)
        )

        .query(`

          SELECT [Emp No.]

          FROM employee_auth

          WHERE [Emp No.] = @EmpNo

        `);

    if (
      authCheck.recordset.length > 0
    ) {
console.warn({

  api: "/register",

  event:
    "REGISTER_ALREADY_EXISTS",

  empNo,

  timestamp:
    new Date()
      .toISOString(),

});
      return res.status(409).json({

        success: false,

        message:
          "Employee already registered"

      });

    }

    // ======================
    // MPIN UNIQUE CHECK
    // ======================

    const mpinCheck =
      await pool.request()

        .input(
          "MPIN",
          sql.VarChar(10),
          mpin
        )

        .query(`

          SELECT TOP 1 [Emp No.]

          FROM employee_auth

          WHERE AppMPIN = @MPIN

        `);

    if (
      mpinCheck.recordset.length > 0
    ) {
console.warn({

  api: "/register",

  event:
    "REGISTER_DUPLICATE_MPIN",

  empNo,

  mpin,

  timestamp:
    new Date()
      .toISOString(),

});
      return res.status(409).json({

        success: false,

        message:
          "MPIN already used"

      });

    }
	
// ======================
// DEVICE UNIQUE CHECK
// ======================

const deviceCheck =
  await pool.request()

    .input(
      "DeviceId",
      sql.VarChar(255),
      deviceId
    )

    .query(`

      SELECT TOP 1
        [Emp No.]

      FROM employee_auth

      WHERE DeviceId = @DeviceId

    `);

if (
  deviceCheck.recordset.length > 0
) {

  console.log({

    event:
      "REGISTER_BLOCKED_DEVICE",

    empNo,

    deviceId,

    timestamp:
      new Date().toISOString(),

  });

  return res.status(409).json({

    success:false,

    message:
      "This device is already registered with another user"

  });

}

console.log({

  api: "/register",

  event:
    "REGISTER_DB_INSERT_STARTED",

  empNo,

  timestamp:
    new Date()
      .toISOString(),

});

    // ======================
    // INSERT USER
    // ======================

    await pool.request()

      .input(
        "EmpNo",
        sql.Int,
        Number(empNo)
      )

      .input(
        "Password",
        sql.VarChar(255),
        password
      )

      .input(
        "MPIN",
        sql.VarChar(10),
        mpin
      )

      .input(
        "DeviceId",
        sql.VarChar(255),
        deviceId
      )

      .query(`

        INSERT INTO employee_auth
        (
          [Emp No.],
          AppPassword,
          AppMPIN,
          DeviceId,
          RegisteredAt,
          FailedAttempts,
          IsLocked
        )

        VALUES
        (
          @EmpNo,
          @Password,
          @MPIN,
          @DeviceId,
          GETDATE(),
          0,
          0
        )

      `);

    console.log({

      event: "REGISTER_SUCCESS",

      empNo,

      timestamp:
        new Date().toISOString(),

    });

    return res.json({

      success: true,

      message:
        "Registration successful"

    });

  }

  catch (err) {

   console.error({

  api: "/register",

  event:
    "REGISTER_API_ERROR",

  empNo,

  error:
    err.message,

  stack:
    err.stack,

  timestamp:
    new Date()
      .toISOString(),

});

    return res.status(500).json({

      success: false,

      message:
        "Server error"

    });

  }

});

// ======================
// LOGIN API
// ======================

app.post("/login", async (req, res) => {

  const mpin =
    String(
      req.body.mpin || ""
    ).trim();

  const deviceId =
    String(
      req.body.deviceId || ""
    ).trim();
console.log({

  api: "/login",

  event:
    "LOGIN_API_STARTED",

  mpin,

  deviceId,

  timestamp:
    new Date()
      .toISOString(),

});
  console.log({

    event: "LOGIN_REQUEST",

    mpin,

    deviceId,

    timestamp:
      new Date().toISOString(),

  });

  try {

    // ======================
    // VALIDATION
    // ======================

    if (
      !mpin ||
      !deviceId
    ) {
console.warn({

  api: "/login",

  event:
    "LOGIN_VALIDATION_FAILED",

  mpin,

  deviceId,

  timestamp:
    new Date()
      .toISOString(),

});
      return res.status(400).json({

        success: false,

        message:
          "All fields required"

      });

    }

    const pool =
      await poolPromise;
console.log({

  api: "/login",

  event:
    "LOGIN_DB_QUERY_STARTED",

  mpin,

  timestamp:
    new Date()
      .toISOString(),

});
    // ======================
    // FIND USER USING MPIN
    // ======================

    const result =
      await pool.request()

        .input(
          "MPIN",
          sql.VarChar(10),
          String(mpin)
        )

        .query(`

          SELECT TOP 1

            ea.[Emp No.],
            ea.AppMPIN,
            ea.DeviceId,
            ea.IsLocked,
            ea.LastLoginAt,

            em.[Employee Name],
            em.[Br Code],
            em.[Branch Name],
            em.[Designation]

          FROM employee_auth ea

          INNER JOIN employees_master em

            ON ea.[Emp No.] =
               em.[Emp no]

          WHERE ea.AppMPIN = @MPIN

        `);

    // ======================
    // INVALID MPIN
    // ======================

    if (
      result.recordset.length === 0
    ) {

console.warn({

  api: "/login",

  event:
    "LOGIN_INVALID_MPIN",

  mpin,

  timestamp:
    new Date()
      .toISOString(),

});

      return res.status(401).json({

        success: false,

        message:
          "Invalid MPIN"

      });

    }

    const user =
      result.recordset[0];

      console.log({

  api: "/login",

  event:
    "LOGIN_USER_FOUND",

  empNo:
    user["Emp No."],

  branch:
    user["Branch Name"],

  designation:
    user["Designation"],

  timestamp:
    new Date()
      .toISOString(),

});

    // ======================
    // ACCOUNT LOCK CHECK
    // ======================

    if (user.IsLocked) {

console.warn({

  api: "/login",

  event:
    "LOGIN_BLOCKED_LOCKED",

  empNo:
    user["Emp No."],

  timestamp:
    new Date()
      .toISOString(),

});
      return res.status(403).json({

        success: false,

        message:
          "Account locked"

      });

    }
// ======================
// DEVICE VALUES
// ======================

const savedDevice =
  String(
    user.DeviceId || ""
  ).trim();

const currentDevice =
  String(
    deviceId || ""
  ).trim();

console.log({

  api: "/login",

  event:
    "LOGIN_DEVICE_CHECK",

  empNo:
    user["Emp No."],

  savedDevice,

  currentDevice,

  timestamp:
    new Date()
      .toISOString(),

});
// ======================
// STRICT DEVICE CHECK
// ======================

if (
  savedDevice !== currentDevice
) {

console.warn({

  api: "/login",

  event:
    "LOGIN_BLOCKED_DEVICE",

  empNo:
    user["Emp No."],

  savedDevice,

  currentDevice,

  timestamp:
    new Date()
      .toISOString(),

});

  return res.status(403).json({

    success: false,

    message:
      "Unauthorized device"

  });

}
    // ======================
    // UPDATE LOGIN TIME
    // ======================

    await pool.request()

      .input(
        "EmpNo",
        sql.Int,
        Number(user["Emp No."])
      )

      .query(`

        UPDATE employee_auth

        SET LastLoginAt = GETDATE()

        WHERE [Emp No.] = @EmpNo

      `);

console.log({

  api: "/login",

  event:
    "LOGIN_SUCCESS",

  empNo:
    user["Emp No."],

  branch:
    user["Branch Name"],

  designation:
    user["Designation"],

  loginTime:
    new Date()
      .toISOString(),

});

    // ======================
    // SUCCESS RESPONSE
    // ======================

    return res.json({

      success: true,

      message:
        "Login successful",

      user: {

        empNo:
          user["Emp No."],

        employeeName:
          user["Employee Name"],

        branchCode:
          user["Br Code"],

        branchName:
          user["Branch Name"],

        designation:
          user["Designation"],

      }

    });

  }

  catch (err) {

console.error({

  api: "/login",

  event:
    "LOGIN_API_ERROR",

  mpin,

  deviceId,

  error:
    err.message,

  stack:
    err.stack,

  timestamp:
    new Date()
      .toISOString(),

});

    return res.status(500).json({

      success: false,

      message:
        "Server error"

    });

  }

});
// ======================
// EMPLOYEE DETAILS API
// ======================

app.get(
  "/employee/:empNo",
  async (req, res) => {

    const { empNo } =
      req.params;
console.log({

  api:
    "/employee/:empNo",

  event:
    "EMPLOYEE_API_STARTED",

  empNo,

  timestamp:
    new Date()
      .toISOString(),

});
    try {

      const pool =
        await poolPromise;
console.log({

  api:
    "/employee/:empNo",

  event:
    "EMPLOYEE_DB_QUERY_STARTED",

  empNo,

  timestamp:
    new Date()
      .toISOString(),

});
      const result =
        await pool.request()

          .input(
            "EmpNo",
            sql.Int,
            Number(empNo)
          )

          .query(`

            SELECT

              [Emp no],

              [Employee Name],

              [Br Code],

              [Branch Name],

              [Designation],

              [Contact Number],

              [Cluster]

            FROM employees_master

            WHERE [Emp no] = @EmpNo

          `);

      if (
        result.recordset.length === 0
      ) {
console.warn({

  api:
    "/employee/:empNo",

  event:
    "EMPLOYEE_NOT_FOUND",

  empNo,

  timestamp:
    new Date()
      .toISOString(),

});
        return res.status(404).json({

          success: false,

          message:
            "Employee not found"

        });

      }
console.log({

  api:
    "/employee/:empNo",

  event:
    "EMPLOYEE_FETCH_SUCCESS",

  empNo,

  employeeName:
    result.recordset[0]
      ["Employee Name"],

  branch:
    result.recordset[0]
      ["Branch Name"],

  designation:
    result.recordset[0]
      ["Designation"],

  timestamp:
    new Date()
      .toISOString(),

});
      return res.json({

        success: true,

        employee:
          result.recordset[0]

      });

    }

    catch (err) {
console.error({

  api:
    "/employee/:empNo",

  event:
    "EMPLOYEE_API_ERROR",

  empNo,

  error:
    err.message,

  stack:
    err.stack,

  timestamp:
    new Date()
      .toISOString(),

});

      return res.status(500).json({

        success: false,

        message:
          "Server error"

      });

    }

  }
);
//================================= SAVE CASH CLOSING =========================
app.post(
  "/save-cash-closing",
  async (req, res) => {

    const {
      empNo,
      amount
    } = req.body;
console.log({

  api:
    "/save-cash-closing",

  event:
    "SAVE_CASH_API_STARTED",

  empNo,

  amount,

  timestamp:
    new Date()
      .toISOString(),

});
    try {

      if (
        !empNo ||
        !amount
      ) {
console.warn({

  api:
    "/save-cash-closing",

  event:
    "SAVE_CASH_VALIDATION_FAILED",

  empNo,

  amount,

  timestamp:
    new Date()
      .toISOString(),

});
        return res.status(400).json({

          success: false,
          message:
            "EmpNo and amount required"

        });

      }

      const pool =
        await poolPromise;

      // ======================
      // GET EMPLOYEE DETAILS
      // ======================

      const empResult =
        await pool.request()

          .input(
            "EmpNo",
            sql.Int,
            Number(empNo)
          )

          .query(`

            SELECT TOP 1

              [Emp no],
              [Employee Name],
              [Br Code],
              [Branch Name],
              [Designation]

            FROM employees_master

            WHERE [Emp no] = @EmpNo

          `);

      if (
        empResult.recordset.length === 0
      ) {
console.warn({

  api:
    "/save-cash-closing",

  event:
    "SAVE_CASH_EMPLOYEE_NOT_FOUND",

  empNo,

  timestamp:
    new Date()
      .toISOString(),

});
        return res.status(404).json({

          success: false,
          message:
            "Employee not found"

        });

      }

      const emp =
        empResult.recordset[0];
		
		// ======================
// MOVE PREVIOUS DAY
// TO HISTORY
// ======================

const oldRecordResult =
  await pool.request()

    .input(
      "EmpNo",
      sql.Int,
      Number(empNo)
    )

    .query(`

      SELECT TOP 1 *

      FROM daily_cash_closing

      WHERE
        [Emp No.] = @EmpNo

        AND EntryDate <
          CAST(GETDATE() AS DATE)

      ORDER BY EntryDate DESC

    `);

if (
  oldRecordResult.recordset.length > 0
) {

  const oldRecord =
    oldRecordResult.recordset[0];

  console.log({

    api:
      "/save-cash-closing",

    event:
      "PREVIOUS_DAY_RECORD_FOUND",

    empNo,

    oldDate:
      oldRecord.EntryDate,

    amount:
      oldRecord.ClosingAmount,

    timestamp:
      new Date()
        .toISOString(),

  });

  // ======================
  // INSERT INTO HISTORY
  // ======================

  await pool.request()

    .input(
      "EntryId",
      sql.Int,
      oldRecord.EntryId
    )

    .input(
      "EmpNo",
      sql.Int,
      oldRecord["Emp No."]
    )

    .input(
      "EmployeeName",
      sql.VarChar(200),
      oldRecord.EmployeeName
    )

    .input(
      "BrCode",
      sql.VarChar(20),
      oldRecord.BrCode
    )

    .input(
      "BranchName",
      sql.VarChar(200),
      oldRecord.BranchName
    )

    .input(
      "Designation",
      sql.VarChar(200),
      oldRecord.Designation
    )

    .input(
      "ClosingAmount",
      sql.Decimal(18,2),
      oldRecord.ClosingAmount
    )

    .input(
      "VersionNo",
      sql.Int,
      oldRecord.VersionNo || 1
    )

    .input(
      "EntryDate",
      sql.Date,
      oldRecord.EntryDate
    )

    .query(`

      INSERT INTO daily_cash_closing_history
      (
        EntryId,
        [Emp No.],
        EmployeeName,
        BrCode,
        BranchName,
        Designation,
        ClosingAmount,
        EntryDate,
        ActionType,
        VersionNo,
        ActionBy
      )

      VALUES
      (
        @EntryId,
        @EmpNo,
        @EmployeeName,
        @BrCode,
        @BranchName,
        @Designation,
        @ClosingAmount,
        @EntryDate,
        'PreviousDay',
        @VersionNo,
        'SYSTEM'
      )

    `);

  console.log({

    api:
      "/save-cash-closing",

    event:
      "PREVIOUS_DAY_MOVED_TO_HISTORY",

    empNo,

    timestamp:
      new Date()
        .toISOString(),

  });

  // ======================
  // DELETE OLD RECORD
  // ======================

  await pool.request()

    .input(
      "EmpNo",
      sql.Int,
      Number(empNo)
    )

    .query(`

      DELETE FROM daily_cash_closing

      WHERE
        [Emp No.] = @EmpNo

        AND EntryDate <
          CAST(GETDATE() AS DATE)

    `);

  console.log({

    api:
      "/save-cash-closing",

    event:
      "PREVIOUS_DAY_DELETED",

    empNo,

    timestamp:
      new Date()
        .toISOString(),

  });

}
		
		
      // ======================
      // CHECK TODAY ENTRY
      // ======================

      const existing =
        await pool.request()

          .input(
            "EmpNo",
            sql.Int,
            Number(empNo)
          )

          .query(`

            SELECT TOP 1 *

            FROM daily_cash_closing

            WHERE
              [Emp No.] = @EmpNo
              AND EntryDate = CAST(GETDATE() AS DATE)

          `);

      // ======================
      // INSERT NEW
      // ======================

      if (
        existing.recordset.length === 0
      ) {
console.log({

  api:
    "/save-cash-closing",

  event:
    "SAVE_CASH_NEW_ENTRY",

  empNo,

  amount,

  branch:
    emp["Branch Name"],

  timestamp:
    new Date()
      .toISOString(),

});
        const insertResult =
          await pool.request()

            .input(
              "EmpNo",
              sql.Int,
              Number(empNo)
            )

            .input(
              "EmployeeName",
              sql.VarChar(200),
              emp["Employee Name"]
            )

            .input(
              "BrCode",
              sql.VarChar(20),
              emp["Br Code"]
            )

            .input(
              "BranchName",
              sql.VarChar(200),
              emp["Branch Name"]
            )

            .input(
              "Designation",
              sql.VarChar(200),
              emp["Designation"]
            )

            .input(
              "ClosingAmount",
              sql.Decimal(18, 2),
              Number(amount)
            )

            .query(`

              INSERT INTO daily_cash_closing
              (
                [Emp No.],
                EmployeeName,
                BrCode,
                BranchName,
                Designation,
                ClosingAmount
              )

              OUTPUT INSERTED.EntryId

              VALUES
              (
                @EmpNo,
                @EmployeeName,
                @BrCode,
                @BranchName,
                @Designation,
                @ClosingAmount
              )

            `);

        const entryId =
          insertResult.recordset[0]
            .EntryId;

        // HISTORY

        await pool.request()

          .input(
            "EntryId",
            sql.Int,
            entryId
          )

          .input(
            "EmpNo",
            sql.Int,
            Number(empNo)
          )

          .input(
            "EmployeeName",
            sql.VarChar(200),
            emp["Employee Name"]
          )

          .input(
            "BrCode",
            sql.VarChar(20),
            emp["Br Code"]
          )

          .input(
            "BranchName",
            sql.VarChar(200),
            emp["Branch Name"]
          )

          .input(
            "Designation",
            sql.VarChar(200),
            emp["Designation"]
          )

          .input(
            "ClosingAmount",
            sql.Decimal(18, 2),
            Number(amount)
          )

          .query(`

            INSERT INTO daily_cash_closing_history
            (
              EntryId,
              [Emp No.],
              EmployeeName,
              BrCode,
              BranchName,
              Designation,
              ClosingAmount,
              EntryDate,
              ActionType,
              VersionNo,
              ActionBy
            )

            VALUES
            (
              @EntryId,
              @EmpNo,
              @EmployeeName,
              @BrCode,
              @BranchName,
              @Designation,
              @ClosingAmount,
              CAST(GETDATE() AS DATE),
              'ADDED',
              1,
              @EmployeeName
            )

          `);
          console.log({

  api:
    "/save-cash-closing",

  event:
    "SAVE_CASH_HISTORY_INSERTED",

  empNo,

  actionType:
    "ADDED",

  version:
    1,

  timestamp:
    new Date()
      .toISOString(),

});
console.log({

  api:
    "/save-cash-closing",

  event:
    "SAVE_CASH_SUCCESS",

  type:
    "INSERT",

  empNo,

  amount,

  timestamp:
    new Date()
      .toISOString(),

});
        return res.json({

          success: true,
          message:
            "Cash closing saved"

        });

      }

      // ======================
      // UPDATE EXISTING
      // ======================

      const current =
        existing.recordset[0];

      const nextVersion =
        Number(
          current.VersionNo || 1
        ) + 1;
console.log({

  api:
    "/save-cash-closing",

  event:
    "SAVE_CASH_UPDATE_STARTED",

  empNo,

  oldAmount:
    current.ClosingAmount,

  newAmount:
    amount,

  currentVersion:
    current.VersionNo,

  nextVersion,

  timestamp:
    new Date()
      .toISOString(),

});
      await pool.request()

        .input(
          "EmpNo",
          sql.Int,
          Number(empNo)
        )

        .input(
          "ClosingAmount",
          sql.Decimal(18, 2),
          Number(amount)
        )

        .input(
          "VersionNo",
          sql.Int,
          nextVersion
        )

        .query(`

          UPDATE daily_cash_closing

          SET
            ClosingAmount =
              @ClosingAmount,

            UpdatedAt =
              GETDATE(),

            VersionNo =
              @VersionNo,

            Status =
              'UPDATED'

          WHERE
            [Emp No.] = @EmpNo
            AND EntryDate =
              CAST(GETDATE() AS DATE)

        `);

      // HISTORY

      await pool.request()

        .input(
          "EntryId",
          sql.Int,
          current.EntryId
        )

        .input(
          "EmpNo",
          sql.Int,
          Number(empNo)
        )

        .input(
          "EmployeeName",
          sql.VarChar(200),
          current.EmployeeName
        )

        .input(
          "BrCode",
          sql.VarChar(20),
          current.BrCode
        )

        .input(
          "BranchName",
          sql.VarChar(200),
          current.BranchName
        )

        .input(
          "Designation",
          sql.VarChar(200),
          current.Designation
        )

        .input(
          "ClosingAmount",
          sql.Decimal(18, 2),
          Number(amount)
        )

        .input(
          "VersionNo",
          sql.Int,
          nextVersion
        )

        .query(`

          INSERT INTO daily_cash_closing_history
          (
            EntryId,
            [Emp No.],
            EmployeeName,
            BrCode,
            BranchName,
            Designation,
            ClosingAmount,
            EntryDate,
            ActionType,
            VersionNo,
            ActionBy
          )

          VALUES
          (
            @EntryId,
            @EmpNo,
            @EmployeeName,
            @BrCode,
            @BranchName,
            @Designation,
            @ClosingAmount,
            CAST(GETDATE() AS DATE),
            'UPDATED',
            @VersionNo,
            @EmployeeName
          )

        `);
        console.log({

  api:
    "/save-cash-closing",

  event:
    "SAVE_CASH_HISTORY_UPDATED",

  empNo,

  version:
    nextVersion,

  timestamp:
    new Date()
      .toISOString(),

});

console.log({

  api:
    "/save-cash-closing",

  event:
    "SAVE_CASH_SUCCESS",

  type:
    "UPDATE",

  empNo,

  amount,

  version:
    nextVersion,

  timestamp:
    new Date()
      .toISOString(),

});
      return res.json({

        success: true,
        message:
          "Cash closing updated"

      });

    }

    catch (err) {

console.error({

  api:
    "/save-cash-closing",

  event:
    "SAVE_CASH_API_ERROR",

  empNo,

  amount,

  error:
    err.message,

  stack:
    err.stack,

  timestamp:
    new Date()
      .toISOString(),

});

      return res.status(500).json({

        success: false,
        message:
          "Server error"

      });

    }

  }
);

//===================== TODAY CASH ENTRY ========================

app.get(
  "/today-cash/:empNo",
  async (req, res) => {

    try {

      const { empNo } =
        req.params;
console.log({

  api:
    "/today-cash/:empNo",

  event:
    "TODAY_CASH_API_STARTED",

  empNo,

  timestamp:
    new Date()
      .toISOString(),

});
      const pool =
        await poolPromise;
console.log({

  api:
    "/today-cash/:empNo",

  event:
    "TODAY_CASH_DB_QUERY_STARTED",

  empNo,

  timestamp:
    new Date()
      .toISOString(),

});
      const result =
        await pool.request()

          .input(
            "EmpNo",
            sql.Int,
            Number(empNo)
          )

          .query(`

SELECT TOP 1

  ClosingAmount,

  CONVERT(
    VARCHAR,
    ActionAt,
    120
  ) AS ActionAt

FROM daily_cash_closing_history

WHERE
  [Emp No.] = @EmpNo

  AND EntryDate =
    CAST(GETDATE() AS DATE)

ORDER BY
  VersionNo DESC,
  ActionAt DESC

          `);
if (
  result.recordset.length === 0
) {

  console.warn({

    api:
      "/today-cash/:empNo",

    event:
      "TODAY_CASH_NOT_FOUND",

    empNo,

    timestamp:
      new Date()
        .toISOString(),

  });

}

else {

  console.log({

    api:
      "/today-cash/:empNo",

    event:
      "TODAY_CASH_FETCH_SUCCESS",

    empNo,

    amount:
      result.recordset[0]
        .ClosingAmount,

    actionAt:
      result.recordset[0]
        .ActionAt,

    timestamp:
      new Date()
        .toISOString(),

  });

}
      return res.json({

        success: true,

        data:
          result.recordset[0] || null

      });

    }

    catch (err) {

console.error({

  api:
    "/today-cash/:empNo",

  event:
    "TODAY_CASH_API_ERROR",

  empNo,

  error:
    err.message,

  stack:
    err.stack,

  timestamp:
    new Date()
      .toISOString(),

});

      return res.status(500).json({

        success: false

      });

    }

  }
);

//=================================LAST SUBMISSION ===================

app.get(
  "/last-submission/:empNo",
  async (req,res)=>{

    try{

      const { empNo }=
        req.params;
console.log({

  api:
    "/last-submission/:empNo",

  event:
    "LAST_SUBMISSION_API_STARTED",

  empNo,

  timestamp:
    new Date()
      .toISOString(),

});
      const pool=
        await poolPromise;
console.log({

  api:
    "/last-submission/:empNo",

  event:
    "LAST_SUBMISSION_DB_QUERY_STARTED",

  empNo,

  timestamp:
    new Date()
      .toISOString(),

});
      const result=
        await pool.request()

          .input(
            "EmpNo",
            sql.Int,
            Number(empNo)
          )

          .query(`

SELECT TOP 1

  ClosingAmount,

  CONVERT(
    VARCHAR,
    ActionAt,
    120
  ) AS ActionAt

FROM daily_cash_closing_history

WHERE
  [Emp No.] = @EmpNo

  AND EntryDate <
    CAST(GETDATE() AS DATE)

  AND ActionType IN
  (
    'ADDED',
    'UPDATED'
  )

ORDER BY
  EntryDate DESC,
  VersionNo DESC,
  ActionAt DESC
          `);
if (
  result.recordset.length === 0
) {

  console.warn({

    api:
      "/last-submission/:empNo",

    event:
      "LAST_SUBMISSION_NOT_FOUND",

    empNo,

    timestamp:
      new Date()
        .toISOString(),

  });

}
else {

  console.log({

    api:
      "/last-submission/:empNo",

    event:
      "LAST_SUBMISSION_FETCH_SUCCESS",

    empNo,

    amount:
      result.recordset[0]
        .ClosingAmount,

    actionAt:
      result.recordset[0]
        .ActionAt,

    timestamp:
      new Date()
        .toISOString(),

  });

}
      return res.json({

        success:true,

        data:
          result.recordset[0] || null

      });

    }

    catch(err){

console.error({

  api:
    "/last-submission/:empNo",

  event:
    "LAST_SUBMISSION_API_ERROR",

  empNo,

  error:
    err.message,

  stack:
    err.stack,

  timestamp:
    new Date()
      .toISOString(),

});

      return res.status(500).json({
        success:false
      });

    }

  }
);
//============================= ADMIN DASHBOARD ========================
app.get(
  "/admin-dashboard",
  async (req,res)=>{
console.log({

  api:
    "/admin-dashboard",

  event:
    "ADMIN_DASHBOARD_API_STARTED",

  timestamp:
    new Date()
      .toISOString(),

});
    try{

      const pool=
        await poolPromise;
console.log({

  api:
    "/admin-dashboard",

  event:
    "ADMIN_DASHBOARD_DB_CONNECTED",

  timestamp:
    new Date()
      .toISOString(),

});


      // ======================
      // SUBMITTED
      // ======================

      const submittedResult=
        await pool.request()

          .query(`

            SELECT
              COUNT(DISTINCT BrCode)
                AS SubmittedCount,

              ISNULL(
                SUM(ClosingAmount),
                0
              ) AS TotalAmount

            FROM daily_cash_closing

            WHERE EntryDate =
              CAST(GETDATE() AS DATE)

          `);

      // ======================
      // SUBMITTED BRANCHES
      // ======================

      const submittedBranches=
        await pool.request()

          .query(`

SELECT

  d.BrCode,

  d.BranchName,

  d.ClosingAmount
    AS Amount,

  FORMAT(
    h.ActionAt,
    'dd/MM/yyyy, h:mm tt'
  ) AS SubmittedAt

FROM daily_cash_closing d

OUTER APPLY (

  SELECT TOP 1
    ActionAt

  FROM daily_cash_closing_history h

  WHERE
    h.[Emp No.] = d.[Emp No.]

    AND h.EntryDate = d.EntryDate

  ORDER BY
    h.VersionNo DESC,
    h.ActionAt DESC

) h

WHERE d.EntryDate =
  CAST(GETDATE() AS DATE)

ORDER BY d.ClosingAmount DESC

          `);
console.log({

  api:
    "/admin-dashboard",

  event:
    "ADMIN_DASHBOARD_SUBMITTED_BRANCHES_FETCHED",

  count:
    submittedBranches
      .recordset.length,

  timestamp:
    new Date()
      .toISOString(),

});
      // ======================
      // HIGHEST
      // ======================

      const highest=
        submittedBranches.recordset[0]
        || null;

      // ======================
      // LOWEST
      // ======================

      const lowest=
        submittedBranches.recordset[
          submittedBranches.recordset
            .length - 1
        ] || null;

      // ======================
      // TOTAL BRANCHES
      // ======================

      const totalBranches=
        await pool.request()

          .query(`
SELECT
  COUNT(DISTINCT [Br Code])
    AS TotalBranches

FROM employees_master

WHERE [Br Code] <> '9999'

          `);
console.log({

  api:
    "/admin-dashboard",

  event:
    "ADMIN_DASHBOARD_SUBMITTED_FETCHED",

  submittedBranches:
    submittedResult
      .recordset[0]
      .SubmittedCount,

  totalAmount:
    submittedResult
      .recordset[0]
      .TotalAmount,

  timestamp:
    new Date()
      .toISOString(),

});
      const submittedCount=
        submittedResult.recordset[0]
          .SubmittedCount;

      const totalBranchCount=
        totalBranches.recordset[0]
          .TotalBranches;

      const pendingCount=
        totalBranchCount -
        submittedCount;
console.log({

  api:
    "/admin-dashboard",

  event:
    "ADMIN_DASHBOARD_PENDING_FETCHED",

  totalBranches:
    totalBranchCount,

  pendingBranches:
    pendingCount,

  timestamp:
    new Date()
      .toISOString(),

});
      // ======================
      // PENDING BRANCHES
      // ======================

      const pendingBranches=
        await pool.request()

          .query(`

          SELECT

  MIN(em.[Br Code])
    AS BrCode,

  MIN(em.[Branch Name])
    AS BranchName

            FROM employees_master em

            WHERE
  em.[Br Code] <> '9999'

  AND em.[Br Code]
  NOT IN (

              SELECT DISTINCT BrCode

              FROM daily_cash_closing

              WHERE EntryDate =
                CAST(GETDATE() AS DATE)

            )
GROUP BY
  em.[Br Code]

ORDER BY
  MIN(em.[Branch Name])

          `);
console.log({

  api:
    "/admin-dashboard",

  event:
    "ADMIN_DASHBOARD_PENDING_BRANCHES_FETCHED",

  count:
    pendingBranches
      .recordset.length,

  timestamp:
    new Date()
      .toISOString(),

});

console.log({

  api:
    "/admin-dashboard",

  event:
    "ADMIN_DASHBOARD_SUCCESS",

  submitted:
    submittedCount,

  pending:
    pendingCount,

  totalAmount:
    submittedResult
      .recordset[0]
      .TotalAmount,

  average:
    submittedCount > 0

      ?

      (
        submittedResult
          .recordset[0]
          .TotalAmount

        / submittedCount
      )

      : 0,

  timestamp:
    new Date()
      .toISOString(),

});
      return res.json({

        success:true,

summary:{
  submitted:
    submittedCount,

  pending:
    pendingCount,

  amount:
    submittedResult
      .recordset[0]
      .TotalAmount,

  average:

    submittedCount > 0

    ?

    (
      submittedResult
        .recordset[0]
        .TotalAmount

      / submittedCount
    )

    : 0,
},

        submittedBranches:
          submittedBranches.recordset,

        pendingBranches:
          pendingBranches.recordset,

        highest,

        lowest,

      });

    }

    catch(err){

console.error({

  api:
    "/admin-dashboard",

  event:
    "ADMIN_DASHBOARD_API_ERROR",

  error:
    err.message,

  stack:
    err.stack,

  timestamp:
    new Date()
      .toISOString(),

});

      return res.status(500).json({
        success:false
      });

    }

  }
);

//=========================== BRANCH CONTACTS =================================
app.get(
  "/branch-contacts/:branchCode",
  async (req,res)=>{

    let branchCode = null;

    try{

      branchCode =
        req.params.branchCode;
        
console.log({

  api:
    "/branch-contacts/:branchCode",

  event:
    "BRANCH_CONTACTS_API_STARTED",

  branchCode,

  timestamp:
    new Date()
      .toISOString(),

});
      const pool=
        await poolPromise;
console.log({

  api:
    "/branch-contacts/:branchCode",

  event:
    "BRANCH_CONTACTS_DB_CONNECTED",

  branchCode,

  timestamp:
    new Date()
      .toISOString(),

});
      const result=
        await pool.request()

          .input(
            "BrCode",
            sql.VarChar(20),
            branchCode
          )

          .query(`

            SELECT

              [Employee Name]
                AS EmployeeName,

              [Designation]
                AS Designation,

              [Contact Number]
                AS Phone

            FROM employees_master

            WHERE [Br Code] =
              @BrCode

            ORDER BY Designation

          `);
console.log({

  api:
    "/branch-contacts/:branchCode",

  event:
    "BRANCH_CONTACTS_FETCH_SUCCESS",

  branchCode,

  contactsCount:
    result.recordset.length,

  timestamp:
    new Date()
      .toISOString(),

});

if (
  result.recordset.length === 0
) {

  console.warn({

    api:
      "/branch-contacts/:branchCode",

    event:
      "BRANCH_CONTACTS_NOT_FOUND",

    branchCode,

    timestamp:
      new Date()
        .toISOString(),

  });

}
      return res.json({

        success:true,

        contacts:
          result.recordset

      });

    }

    catch(err){

console.error({

  api:
    "/branch-contacts/:branchCode",

  event:
    "BRANCH_CONTACTS_API_ERROR",

  branchCode,

  error:
    err.message,

  stack:
    err.stack,

  timestamp:
    new Date()
      .toISOString(),

});

      return res.status(500).json({
        success:false
      });

    }

  }
);

//================================================DASH BOARD======================================

app.post("/api/cash-closing-dashboard", async (req, res) => {

  try {

    const {
      cluster,
      branch,
      fromDate,
      toDate,
      status
    } = req.body;
	
	console.log({

  api: "/api/cash-closing-dashboard",

  event:
    "CASH_CLOSING_DASHBOARD_API_STARTED",

  filters: {
    cluster,
    branch,
    fromDate,
    toDate,
    status
  },

  timestamp:
    new Date()
      .toISOString(),

});

    const pool = await poolPromise;
	
	console.log({

  api: "/api/cash-closing-dashboard",

  event:
    "CASH_CLOSING_DASHBOARD_DB_CONNECTED",

  timestamp:
    new Date()
      .toISOString(),

});

    const request = pool.request();

    request.input("cluster", sql.VarChar, cluster || null);

    request.input("branch", sql.VarChar, branch || null);

    request.input("fromDate", sql.Date, fromDate || null);

    request.input("toDate", sql.Date, toDate || null);

    request.input("status", sql.VarChar, status || null);

    // ======================
    // DASHBOARD DATA
    // ======================
	
	console.log({

  api: "/api/cash-closing-dashboard",

  event:
    "CASH_CLOSING_DASHBOARD_QUERY_STARTED",

  filters: {
    cluster,
    branch,
    fromDate,
    toDate,
    status
  },

  timestamp:
    new Date()
      .toISOString(),

});

    const result = await request.query(`

WITH LatestClosing AS (

    SELECT

        d.[Emp No.] AS EmpNo,

        d.[ClosingAmount],

        d.[EntryDate],

        d.[ActionAt],

        ROW_NUMBER() OVER (

            PARTITION BY
                d.[Emp No.],
                d.[EntryDate]

            ORDER BY
                d.[VersionNo] DESC,
                d.[ActionAt] DESC

        ) AS rn

    FROM daily_cash_closing_history d

    WHERE d.EntryDate BETWEEN

        ISNULL(@fromDate, CAST(GETDATE() AS DATE))

    AND

        ISNULL(@toDate, CAST(GETDATE() AS DATE))

)

SELECT

    e.[Cluster] AS cluster,

    e.[Br Code] AS brCode,

    e.[Branch Name] AS branchName,

    e.[Emp no] AS empId,

    e.[Employee Name] AS manager,

    ISNULL(l.[ClosingAmount], 0) AS closingAmount,

    CONVERT(VARCHAR, l.[EntryDate], 103) AS entryDate

FROM employees_master e

LEFT JOIN LatestClosing l
ON e.[Emp no] = l.EmpNo
AND l.rn = 1

WHERE e.[Designation] = 'Branch Manager'

AND (

    @cluster IS NULL
    OR @cluster = ''
    OR e.[Cluster] = @cluster

)

AND (

    @branch IS NULL
    OR @branch = ''
    OR e.[Branch Name] = @branch

)

AND (

    @status IS NULL
    OR @status = ''

    OR (

        @status = 'Completed'
        AND ISNULL(l.[ClosingAmount], 0) > 0

    )

    OR (

        @status = 'Pending'
        AND ISNULL(l.[ClosingAmount], 0) = 0

    )

)

ORDER BY CAST(e.[Br Code] AS INT) ASC

`);

console.log({

  api: "/api/cash-closing-dashboard",

  event:
    "CASH_CLOSING_DASHBOARD_DATA_FETCHED",

  totalRecords:
    result.recordset.length,

  timestamp:
    new Date()
      .toISOString(),

});

    // ======================
    // CLUSTER DROPDOWN
    // ======================

    const clusterResult = await pool.request().query(`

      SELECT DISTINCT [Cluster]

      FROM employees_master

      WHERE [Cluster] IS NOT NULL

      ORDER BY [Cluster]

    `);
	
	console.log({

  api: "/api/cash-closing-dashboard",

  event:
    "CASH_CLOSING_CLUSTER_FETCHED",

  totalClusters:
    clusterResult.recordset.length,

  timestamp:
    new Date()
      .toISOString(),

});

    // ======================
    // BRANCH DROPDOWN
    // ======================

    const branchResult = await pool.request().query(`

      SELECT DISTINCT

    LTRIM(RTRIM([Cluster])) AS cluster,

    LTRIM(RTRIM([Branch Name])) AS branchName

FROM employees_master

WHERE [Branch Name] IS NOT NULL

AND LTRIM(RTRIM([Branch Name])) NOT IN ('Corporate Office', 'CO', 'Nidadavolu')

ORDER BY branchName

    `);
	
	console.log({

  api: "/api/cash-closing-dashboard",

  event:
    "CASH_CLOSING_BRANCH_FETCHED",

  totalBranches:
    branchResult.recordset.length,

  timestamp:
    new Date()
      .toISOString(),

});

    // ======================
    // FINAL RESPONSE
    // ======================
	
	console.log({

  api: "/api/cash-closing-dashboard",

  event:
    "CASH_CLOSING_DASHBOARD_SUCCESS",

  totalRecords:
    result.recordset.length,

  filters: {
    cluster,
    branch,
    fromDate,
    toDate,
    status
  },

  timestamp:
    new Date()
      .toISOString(),

});

    res.json({

      tableData: result.recordset,

      clusters: clusterResult.recordset.map(
        item => item.Cluster
      ),

      branches: branchResult.recordset

    });

  } catch (err) {

    console.error({

  api: "/api/cash-closing-dashboard",

  event:
    "CASH_CLOSING_DASHBOARD_ERROR",

  filters: {
    cluster,
    branch,
    fromDate,
    toDate,
    status
  },

  error:
    err.message,

  stack:
    err.stack,

  timestamp:
    new Date()
      .toISOString(),

});

    res.status(500).json({
      error: "Server Error"
    });

  }

});



//================================================Export Excel======================================


app.post("/api/cash-closing-dashboard-export", async (req, res) => {

  try {

    const {
  cluster,
  branch,
  fromDate,
  toDate,
  status
} = req.body;

console.log({

  api:
    "/api/cash-closing-dashboard-export",

  event:
    "CASH_CLOSING_EXPORT_STARTED",

  filters: {
    cluster,
    branch,
    fromDate,
    toDate,
    status
  },

  timestamp:
    new Date()
      .toISOString(),

});

    const pool = await poolPromise;
	
	console.log({

  api:
    "/api/cash-closing-dashboard-export",

  event:
    "CASH_CLOSING_EXPORT_DB_CONNECTED",

  timestamp:
    new Date()
      .toISOString(),

});

    const request = pool.request();

    request.input("fromDate", sql.Date, fromDate || null);
    request.input("toDate", sql.Date, toDate || null);
    request.input("status", sql.VarChar, status || null);
	request.input("cluster", sql.VarChar, cluster || null);
    request.input("branch", sql.VarChar, branch || null);
	
	console.log({

  api:
    "/api/cash-closing-dashboard-export",

  event:
    "CASH_CLOSING_EXPORT_QUERY_STARTED",

  filters: {
    cluster,
    branch,
    fromDate,
    toDate,
    status
  },

  timestamp:
    new Date()
      .toISOString(),

});

    const result = await request.query(`
WITH LatestClosing AS (

    SELECT

        d.[Emp No.] AS EmpNo,

        d.[ClosingAmount],

        d.[ActionAt],

        d.[EntryDate],

        d.[ActionType],

        ROW_NUMBER() OVER (

            PARTITION BY
                d.[Emp No.],
                CAST(d.[EntryDate] AS DATE)

            ORDER BY d.[VersionNo] DESC

        ) AS rn

    FROM daily_cash_closing_history d

    WHERE

        CAST(d.[EntryDate] AS DATE)

        BETWEEN
            ISNULL(@fromDate, CAST(GETDATE() AS DATE))
        AND
            ISNULL(@toDate, CAST(GETDATE() AS DATE))

        AND d.[ActionType] != 'PreviousDay'

)

SELECT

    e.[Cluster] AS cluster,
    e.[Br Code] AS brCode,
    e.[Branch Name] AS branchName,
    e.[Emp no] AS empId,
    e.[Employee Name] AS manager,

    ISNULL(l.[ClosingAmount], 0) AS closingAmount,

    CONVERT(VARCHAR, l.[EntryDate], 103) AS entryDate

FROM employees_master e

LEFT JOIN LatestClosing l
ON e.[Emp no] = l.EmpNo
AND l.rn = 1

WHERE e.[Designation] = 'Branch Manager'

AND (

    @cluster IS NULL

    OR @cluster = ''

    OR e.[Cluster] = @cluster

)

AND (

    @branch IS NULL

    OR @branch = ''

    OR e.[Branch Name] = @branch

)

AND (

    @status IS NULL

    OR @status = ''

    OR (

        @status = 'Completed'

        AND ISNULL(l.[ClosingAmount], 0) > 0

    )

    OR (

        @status = 'Pending'

        AND ISNULL(l.[ClosingAmount], 0) = 0

    )

)

ORDER BY CAST(e.[Br Code] AS INT) ASC

`);

console.log({

  api:
    "/api/cash-closing-dashboard-export",

  event:
    "CASH_CLOSING_EXPORT_DATA_FETCHED",

  totalRecords:
    result.recordset.length,

  timestamp:
    new Date()
      .toISOString(),

});

    const workbook = new ExcelJS.Workbook();
	
	console.log({

  api:
    "/api/cash-closing-dashboard-export",

  event:
    "CASH_CLOSING_EXPORT_WORKBOOK_CREATED",

  timestamp:
    new Date()
      .toISOString(),

});

    const worksheet = workbook.addWorksheet("Cash Closing");

    worksheet.columns = [

      { header: "S. No", key: "sno", width: 10 },
      { header: "Date", key: "entryDate", width: 15 },
      { header: "Cluster", key: "cluster", width: 20 },
      { header: "Br Code", key: "brCode", width: 12 },
      { header: "Branch Name", key: "branchName", width: 25 },
      { header: "Emp ID", key: "empId", width: 12 },
      { header: "Branch Manager", key: "manager", width: 30 },
      { header: "Closing Amount", key: "closingAmount", width: 20 }

    ];

    let totalAmount = 0;

    result.recordset.forEach((item, index) => {

  totalAmount += Number(item.closingAmount || 0);

  worksheet.addRow({

    sno: index + 1,

    entryDate:
      item.entryDate ||

      (fromDate
        ? new Date(fromDate).toLocaleDateString("en-GB")
        : new Date().toLocaleDateString("en-GB")),

    cluster: item.cluster,

    brCode: item.brCode,

    branchName: item.branchName,

    empId: item.empId,

    manager: item.manager,

    closingAmount:
  Number(item.closingAmount) > 0
    ? Number(item.closingAmount)
    : "Pending"

  });

});

worksheet.addRow({

  sno: "",
  entryDate: "",
  cluster: "",
  brCode: "",
  branchName: "",
  empId: "",
  manager: "TOTAL",
  closingAmount: Number(totalAmount)

});

worksheet.getRow(1).font = {
  bold: true,
  color: { argb: "FFFFFF" }
};

worksheet.getRow(1).fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "1E293B" }
};

worksheet.getRow(1).alignment = {
  vertical: "middle",
  horizontal: "center"
};

worksheet.eachRow((row) => {

  row.eachCell((cell) => {

    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" }
    };

  });

});

const totalRowNumber = worksheet.lastRow.number;
worksheet.getColumn("closingAmount").numFmt = '#,##0';

worksheet.getRow(totalRowNumber).font = {
  bold: true
};

worksheet.getRow(totalRowNumber).fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "E2E8F0" }
};

worksheet.getRow(totalRowNumber).alignment = {
  vertical: "middle",
  horizontal: "right"
};

    const today = new Date();

    const formattedDate =
      today.getDate().toString().padStart(2, "0") +
      "-" +
      (today.getMonth() + 1).toString().padStart(2, "0") +
      "-" +
      today.getFullYear();

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Cash Closing ${formattedDate}.xlsx`
    );
	
	console.log({

  api:
    "/api/cash-closing-dashboard-export",

  event:
    "CASH_CLOSING_EXPORT_FILE_GENERATED",

  totalRecords:
    result.recordset.length,

  totalAmount,

  timestamp:
    new Date()
      .toISOString(),

});

    await workbook.xlsx.write(res);

    res.end();
	
	console.log({

  api:
    "/api/cash-closing-dashboard-export",

  event:
    "CASH_CLOSING_EXPORT_SUCCESS",

  timestamp:
    new Date()
      .toISOString(),

});

  } catch (err) {

    console.error({

  api:
    "/api/cash-closing-dashboard-export",

  event:
    "CASH_CLOSING_EXPORT_ERROR",

  filters: {
    cluster,
    branch,
    fromDate,
    toDate,
    status
  },

  error:
    err.message,

  stack:
    err.stack,

  timestamp:
    new Date()
      .toISOString(),

});

    res.status(500).json({
      error: "Export Error"
    });

  }

});



// ======================
// FRONTEND LOG API
// ======================

app.post(
  "/api/frontend-log",
  async (req, res) => {

    try {

      const {
        source,
        message
      } = req.body;

      writeDailyLog(
        source,
        message
      );

      return res.json({
        success: true
      });

    }

    catch (err) {

      console.error({

        api:
          "/api/frontend-log",

        event:
          "FRONTEND_LOG_API_ERROR",

        error:
          err.message,

        stack:
          err.stack,

        timestamp:
          new Date()
            .toISOString(),

      });

      return res.status(500).json({

        success: false

      });

    }

  }
);



// ======================
// START SERVER
// ======================

const PORT = 5003;

https.createServer(

  httpsOptions,

  app

).listen(5003, () => {

  console.log(
    "🚀 HTTPS Server Running On 5003"
  );

});