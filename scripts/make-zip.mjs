// Builds the hand-in ZIP:
//   index.html   the game: the built, self-contained page (open it directly, no server)
//   report.html  the report page, if report/report.html exists
//   source/...   every file git tracks (or would track)
// Run via `npm run zip`.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { zipSync } from "fflate";

const out = "fault-tolerant-k-centre.zip";
const files = { "index.html": readFileSync("dist/index.html") };
if (existsSync("dist/report.html"))
    files["report.html"] = readFileSync("dist/report.html");
else
    console.warn(
        "make-zip: no report/report.html yet: the ZIP has the game only",
    );
const tracked = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    { encoding: "utf8" },
);
for (const path of tracked
    .split("\n")
    .filter((f) => f && !f.endsWith(".zip"))) {
    try {
        files[`source/${path}`] = readFileSync(path);
    } catch {
        // listed by git but deleted locally
    }
}
writeFileSync(out, zipSync(files, { level: 9 }));
console.log(
    `make-zip: wrote ${out} (${Object.keys(files).length} files). Open index.html from it to test.`,
);
