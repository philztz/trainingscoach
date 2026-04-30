module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { access_token, refresh_token, expires_at } = req.body || {};
  if (!access_token) return res.status(400).json({ error: "Kein Token" });

  let token = access_token;

  // Token refresh if needed
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
        res.setHeader("X-New-Token", refreshed.access_token);
        res.setHeader("X-New-Refresh", refreshed.refresh_token);
        res.setHeader("X-New-Expires", refreshed.expires_at);
      }
    } catch (e) {}
  }

  try {
    const r = await fetch(
      "https://www.strava.com/api/v3/athlete/activities?per_page=20",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const activities = await r.json();
    if (!r.ok) throw new Error(activities.message || "Strava API Fehler");

    const mapped = activities.map((a) => {
      // Estimate TSS from available data
      // If watts available: TSS = (sec * NP * IF) / (FTP * 3600) * 100
      // Fallback: suffer_score or HR-based estimate
      const movingSec = a.moving_time || 0;
      const avgWatts = a.weighted_average_watts || a.average_watts || null;
      const sufferScore = a.suffer_score || a.relative_effort || null;

      // Simple IF estimate from HR if no power
      let tssEstimate = null;
      if (sufferScore) {
        tssEstimate = Math.round(sufferScore);
      } else if (movingSec > 0 && a.average_heartrate) {
        // HR-based TSS approximation (rough)
        const hrRatio = Math.min(a.average_heartrate / 170, 1.1);
        tssEstimate = Math.round((movingSec / 3600) * hrRatio * hrRatio * 100);
      }

      return {
        id: a.id,
        name: a.name,
        date: a.start_date_local?.slice(0, 10),
        type: mapType(a.sport_type || a.type),
        sport_type: a.sport_type || a.type,
        duration: Math.round(movingSec / 60),
        elapsed: a.elapsed_time ? Math.round(a.elapsed_time / 60) : null,
        km: a.distance ? Math.round(a.distance / 100) / 10 : null,
        hm: a.total_elevation_gain ? Math.round(a.total_elevation_gain) : null,
        hr: a.average_heartrate ? Math.round(a.average_heartrate) : null,
        hr_max: a.max_heartrate ? Math.round(a.max_heartrate) : null,
        watts: avgWatts ? Math.round(avgWatts) : null,
        watts_max: a.max_watts ? Math.round(a.max_watts) : null,
        cadence: a.average_cadence ? Math.round(a.average_cadence) : null,
        kj: a.kilojoules ? Math.round(a.kilojoules) : null,
        suffer_score: sufferScore,
        tss_estimate: tssEstimate,
        rpe_strava: a.perceived_exertion || null,
        trainer: a.trainer || false,
        pr_count: a.pr_count || 0,
        label: a.name,
      };
    });

    res.json({ activities: mapped, new_token: token !== access_token ? token : null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

function mapType(stravaType) {
  const map = {
    Ride: "ride", VirtualRide: "ride", MountainBikeRide: "ride",
    GravelRide: "ride", EBikeRide: "ride", Velomobile: "ride",
    Run: "run", TrailRun: "run", Walk: "mobility", Hike: "mobility",
    WeightTraining: "strength", Workout: "strength", CrossFit: "strength",
    Yoga: "mobility", Swim: "mobility", Rowing: "intervals",
    Elliptical: "mobility", StairStepper: "strength",
  };
  return map[stravaType] || "ride";
}
