#!/usr/bin/env node
// PreToolUse guard for vercel.json: lets Write/Edit ADD new cron entries
// automatically, but blocks any change that would modify or remove an
// existing cron entry's path/schedule pair — those need explicit permission.
//
// Simulates the resulting file content (Write: tool_input.content; Edit:
// old_string/new_string applied to the file currently on disk) and diffs the
// `crons` array before vs. after by (path, schedule) identity.

let input = "";
process.stdin.on("data", (chunk) => {
  input += chunk;
});

process.stdin.on("end", () => {
  const allow = () => {
    process.stdout.write("{}");
  };
  const deny = (reason) => {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: reason,
        },
      })
    );
  };

  try {
    const fs = require("fs");
    const payload = JSON.parse(input || "{}");
    const filePath = payload.tool_input && payload.tool_input.file_path;

    if (!filePath || !filePath.endsWith("vercel.json")) {
      allow();
      return;
    }

    const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
    let prospective;

    if (payload.tool_name === "Write") {
      prospective = payload.tool_input.content ?? "";
    } else if (payload.tool_name === "Edit") {
      const oldString = payload.tool_input.old_string ?? "";
      const newString = payload.tool_input.new_string ?? "";
      if (payload.tool_input.replace_all) {
        prospective = current.split(oldString).join(newString);
      } else {
        const index = current.indexOf(oldString);
        if (index === -1) {
          deny(
            "Could not locate old_string in vercel.json to simulate this edit; refusing out of caution rather than risk a silent cron change."
          );
          return;
        }
        prospective = current.slice(0, index) + newString + current.slice(index + oldString.length);
      }
    } else {
      allow();
      return;
    }

    let currentJson;
    let prospectiveJson;
    try {
      currentJson = current ? JSON.parse(current) : { crons: [] };
      prospectiveJson = JSON.parse(prospective);
    } catch (parseError) {
      deny(`Resulting vercel.json would not be valid JSON: ${parseError.message}`);
      return;
    }

    const currentCrons = Array.isArray(currentJson.crons) ? currentJson.crons : [];
    const prospectiveCrons = Array.isArray(prospectiveJson.crons) ? prospectiveJson.crons : [];

    const identity = (cron) => `${cron.path}::${cron.schedule}`;
    const prospectiveKeys = new Set(prospectiveCrons.map(identity));

    const removedOrChanged = currentCrons.filter((cron) => !prospectiveKeys.has(identity(cron)));

    if (removedOrChanged.length > 0) {
      deny(
        "This edit would remove or change an existing cron entry (" +
          removedOrChanged.map((cron) => `${cron.path} @ ${cron.schedule}`).join(", ") +
          "). Editing or deleting an existing cron job needs your explicit permission — only adding brand-new entries is auto-allowed."
      );
      return;
    }

    allow();
  } catch (error) {
    deny(`Cron guard hook failed to evaluate the change safely: ${error.message}`);
  }
});
