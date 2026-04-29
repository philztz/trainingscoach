module.exports = function handler(req, res) {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const appUrl = process.env.APP_URL;
  const redirectUri = `${appUrl}/api/strava-callback`;
  const scope = "activity:read_all";

  const url = `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}`;
  res.redirect(url);
};
