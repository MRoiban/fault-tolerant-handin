// Fails the build if dist/ would not run from file:// (e.g. opened straight from the ZIP):
// only index.html (the game) and, when built, report.html (the report), with no external or
// relative script/style/image references.
import { existsSync, readdirSync, readFileSync } from "node:fs";

const allowed = ["index.html", "report.html"];
const files = readdirSync("dist", {
    recursive: true,
    withFileTypes: true,
}).filter((d) => d.isFile());
const problems = [];
const extra = files.filter((f) => !allowed.includes(f.name));
if (extra.length || !existsSync("dist/index.html")) {
    problems.push(
        `dist/ should contain index.html (and report.html), found: ${files.map((f) => f.name).join(", ")}`,
    );
}
const sizes = [];
for (const name of allowed.filter((n) => existsSync(`dist/${n}`))) {
    const html = readFileSync(`dist/${name}`, "utf8");
    for (const m of html.matchAll(
        /<(script|link|img|iframe|source)\b[^>]*>/gi,
    )) {
        const ref = /\b(?:src|href)\s*=\s*"([^"]*)"/i.exec(m[0]);
        if (ref && !ref[1].startsWith("data:"))
            problems.push(`${name}: external reference: ${m[0].slice(0, 120)}`);
    }
    if (
        /https?:\/\/(?!www\.w3\.org)[^\s"')]+\.(?:js|css|woff2?|ttf)\b/i.test(
            html,
        )
    ) {
        problems.push(`${name}: a CDN-looking URL appears in the page`);
    }
    sizes.push(`${name} ${(html.length / 1024).toFixed(0)} KB`);
}
if (problems.length) {
    console.error("verify-dist: FAILED\n  " + problems.join("\n  "));
    process.exit(1);
}
console.log(
    `verify-dist: OK — self-contained, opens from file:// (${sizes.join(", ")})`,
);
