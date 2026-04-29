module.exports = async function handler(req, res) {
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
};
