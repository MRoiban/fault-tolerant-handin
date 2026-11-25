// Copies the report page (report/report.html, exported from the report's Typst source) next to
// the game in dist/, so the game's "Read the report" link and the report's level links work.
import { copyFileSync, existsSync } from "node:fs";

if (existsSync("report/report.html")) {
    copyFileSync("report/report.html", "dist/report.html");
    console.log("add-report: copied report/report.html to dist/");
} else {
    console.warn(
        "add-report: no report/report.html yet; dist/ has the game only",
    );
}
