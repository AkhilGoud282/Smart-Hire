// Tiny JSON-file store so the project runs with zero database setup.
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "data", "candidates.json");
fs.mkdirSync(path.dirname(FILE), { recursive: true });
if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, "[]");

const read = () => JSON.parse(fs.readFileSync(FILE, "utf8"));
const write = (rows) => fs.writeFileSync(FILE, JSON.stringify(rows, null, 2));

module.exports = {
  all: read,
  get: (id) => read().find((c) => c.id === id),
  add(candidate) {
    const rows = read();
    rows.push(candidate);
    write(rows);
    return candidate;
  },
  update(id, patch) {
    const rows = read();
    const i = rows.findIndex((c) => c.id === id);
    if (i === -1) return null;
    rows[i] = { ...rows[i], ...patch };
    write(rows);
    return rows[i];
  },
};
