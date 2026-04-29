export default function handler(req, res) {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const appUrl = process.env.APP_URL;
  const redirectUri = `${appUrl}/api/strava-callback`;
  const scope = "activity:read_all";

  const url = `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}`;
  res.redirect(url);
}

export default async function handler(req, res) {
  const { code, error } = req.query;
  const appUrl = process.env.APP_URL;

  if (error || !code) {
    return res.redirect(`${appUrl}/#strava_error=${error || "no_code"}`);
  }

  try {
    const response = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.access_token) {
      throw new Error(data.message || "Token-Austausch fehlgeschlagen");
    }

    // Pass tokens back to app via URL hash (stays client-side only)
    const params = new URLSearchParams({
      strava_token: data.access_token,
      strava_refresh: data.refresh_token,
      strava_expires: data.expires_at,
      strava_athlete: data.athlete?.firstname || "",
    });

    res.redirect(`${appUrl}/#${params.toString()}`);
  } catch (err) {
    res.redirect(`${appUrl}/#strava_error=${encodeURIComponent(err.message)}`);
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { access_token, refresh_token, expires_at } = req.body || {};

  if (!access_token) return res.status(400).json({ error: "Kein Token" });

  let token = access_token;

  // Refresh token if expired
  if (expires_at && Date.now() / 1000 > expires_at - 300) {
    try {
      const r = await fetch("https://www.strava.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: process.env.STRAVA_CLIENT_ID,
          client_secret: process.env.STRAVA_CLIENT_SECRET,
          refresh_token,
          grant_type: "refresh_token",
        }),
      });
      const refreshed = await r.json();
      if (refreshed.access_token) {
        token = refreshed.access_token;
        // Return new token info so client can save it
        res.setHeader("X-New-Token", refreshed.access_token);
        res.setHeader("X-New-Refresh", refreshed.refresh_token);
        res.setHeader("X-New-Expires", refreshed.expires_at);
      }
    } catch (e) {
      // Continue with old token
    }
  }

  try {
    // Fetch last 10 activities
    const r = await fetch(
      "https://www.strava.com/api/v3/athlete/activities?per_page=10",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const activities = await r.json();

    if (!r.ok) throw new Error(activities.message || "Strava API Fehler");

    // Map to our format
    const mapped = activities.map((a) => ({
      id: a.id,
      name: a.name,
      date: a.start_date_local?.slice(0, 10),
      type: mapType(a.type),
      duration: Math.round(a.moving_time / 60),
      km: a.distance ? Math.round(a.distance / 100) / 10 : null,
      hm: a.total_elevation_gain ? Math.round(a.total_elevation_gain) : null,
      hr: a.average_heartrate ? Math.round(a.average_heartrate) : null,
      label: a.name,
    }));

    res.json({ activities: mapped, new_token: token !== access_token ? token : null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function mapType(stravaType) {
  const map = {
    Ride: "ride", VirtualRide: "ride", MountainBikeRide: "ride", GravelRide: "ride",
    Run: "run", Walk: "mobility", Hike: "mobility",
    WeightTraining: "strength", Workout: "strength",
    Yoga: "mobility", Swim: "mobility",
  };
  return map[stravaType] || "ride";
}
