// Iterates over the projects in README.md and appends "updated x ago" to each one.
//
// Every list item between these markers that links to a GitHub repo gets a <sub>updated …</sub> suffix,
// based on the latest commit on the repo's default branch:
//   <!-- projects:start -->
//   - [Percy](https://github.com/tobiasdossinger/Percy) — Description.
//   <!-- projects:end -->

import { readFile, writeFile } from "node:fs/promises";

const README = "README.md";
const BLOCK = /(<!--\s*projects:start\s*-->)([\s\S]*?)(<!--\s*projects:end\s*-->)/g;
const PROJECT = /^\s*[*-]\s+\[[^\]]+\]\(https:\/\/github\.com\/([\w.-]+\/[\w.-]+?)\/?\)/;
const SUFFIX = /\s*<sub>updated [^<]*<\/sub>\s*$/;
const DAY = 24 * 60 * 60 * 1000;

async function lastCommitDate(repo) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "readme-updater" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const res = await fetch(`https://api.github.com/repos/${repo}/commits?per_page=1`, { headers });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${repo}: ${await res.text()}`);

  const [commit] = await res.json();
  return new Date(commit.commit.committer.date);
}

function timeAgo(date, now = new Date()) {
  const days = Math.floor((now - date) / DAY);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? "1 month ago" : `${months} months ago`;

  const years = Math.floor(days / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

const readme = await readFile(README, "utf8");

const repos = new Set();
for (const [, , body] of readme.matchAll(BLOCK)) {
  for (const line of body.split("\n")) {
    const match = line.match(PROJECT);
    if (match) repos.add(match[1]);
  }
}

const dates = Object.fromEntries(await Promise.all([...repos].map(async (r) => [r, await lastCommitDate(r)])));

const updated = readme.replace(BLOCK, (_, start, body, end) => {
  const lines = body.split("\n").map((line) => {
    const match = line.match(PROJECT);
    if (!match) return line;
    return `${line.replace(SUFFIX, "")} <sub>updated ${timeAgo(dates[match[1]])}</sub>`;
  });
  return start + lines.join("\n") + end;
});
await writeFile(README, updated);

for (const repo of repos) console.log(`${repo}: ${timeAgo(dates[repo])}`);
