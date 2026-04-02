import axios from "axios";

const BASE = "https://gitlab.com/api/v4";

// simple in-memory cache
let cache = {};
let lastFetch = 0;

export default async function handler(req, res) {
  const { user } = req.query;
  const token = process.env.GITLAB_TOKEN;

  if (!user) {
    return res.status(400).send("Missing user parameter");
  }

  try {
    // serve from cache (1 hour)
    if (Date.now() - lastFetch < 3600000 && cache[user]) {
      return sendSVG(res, cache[user], user);
    }

    // 1. get user id
    const userRes = await axios.get(`${BASE}/users?username=${user}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const gitlabUser = userRes.data[0];
    if (!gitlabUser) {
      return res.status(404).send("User not found");
    }

    // 2. get events (recent activity)
    const eventsRes = await axios.get(
      `${BASE}/users/${gitlabUser.id}/events?per_page=100`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    const events = eventsRes.data;

    // stats calculation
    let commits = 0;
    let projectSet = new Set();
    let activeDays = new Set();

    events.forEach((e) => {
      if (e.action_name === "pushed to") {
        commits++;
        projectSet.add(e.project_id);

        const date = new Date(e.created_at).toISOString().split("T")[0];

        activeDays.add(date);
      }
    });

    const stats = {
      commits,
      projects: projectSet.size,
      activeDays: activeDays.size,
    };

    // update cache
    cache[user] = stats;
    lastFetch = Date.now();

    return sendSVG(res, stats, user);
  } catch (err) {
    console.error(err?.response?.data || err.message);
    return res.status(500).send("Error fetching GitLab data");
  }
}

// SVG generator
function sendSVG(res, stats, user) {
  const svg = `
  <svg width="420" height="160" xmlns="http://www.w3.org/2000/svg">
    <style>
      .title { font: bold 16px sans-serif; fill: #fc6d26; }
      .text { font: 14px sans-serif; fill: #333; }
      .label { font: 12px sans-serif; fill: #777; }
    </style>

    <rect width="100%" height="100%" fill="#ffffff" rx="10" ry="10"/>

    <text x="20" y="30" class="title">GitLab Stats (${user})</text>

    <text x="20" y="65" class="text">Commits (recent): ${stats.commits}</text>
    <text x="20" y="90" class="text">Contributed Projects: ${stats.projects}</text>
    <text x="20" y="115" class="text">Active Days: ${stats.activeDays}</text>

    <text x="20" y="140" class="label">Based on recent activity (~90 days)</text>
  </svg>
  `;

  res.setHeader("Content-Type", "image/svg+xml");
  res.send(svg);
}
