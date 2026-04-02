import axios from "axios";

const BASE = "https://gitlab.com/api/v4";

// simple in-memory cache
let cache = {};
let lastFetch = 0;

export default async function handler(req, res) {
  const { user } = req.query;
  const token = process.env.GITLAB_TOKEN;

  if (!user) {
    return res.status(400).send("Missing user");
  }

  try {
    // cache for 1 hour
    if (Date.now() - lastFetch < 3600000 && cache[user]) {
      return sendSVG(res, cache[user], user);
    }

    // 1. get user id
    const userRes = await axios.get(`${BASE}/users?username=${user}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const gitlabUser = userRes.data[0];
    if (!gitlabUser) throw new Error("User not found");

    // 2. get events (recent activity)
    const eventsRes = await axios.get(
      `${BASE}/users/${gitlabUser.id}/events?per_page=100`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    const events = eventsRes.data;

    let commits = 0;
    let mergeRequests = 0;

    events.forEach((e) => {
      if (e.action_name === "pushed to") commits++;
      if (e.action_name === "merged") mergeRequests++;
    });

    // 3. get projects
    const projectsRes = await axios.get(
      `${BASE}/users/${gitlabUser.id}/projects?per_page=100`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    const stats = {
      commits,
      mergeRequests,
      projects: projectsRes.data.length,
    };

    cache[user] = stats;
    lastFetch = Date.now();

    return sendSVG(res, stats, user);
  } catch (err) {
    return res.status(500).send("Error fetching GitLab data");
  }
}

// SVG generator
function sendSVG(res, stats, user) {
  const svg = `
  <svg width="420" height="140" xmlns="http://www.w3.org/2000/svg">
    <style>
      .title { font: bold 16px sans-serif; fill: #fc6d26; }
      .text { font: 14px sans-serif; fill: #333; }
    </style>

    <text x="20" y="30" class="title">GitLab Stats (${user})</text>

    <text x="20" y="60" class="text">Commits (recent): ${stats.commits}</text>
    <text x="20" y="85" class="text">Merge Requests: ${stats.mergeRequests}</text>
    <text x="20" y="110" class="text">Projects: ${stats.projects}</text>
  </svg>
  `;

  res.setHeader("Content-Type", "image/svg+xml");
  res.send(svg);
}
