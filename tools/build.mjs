import fs from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
await fs.mkdir(dist, { recursive: true });
const files = ["search.js", "dom.js", "index.js", "workspace.js", "main.js"];
let bundle = "// Improved Settings: temporary browser verification bundle. Reload removes it.\n";
for (const file of files) {
  const source = await fs.readFile(path.join(root, "scripts", file), "utf8");
  bundle += source.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "") + "\n";
}
const css = await fs.readFile(path.join(root, "styles/improved-settings.css"), "utf8");
bundle = `globalThis.improvedSettingsPreview?.uninstall();\n(() => {\n${bundle}\nconst style = document.getElementById('improved-settings-preview-style') ?? document.createElement('style');\nstyle.id = 'improved-settings-preview-style';\nstyle.textContent = ${JSON.stringify(css)};\ndocument.head.append(style);\nglobalThis.improvedSettingsPreview = install();\n})();`;
await fs.writeFile(path.join(dist, "preview.js"), bundle);
console.log("Built dist/preview.js for temporary verification.");
